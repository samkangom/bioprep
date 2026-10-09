// Supabase backend. Reads go through row-level security; scoring and all staff writes go through SQL functions.
// Secrets (correct answers, explanations, Socratic prompts) are never selectable by students.
import { getSupabase } from '../lib/supabase'
import { AppError } from '../errors'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config'
import { validateVideo, validateImage, xhrUpload } from '../media'

const sb = () => getSupabase()
const must = ({ data, error }) => {
  if (error) throw Object.assign(new AppError(error.code || 'db_error', error.message), { raw: error })
  return data
}

const toUser = (p) => p && ({
  id: p.id, phone: p.phone, name: p.name, year: p.exam_year ? String(p.exam_year) : '2027',
  role: p.role, onboarded: p.onboarded, language: p.language,
})
const PROFILE_COLS = 'id,role,name,phone,exam_year,language,onboarded'
async function loadProfile() {
  const { data: s } = await sb().auth.getSession()
  const uid = s.session?.user?.id
  if (!uid) return null
  const rows = must(await sb().from('profiles').select(PROFILE_COLS).eq('id', uid))
  return toUser(rows[0]) || null
}
const e164 = (phone) => '+91' + phone

export const auth = {
  getUser: loadProfile,
  async sendOtp(phone) { must(await sb().auth.signInWithOtp({ phone: e164(phone) }).then((r) => ({ data: r.data, error: r.error }))) },
  async verifyOtp(phone, token) {
    must(await sb().auth.verifyOtp({ phone: e164(phone), token, type: 'sms' }))
    return loadProfile()
  },
  async completeProfile({ name, year }) {
    must(await sb().rpc('complete_profile', { p_name: name.trim() || 'Student', p_exam_year: Number(year) || null }))
    return loadProfile()
  },
  async signOut() { await sb().auth.signOut() },
  onChange(cb) {
    const { data } = sb().auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') cb(null) })
    return () => data.subscription.unsubscribe()
  },
}

const toTest = (t, qids) => ({
  id: t.id, title: t.title, kind: t.kind, duration: t.duration_minutes, price: t.price_inr, published: t.published, qids,
})
const toQuestion = (q, video) => ({
  id: q.id, subject: q.subject, chapter: q.chapter, difficulty: q.difficulty, text: q.text, options: q.options,
  imagePath: q.image_path || null, status: q.status, video: video ?? null,
})
const toAttempt = (a, rows) => {
  const answers = {}, times = {}, results = {}
  for (const r of rows) {
    if (r.selected !== null) answers[r.question_id] = r.selected
    times[r.question_id] = r.time_seconds
    results[r.question_id] = r.selected === null ? 'skip' : r.is_correct ? 'right' : 'wrong'
  }
  return {
    id: a.id, testId: a.test_id, answers, times, results, correct: a.correct, wrong: a.wrong, skipped: a.skipped,
    score: a.score, max: a.max_score, at: Date.parse(a.submitted_at),
  }
}
const ATTEMPT_COLS = 'id,test_id,submitted_at,correct,wrong,skipped,score,max_score'
const ANSWER_COLS = 'attempt_id,question_id,selected,is_correct,time_seconds'

async function questionsAndTests(isStaff) {
  const [tests, tq, qs, secrets] = await Promise.all([
    sb().from('tests').select('id,title,kind,duration_minutes,price_inr,published').order('created_at'),
    sb().from('test_questions').select('test_id,question_id,position').order('position'),
    sb().from('questions').select('id,subject,chapter,difficulty,text,options,image_path,status').order('created_at'),
    isStaff ? sb().from('question_secrets').select('question_id,video_path') : Promise.resolve({ data: [] }),
  ])
  const byTest = {}
  must(tq).forEach((r) => (byTest[r.test_id] ||= []).push(r.question_id))
  const video = Object.fromEntries((secrets.data || []).map((s) => [s.question_id, s.video_path]))
  return {
    tests: must(tests).map((t) => toTest(t, byTest[t.id] || [])),
    questions: must(qs).map((q) => toQuestion(q, video[q.id])),
  }
}

