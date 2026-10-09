import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { initialQuestions, initialTests, FREE_EXPLANATIONS, MARKS } from './data'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

const KEY = 'bioprep-demo-v1'
const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}
const save = (s) => {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage may be blocked */ }
}
const stripBlob = (qs) => qs.map((q) => (q.video && q.video.startsWith('blob:') ? { ...q, video: null } : q))

export function AppProvider({ children }) {
  const saved = useMemo(load, [])
  const [user, setUser] = useState(saved?.user ?? null)
  const [role, setRole] = useState('student')
  const [theme, setTheme] = useState(saved?.theme ?? null) // null = follow system
  const [fast, setFast] = useState(false) // demo speed: timers run 20x
  const [route, setRoute] = useState({ name: 'home' })
  const [questions, setQuestions] = useState(saved?.questions ?? initialQuestions)
  const [tests, setTests] = useState(saved?.tests ?? initialTests)
  const [unlocked, setUnlocked] = useState(saved?.unlocked ?? [])
  const [freeUsed, setFreeUsed] = useState(saved?.freeUsed ?? [])
  const [attempts, setAttempts] = useState(saved?.attempts ?? [])
  const [revision, setRevision] = useState(saved?.revision ?? [])
  const [paywall, setPaywall] = useState(null) // testId or null
  const [toast, setToast] = useState(null)

  useEffect(() => {
    const el = document.documentElement
    if (theme) el.setAttribute('data-theme', theme)
    else el.removeAttribute('data-theme')
  }, [theme])

  useEffect(() => {
    save({ user, theme, questions: stripBlob(questions), tests, unlocked, freeUsed, attempts, revision })
  }, [user, theme, questions, tests, unlocked, freeUsed, attempts, revision])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const go = useCallback((name, params = {}) => {
    setRoute({ name, ...params })
    window.scrollTo?.(0, 0)
  }, [])

  const freeLeft = Math.max(0, FREE_EXPLANATIONS - freeUsed.length)
  const isUnlocked = (testId) => unlocked.includes(testId)
  const canExplain = (testId, qid) => isUnlocked(testId) || freeUsed.includes(qid) || freeUsed.length < FREE_EXPLANATIONS
  // Call when a solution is opened. Registers a free explanation if needed.
  const openExplanation = (testId, qid) => {
    if (!canExplain(testId, qid)) return false
    if (!isUnlocked(testId) && !freeUsed.includes(qid)) setFreeUsed((f) => [...f, qid])
    return true
  }
  const unlockTest = (testId) => {
    setUnlocked((u) => (u.includes(testId) ? u : [...u, testId]))
    setToast('Test unlocked. Full solutions and videos are open.')
  }

  const submitAttempt = ({ testId, answers, times }) => {
    const test = tests.find((t) => t.id === testId)
    const qs = test.qids.map((id) => questions.find((q) => q.id === id)).filter(Boolean)
    let correct = 0, wrong = 0
    qs.forEach((q) => {
      if (answers[q.id] === undefined) return
      answers[q.id] === q.correct ? correct++ : wrong++
    })
    const attempt = {
      id: 'a' + Date.now(), testId, answers, times, correct, wrong,
      skipped: qs.length - correct - wrong,
      score: correct * MARKS.correct + wrong * MARKS.wrong,
      max: qs.length * MARKS.correct, at: Date.now(),
    }
    setAttempts((a) => [attempt, ...a])
    go('result', { attemptId: attempt.id })
    return attempt
  }

  const upsertQuestion = (q) => setQuestions((qs) => (qs.some((x) => x.id === q.id) ? qs.map((x) => (x.id === q.id ? q : x)) : [...qs, q]))
  const upsertTest = (t) => setTests((ts) => (ts.some((x) => x.id === t.id) ? ts.map((x) => (x.id === t.id ? t : x)) : [...ts, t]))
  const toggleRevision = (qid) => setRevision((r) => (r.includes(qid) ? r.filter((x) => x !== qid) : [...r, qid]))
  const signOut = () => { setUser(null); setRole('student'); go('home') }
  const resetDemo = () => {
    setUnlocked([]); setFreeUsed([]); setAttempts([]); setRevision([])
    setQuestions(initialQuestions); setTests(initialTests)
    setToast('Demo reset. Free plan restored: 2 explanations.')
    go('home')
  }

  const value = {
    user, setUser, role, setRole, theme, setTheme, fast, setFast, route, go,
    questions, tests, unlocked, freeUsed, freeLeft, attempts, revision,
    isUnlocked, canExplain, openExplanation, unlockTest, submitAttempt,
    upsertQuestion, upsertTest, toggleRevision, paywall, setPaywall, toast, setToast,
    signOut, resetDemo,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
