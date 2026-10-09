// Offline mock backend: the original prototype, kept so the app runs with no server (USE_MOCK).
// Everything lives in localStorage. There is no security here; it is a demo only.
import { initialQuestions, initialTests, MARKS } from '../data'

const KEY = 'bioprep-demo-v1'
const clone = (v) => structuredClone(v)
let S = null

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
const isBlob = (v) => typeof v === 'string' && v.startsWith('blob:')
const stripBlob = (qs) => qs.map((q) => ({ ...q, video: isBlob(q.video) ? null : q.video, imagePath: isBlob(q.imagePath) ? null : q.imagePath }))
const state = () => {
  if (S) return S
  const s = read() || {}
  S = {
    user: s.user ?? null, profiles: s.profiles ?? {},
    questions: s.questions ?? clone(initialQuestions), tests: s.tests ?? clone(initialTests),
    unlocked: s.unlocked ?? [], payments: s.payments ?? [], freeUsed: s.freeUsed ?? [], attempts: s.attempts ?? [], revision: s.revision ?? [],
    open: {},
  }
  return S
}
const persist = () => {
  try { const { open, ...rest } = state(); localStorage.setItem(KEY, JSON.stringify({ ...rest, questions: stripBlob(rest.questions) })) } catch { /* storage may be blocked */ }
}
const snapshot = () => {
  const s = state()
  return clone({ questions: s.questions, tests: s.tests, attempts: s.attempts, unlocked: s.unlocked, freeUsed: s.freeUsed, revision: s.revision, payments: s.payments })
}
export const legacyTheme = () => read()?.theme ?? null

export const auth = {
  async getUser() { return clone(state().user) },
  async sendOtp() { /* demo: nothing is sent */ },
  async verifyOtp(phone, code) {
    if (!/^\d{4}$/.test(code)) throw new Error('Enter the 4-digit code. In this demo, any 4 digits work.')
    const s = state()
    const known = s.profiles[phone]
    s.user = known ? { ...known, id: 'mock-' + phone } : { id: 'mock-' + phone, phone, name: '', year: '2027', role: 'student', onboarded: false }
    persist()
    return clone(s.user)
  },
  async demoLogin(role) {
    const s = state()
    s.user = { id: 'mock-demo', name: 'Demo user', phone: '0000000000', year: '2027', role: role === 'admin' ? 'admin' : 'student', onboarded: true }
    persist()
    return clone(s.user)
  },
  async completeProfile({ name, year }) {
    const s = state()
    s.user = { ...s.user, name: name.trim() || 'Student', year, onboarded: true }
    s.profiles[s.user.phone] = s.user
    persist()
    return clone(s.user)
  },
  async signOut() { state().user = null; persist() },
  onChange() { return () => {} },
}

export const data = {
  async loadAll() { return snapshot() },
  async startAttempt(testId) { return 'a' + Date.now() + ':' + testId },
  async submitAttempt({ testId, answers, times }) {
    const s = state()
    const test = s.tests.find((t) => t.id === testId)
    const qs = test.qids.map((id) => s.questions.find((q) => q.id === id)).filter(Boolean)
    let correct = 0, wrong = 0
    const results = {}
    qs.forEach((q) => {
      if (answers[q.id] === undefined) { results[q.id] = 'skip'; return }
      if (answers[q.id] === q.correct) { correct++; results[q.id] = 'right' } else { wrong++; results[q.id] = 'wrong' }
    })
    const attempt = {
      id: 'a' + Date.now(), testId, answers, times, results, correct, wrong,
      skipped: qs.length - correct - wrong, score: correct * MARKS.correct + wrong * MARKS.wrong,
      max: qs.length * MARKS.correct, at: Date.now(),
    }
    s.attempts = [attempt, ...s.attempts]
    persist()
    return clone(attempt)
  },
  async upsertQuestion(q) {
    const s = state()
    s.questions = s.questions.some((x) => x.id === q.id) ? s.questions.map((x) => (x.id === q.id ? q : x)) : [...s.questions, q]
    persist()
    return snapshot()
  },
  async upsertTest(t) {
    const s = state()
    s.tests = s.tests.some((x) => x.id === t.id) ? s.tests.map((x) => (x.id === t.id ? t : x)) : [...s.tests, t]
    persist()
    return snapshot()
  },
  async getQuestionForEdit(id) { return clone(state().questions.find((q) => q.id === id)) },
  async setRevision(qid, on) {
    const s = state()
    s.revision = on ? [...new Set([...s.revision, qid])] : s.revision.filter((x) => x !== qid)
    persist()
  },
  // Demo-only helpers: entitlement lives in the browser here.
  async registerFree(qid) { const s = state(); if (!s.freeUsed.includes(qid)) { s.freeUsed.push(qid); persist() } },
  async unlock(testId) {
    const s = state()
    if (!s.unlocked.includes(testId)) {
      s.unlocked.push(testId)
      const t = s.tests.find((x) => x.id === testId)
      s.payments.unshift({ id: 'p' + Date.now(), testId, amountPaise: (t?.price ?? 100) * 100, status: 'paid', paymentId: 'demo_payment', at: Date.now(), refundFlag: false, userName: s.user?.name || 'Demo user' })
      persist()
    }
  },
  async reset() {
    const s = state()
    Object.assign(s, { unlocked: [], payments: [], freeUsed: [], attempts: [], revision: [], questions: clone(initialQuestions), tests: clone(initialTests) })
    persist()
    return snapshot()
  },
}

