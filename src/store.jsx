import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { FREE_EXPLANATIONS } from './data'
import { backend, USE_MOCK } from './backend'
import { legacyTheme } from './backend/mock'
import { describeError } from './errors'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

const THEME_KEY = 'bioprep-theme'
const readTheme = () => { try { return localStorage.getItem(THEME_KEY) || legacyTheme() } catch { return null } }
const EMPTY = { questions: [], tests: [], attempts: [], unlocked: [], freeUsed: [], revision: [] }

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState('student') // which UI is showing. Staff can switch to the student view.
  const [boot, setBoot] = useState('loading') // loading | ready | error
  const [bootError, setBootError] = useState('')
  const [theme, setThemeState] = useState(readTheme) // null = follow system
  const [fast, setFast] = useState(false) // demo speed (mock mode only): timers run 20x
  const [route, setRoute] = useState({ name: 'home' })
  const [data, setData] = useState(EMPTY)
  const [revealed, setRevealed] = useState({}) // questionId -> { index, letter, text } once the tutor session is finished
  const [paywall, setPaywall] = useState(null) // testId or null
  const [toast, setToast] = useState(null)
  const userRef = useRef(null)
  userRef.current = user

  const setTheme = (t) => { setThemeState(t); try { t ? localStorage.setItem(THEME_KEY, t) : localStorage.removeItem(THEME_KEY) } catch { /* ignore */ } }
  const patch = (p) => setData((d) => ({ ...d, ...p }))

  useEffect(() => {
    const el = document.documentElement
    if (theme) el.setAttribute('data-theme', theme)
    else el.removeAttribute('data-theme')
  }, [theme])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const go = useCallback((name, params = {}) => {
    setRoute({ name, ...params })
    window.scrollTo?.(0, 0)
  }, [])

  // ---- session ----
  const loadAll = useCallback(async (u) => { setData(await backend.data.loadAll(u)) }, [])
  const enter = useCallback(async (u) => {
    setUser(u)
    setRole(u.role === 'student' ? 'student' : 'admin')
    if (u.onboarded) await loadAll(u)
  }, [loadAll])

  const start = useCallback(async () => {
    setBoot('loading'); setBootError('')
    try {
      const u = await backend.auth.getUser()
      if (u) await enter(u)
      setBoot('ready')
    } catch (e) {
      setBootError(describeError(e, 'We could not load your data.')); setBoot('error')
    }
  }, [enter])
  useEffect(() => {
    start()
    return backend.auth.onChange?.((u) => { if (!u && userRef.current) { setUser(null); setData(EMPTY); go('home') } })
  }, [start, go])

  const sendOtp = (phone) => backend.auth.sendOtp(phone)
  const verifyOtp = async (phone, code) => { const u = await backend.auth.verifyOtp(phone, code); await enter(u); return u }
  const demoLogin = async (r) => { const u = await backend.auth.demoLogin(r); await enter(u); go('home') }
  const completeProfile = async (p) => { const u = await backend.auth.completeProfile(p); await enter(u); go('home'); return u }
  const signOut = async () => {
    try { await backend.auth.signOut() } catch { /* signing out locally anyway */ }
    setUser(null); setRole('student'); setData(EMPTY); setRevealed({}); setPaywall(null); go('home')
  }

  // ---- entitlement (UI hints only; the server is the authority in remote mode) ----
  const freeLeft = Math.max(0, FREE_EXPLANATIONS - data.freeUsed.length)
  const isUnlocked = (testId) => data.unlocked.includes(testId)
  const canExplain = (testId, qid) => isUnlocked(testId) || data.freeUsed.includes(qid) || data.freeUsed.length < FREE_EXPLANATIONS
  // Call when a solution is opened. Registers a free explanation if needed (mock mode; the API does this in remote mode).
  const openExplanation = async (testId, qid) => {
    if (!canExplain(testId, qid)) return false
    if (USE_MOCK && !isUnlocked(testId) && !data.freeUsed.includes(qid)) {
      await backend.data.registerFree(qid)
      patch({ freeUsed: [...data.freeUsed, qid] })
    }
    return true
  }
  const unlockTest = async (testId) => {
    if (!USE_MOCK) return // real unlocks arrive via the payment webhook
    await backend.data.unlock(testId)
    patch({ unlocked: data.unlocked.includes(testId) ? data.unlocked : [...data.unlocked, testId] })
    setToast('Test unlocked. Full solutions and videos are open.')
  }
  const markRevealed = (qid, answer) => setRevealed((r) => (r[qid] ? r : { ...r, [qid]: answer }))
  const refreshEntitlements = async () => { if (userRef.current) await loadAll(userRef.current) }

  // ---- attempts ----
  const startAttempt = (testId) => backend.data.startAttempt(testId)
  const submitAttempt = async ({ testId, attemptId, answers, times }) => {
    const attempt = await backend.data.submitAttempt({ testId, attemptId, answers, times })
    patch({ attempts: [attempt, ...data.attempts.filter((a) => a.id !== attempt.id)] })
    go('result', { attemptId: attempt.id })
    return attempt
  }

  // ---- admin ----
  const refreshCatalog = async () => patch(await backend.data.refreshCatalog(userRef.current))
  const upsertQuestion = async (q) => { await backend.data.upsertQuestion(q); await refreshCatalog() }
  const upsertTest = async (t) => { await backend.data.upsertTest(t); await refreshCatalog() }
  const getQuestionForEdit = (id) => backend.data.getQuestionForEdit(id)

  const toggleRevision = async (qid) => {
    const on = !data.revision.includes(qid)
    patch({ revision: on ? [...data.revision, qid] : data.revision.filter((x) => x !== qid) })
    try { await backend.data.setRevision(qid, on, userRef.current?.id) }
    catch (e) { patch({ revision: data.revision }); setToast(describeError(e)) }
  }
  const resetDemo = async () => {
    if (!USE_MOCK) return
    setData(await backend.data.reset())
    setToast('Demo reset. Free plan restored: 2 explanations.')
    go('home')
  }

  const value = {
    mock: USE_MOCK, boot, bootError, retryBoot: start,
    user, role, setRole, theme, setTheme, fast: USE_MOCK && fast, setFast, route, go,
    ...data, freeLeft, isUnlocked, canExplain, openExplanation, unlockTest, refreshEntitlements, revealed, markRevealed,
    startAttempt, submitAttempt, upsertQuestion, upsertTest, getQuestionForEdit, refreshCatalog, toggleRevision,
    paywall, setPaywall, toast, setToast, sendOtp, verifyOtp, demoLogin, completeProfile, signOut, resetDemo,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
