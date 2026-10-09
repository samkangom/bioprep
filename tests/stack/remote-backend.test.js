// Drives the real supabase-js client in src/backend/remote.js against the local stack (PGlite + RLS).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { startStack, DEV_OTP, DEV_ADMIN_PHONE } from '../../dev/stack.js'

let stack, auth, data
beforeAll(async () => {
  stack = await startStack({ shimPort: 0, apiPort: 0 })
  vi.stubEnv('VITE_SUPABASE_URL', stack.supabaseUrl)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', stack.anonKey)
  vi.stubEnv('VITE_USE_MOCK', '0')
  ;({ auth, data } = await import('../../src/backend/remote.js'))
})
afterAll(async () => { await stack.close(); vi.unstubAllEnvs() })

const signIn = async (phone) => { await auth.sendOtp(phone); return auth.verifyOtp(phone, DEV_OTP) }

describe('remote backend as a student', () => {
  let user, catalog
  it('signs in with a phone code and completes the profile once', async () => {
    user = await signIn('9811111111')
    expect(user).toMatchObject({ role: 'student', onboarded: false })
    user = await auth.completeProfile({ name: 'Meena', year: '2028' })
    expect(user).toMatchObject({ name: 'Meena', year: '2028', onboarded: true })
  })
  it('rejects a wrong code', async () => {
    await auth.sendOtp('9811111112')
    await expect(auth.verifyOtp('9811111112', '000000')).rejects.toBeTruthy()
  })
  it('loads published tests and questions without any answers', async () => {
    await auth.signOut(); user = await signIn('9811111111')
    catalog = await data.loadAll(user)
    expect(catalog.tests.map((t) => t.title).sort()).toEqual(['Biology Mock 1', 'Botany Sprint', 'Zoology Sprint'])
    expect(catalog.tests.find((t) => t.title === 'Biology Mock 1').qids).toHaveLength(10)
    expect(catalog.questions).toHaveLength(10)
    for (const q of catalog.questions) {
      expect(q).not.toHaveProperty('correct')
      expect(q).not.toHaveProperty('explanation')
      expect(q).not.toHaveProperty('socratic')
    }
    expect(catalog.unlocked).toEqual([])
  })
  it('starts, submits and scores an attempt on the server', async () => {
    const test = catalog.tests.find((t) => t.title === 'Botany Sprint')
    const id = await data.startAttempt(test.id)
    const answers = Object.fromEntries(test.qids.map((q) => [q, 1])) // option B everywhere
    const a = await data.submitAttempt({ attemptId: id, answers, times: Object.fromEntries(test.qids.map((q) => [q, 7])) })
    // Botany Sprint answers: q1 B, q2 B, q3 B, q4 C(2), q5 B -> 4 right, 1 wrong
    expect(a).toMatchObject({ correct: 4, wrong: 1, skipped: 0, score: 15, max: 20 })
    expect(Object.values(a.results).sort()).toEqual(['right', 'right', 'right', 'right', 'wrong'])
    const again = await data.loadAll(user)
    expect(again.attempts).toHaveLength(1)
    expect(again.attempts[0].times[test.qids[0]]).toBe(7)
  })
  it('keeps a revision list', async () => {
    const qid = catalog.questions[0].id
    await data.setRevision(qid, true, user.id)
    await data.setRevision(qid, true, user.id) // idempotent
    expect((await data.loadAll(user)).revision).toEqual([qid])
    await data.setRevision(qid, false, user.id)
    expect((await data.loadAll(user)).revision).toEqual([])
  })
  it('cannot use staff functions or read secrets', async () => {
    await expect(data.upsertQuestion({ subject: 'Botany', chapter: 'x', text: 'y', options: ['a', 'b', 'c', 'd'], correct: 0, status: 'draft', socratic: [] })).rejects.toThrow(/forbidden/)
    await expect(data.getQuestionForEdit(catalog.questions[0].id)).rejects.toThrow(/forbidden/)
  })
})

describe('remote backend as an admin', () => {
  it('creates, edits and publishes a question and a test', async () => {
    await auth.signOut()
    const admin = await signIn(DEV_ADMIN_PHONE)
    expect(admin.role).toBe('admin')
    const id = crypto.randomUUID()
    const q = {
      id, subject: 'Zoology', chapter: 'Neural Control', difficulty: 'Hard', text: 'Which ion rushes in during depolarisation?',
      options: ['K+', 'Na+', 'Cl-', 'Ca2+'], correct: 1, explanation: 'Voltage-gated Na+ channels open.', whyWrong: ['', '', '', ''],
      recap: { concept: 'c', mistake: 'm' }, ncert: 'Class 11', caption: '', status: 'published',
      socratic: [{ ask: 'Which channel opens first?', keys: ['sodium', 'na'], hint: 'h', good: 'g', sample: 's' }, { ask: 'So which ion moves?', keys: ['na'], hint: 'h', good: 'g', sample: 's' }],
    }
    await data.upsertQuestion(q)
    const back = await data.getQuestionForEdit(id)
    expect(back).toMatchObject({ correct: 1, status: 'published' })
    expect(back.socratic).toHaveLength(2)
    expect(back.socratic[0].keys).toEqual(['sodium', 'na'])
    await data.upsertTest({ id: crypto.randomUUID(), title: 'Neuro quiz', kind: 'Custom', duration: 3, price: 100, published: true, qids: [id] })
    const all = await data.loadAll(admin)
    expect(all.tests.map((t) => t.title)).toContain('Neuro quiz')
    expect(all.questions.find((x) => x.id === id).status).toBe('published')
  })
})