data.refreshCatalog = async () => { const s = snapshot(); return { questions: s.questions, tests: s.tests } }

// Demo media: files live only as object URLs for this browser session; progress is simulated.
const fakeProgress = (onProgress, signal) => new Promise((resolve, reject) => {
  let p = 0
  const id = setInterval(() => {
    if (signal?.aborted) { clearInterval(id); return reject(Object.assign(new Error('Upload cancelled'), { name: 'AbortError' })) }
    p += 20; onProgress?.(Math.min(100, p))
    if (p >= 100) { clearInterval(id); resolve() }
  }, 150)
})
export const media = {
  async uploadVideo(file, { onProgress, signal }) { await fakeProgress(onProgress, signal); const url = URL.createObjectURL(file); return { path: url, previewUrl: url } },
  async uploadImage(file, { onProgress, signal }) { await fakeProgress(onProgress, signal); const url = URL.createObjectURL(file); return { path: url, previewUrl: url } },
  async previewUrl(path) { return path },
  imageUrl: (path) => path,
  async removeVideo() {},
  async removeImage() {},
}

// Admin helpers (demo): payments are the local demo payments; refund flags only change the flag.
const money = (p) => p.status === 'paid' || p.status === 'refunded'
export const admin = {
  async overview() {
    const s = state()
    return { tests: s.tests.length, questions: s.questions.length, publishedQuestions: s.questions.filter((q) => q.status === 'published').length, attempts: s.attempts.length, students: null, activeUnlocks: s.unlocked.length }
  },
  // Real numbers computed from this browser's attempts and payments (not invented).
  async analytics() {
    const s = state()
    const tests = s.tests.map((t) => {
      const at = s.attempts.filter((a) => a.testId === t.id)
      if (!at.length) return null
      const avg = (f) => at.reduce((x, a) => x + f(a), 0) / at.length
      return { testId: t.id, title: t.title, attempts: at.length, students: 1, avgScore: +avg((a) => a.score).toFixed(1), avgMax: avg((a) => a.max), avgPct: +(avg((a) => a.score / a.max) * 100).toFixed(1), avgMinutes: +(avg((a) => Object.values(a.times || {}).reduce((x, y) => x + y, 0)) / 60).toFixed(1) }
    }).filter(Boolean)
    const per = {}
    for (const a of s.attempts) for (const [qid, r] of Object.entries(a.results || {})) {
      const o = (per[qid] ||= { shown: 0, answered: 0, correct: 0, skipped: 0, secs: 0 })
      o.shown++; o.secs += a.times?.[qid] || 0
      if (r === 'skip') o.skipped++; else { o.answered++; if (r === 'right') o.correct++ }
    }
    const questions = Object.entries(per).map(([qid, o]) => {
      const q = s.questions.find((x) => x.id === qid)
      return q && { questionId: qid, text: q.text, subject: q.subject, chapter: q.chapter, shown: o.shown, answered: o.answered, correct: o.correct, skipped: o.skipped, pctCorrect: o.answered ? +((o.correct / o.answered) * 100).toFixed(1) : null, avgSeconds: Math.round(o.secs / o.shown) }
    }).filter(Boolean).sort((a, b) => (a.pctCorrect ?? 101) - (b.pctCorrect ?? 101))
    const paid = s.payments.filter(money)
    const byMonth = {}
    for (const p of paid) { const m = new Date(p.at).toISOString().slice(0, 7); const o = (byMonth[m] ||= { month: m, netPaise: 0, count: 0 }); o.count++; if (p.status === 'paid') o.netPaise += p.amountPaise }
    return {
      scope: 'this browser only', tests, questions,
      revenue: { grossPaise: paid.reduce((x, p) => x + p.amountPaise, 0), refundedPaise: 0, paidCount: paid.length, refundFlagged: paid.filter((p) => p.refundFlag).length, manualUnlocks: 0, byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)) },
    }
  },
  async users() { return null }, // demo: the Users tab shows labelled sample rows
  async grantUnlock() {}, async setRole() {},
  async listPayments() { return clone(state().payments).map((p) => ({ ...p, studentName: p.userName, studentPhone: '00xxxxxx00' })) },
  async flagRefund(id, flag, note) { const p = state().payments.find((x) => x.id === id); if (p) { p.refundFlag = flag; p.refundNote = flag ? note : ''; persist() } },
}