export const data = {
  async loadAll(user) {
    const staff = user.role !== 'student'
    const [qt, atts, ans, unl, free, rev] = await Promise.all([
      questionsAndTests(staff),
      sb().from('attempts').select(ATTEMPT_COLS).eq('user_id', user.id).not('submitted_at', 'is', null).order('submitted_at', { ascending: false }),
      sb().from('attempt_answers').select(ANSWER_COLS),
      sb().from('unlocks').select('test_id').eq('user_id', user.id).is('revoked_at', null),
      sb().from('free_explanation_uses').select('question_id').eq('user_id', user.id),
      sb().from('revision_items').select('question_id').eq('user_id', user.id),
    ])
    const mine = must(atts)
    const rowsByAttempt = {}
    must(ans).forEach((r) => (rowsByAttempt[r.attempt_id] ||= []).push(r))
    return {
      ...qt,
      attempts: mine.map((a) => toAttempt(a, rowsByAttempt[a.id] || [])),
      unlocked: must(unl).map((r) => r.test_id),
      freeUsed: must(free).map((r) => r.question_id),
      revision: must(rev).map((r) => r.question_id),
    }
  },
  async startAttempt(testId) { return must(await sb().rpc('start_attempt', { p_test: testId })) },
  async submitAttempt({ attemptId, answers, times }) {
    const a = must(await sb().rpc('submit_attempt', { p_attempt: attemptId, p_answers: answers, p_times: times }))
    const rows = must(await sb().from('attempt_answers').select(ANSWER_COLS).eq('attempt_id', attemptId))
    return toAttempt({ id: a.id, test_id: a.test_id, correct: a.correct, wrong: a.wrong, skipped: a.skipped, score: a.score, max_score: a.max, submitted_at: a.submitted_at }, rows)
  },
  async getQuestionForEdit(id) {
    const q = must(await sb().rpc('admin_get_question', { p_id: id }))
    return {
      ...q, video: q.videoPath || null,
      socratic: q.socratic.map((s) => ({ ...s, keys: s.keys || [] })),
    }
  },
  async upsertQuestion(q) {
    const payload = {
      id: q.id, subject: q.subject, chapter: q.chapter, difficulty: q.difficulty, text: q.text, options: q.options,
      correct: q.correct, explanation: q.explanation, whyWrong: q.whyWrong, recap: q.recap, ncert: q.ncert,
      caption: q.caption, videoPath: [q.videoPath, q.video].find((v) => v && !String(v).startsWith('blob:')) ?? null, imagePath: q.imagePath ?? null, status: q.status,
      socratic: q.socratic.map((s) => ({ ask: s.ask, keys: s.keys, hint: s.hint, good: s.good, sample: s.sample, choices: s.choices || [] })),
    }
    must(await sb().rpc('admin_upsert_question', { p: payload }))
  },
  async upsertTest(t) {
    must(await sb().rpc('admin_upsert_test', { p: { id: t.id, title: t.title, kind: t.kind, duration: t.duration, price: t.price, published: t.published, qids: t.qids } }))
  },
  async setRevision(qid, on, userId) {
    if (on) must(await sb().from('revision_items').upsert({ user_id: userId, question_id: qid }, { onConflict: 'user_id,question_id', ignoreDuplicates: true }))
    else must(await sb().from('revision_items').delete().eq('question_id', qid).eq('user_id', userId))
  },
  async refreshQuestionsAndTests(user) { return questionsAndTests(user.role !== 'student') },
}

data.refreshCatalog = (user) => questionsAndTests(user.role !== 'student')

// ---- media (Supabase Storage). Videos: private bucket, staff only. Diagrams: public read, staff write. ----
async function upload(bucket, file, path, { onProgress, signal }) {
  const { data } = await sb().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new AppError('not_authenticated')
  await xhrUpload({
    url: `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, body: file, onProgress, signal,
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': file.type || 'video/mp4', 'x-upsert': 'false', 'cache-control': 'max-age=3600' },
  })
}
export const media = {
  async uploadVideo(file, { questionId, onProgress, signal }) {
    const bad = await validateVideo(file)
    if (bad) throw new AppError('invalid_file', bad)
    const path = `${questionId}/${crypto.randomUUID()}.mp4`
    await upload('videos', new Blob([file], { type: 'video/mp4' }), path, { onProgress, signal })
    return { path, previewUrl: await media.previewUrl(path) }
  },
  async uploadImage(file, { onProgress, signal }) {
    const bad = await validateImage(file)
    if (bad) throw new AppError('invalid_file', bad)
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type]
    const path = `${crypto.randomUUID()}.${ext}`
    await upload('diagrams', file, path, { onProgress, signal })
    return { path, previewUrl: media.imageUrl(path) }
  },
  async previewUrl(path) {
    const { data, error } = await sb().storage.from('videos').createSignedUrl(path, 600)
    if (error) throw new AppError('storage_error', error.message)
    return data.signedUrl
  },
  imageUrl: (path) => (path ? sb().storage.from('diagrams').getPublicUrl(path).data.publicUrl : null),
  async removeVideo(path) { if (path) await sb().storage.from('videos').remove([path]) },
  async removeImage(path) { if (path) await sb().storage.from('diagrams').remove([path]) },
}
