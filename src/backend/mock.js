// Offline mock backend: the original prototype, kept so the app runs with no server (USE_MOCK).
// Everything lives in localStorage. There is no security here; it is a demo only.
import { initialQuestions, initialTests, MARKS } from '../data'

const KEY = 'bioprep-demo-v1'
const clone = (v) => structuredClone(v)
let S = null

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
const stripBlob = (qs) => qs.map((q) => (q.video && q.video.startsWith('blob:') ? { ...q, video: null } : q))
const state = () => {
  if (S) return S
  const s = read() || {}
  S = {
    user: s.user ?? null, profiles: s.profiles ?? {},
    questions: s.questions ?? clone(initialQuestions), tests: s.tests ?? clone(initialTests),
    unlocked: s.unlocked ?? [], freeUsed: s.freeUsed ?? [], attempts: s.attempts ?? [], revision: s.revision ?? [],
    open: {},
  }
  return S
}
const persist = () => {
  try { const { open, ...rest } = state(); localStorage.setItem(KEY, JSON.stringify({ ...rest, questions: stripBlob(rest.questions) })) } catch { /* storage may be blocked */ }
}
const snapshot = () => {
  const s = state()
  return clone({ questions: s.questions, tests: s.tests, attempts: s.attempts, unlocked: s.unlocked, freeUsed: s.freeUsed, revision: s.revision })
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
  async unlock(testId) { const s = state(); if (!s.unlocked.includes(testId)) { s.unlocked.push(testId); persist() } },
  async reset() {
    const s = state()
    Object.assign(s, { unlocked: [], freeUsed: [], attempts: [], revision: [], questions: clone(initialQuestions), tests: clone(initialTests) })
    persist()
    return snapshot()
  },
}

data.refreshCatalog = async () => { const s = snapshot(); return { questions: s.questions, tests: s.tests } }
