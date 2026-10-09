import { useApp } from './store.jsx'
import { APP_NAME } from './data'
import { Icon, Loading, ErrorState } from './ui.jsx'
import Auth from './views/Auth.jsx'
import Home from './views/Home.jsx'
import { Instructions, TestRun } from './views/TestFlow.jsx'
import Result from './views/Result.jsx'
import Solution from './views/Solution.jsx'
import Paywall from './views/Paywall.jsx'
import Profile from './views/Profile.jsx'
import Payments from './views/Payments.jsx'
import Admin from './views/Admin.jsx'

export default function App() {
  const a = useApp()
  const { user, role, setRole, route, go, theme, setTheme, fast, setFast, freeLeft, toast, mock, boot } = a
  const ready = !!user && user.onboarded
  const staff = mock || (user && user.role !== 'student')
  const inTest = route.name === 'test'
  const dark = theme === 'dark' || (!theme && window.matchMedia?.('(prefers-color-scheme: dark)').matches)

  let page
  if (boot === 'loading') page = <Loading label="Loading BioPrep…" />
  else if (boot === 'error') page = <div className="wrap"><ErrorState message={a.bootError} onRetry={a.retryBoot} /></div>
  else if (!ready) page = <Auth />
  else if (role === 'admin') page = <Admin />
  else {
    switch (route.name) {
      case 'instructions': page = <Instructions testId={route.testId} />; break
      case 'test': page = <TestRun testId={route.testId} />; break
      case 'result': page = <Result attemptId={route.attemptId} />; break
      case 'solution': page = <Solution attemptId={route.attemptId} qid={route.qid} />; break
      case 'profile': page = <Profile />; break
      case 'payments': page = <Payments />; break
      default: page = <Home />
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <button className="brand" onClick={() => { setRole('student'); go('home') }} aria-label={`${APP_NAME} home`}>
            <span className="brand-mark">B</span>{APP_NAME}
          </button>
          <div className="grow" />
          {ready && (
            <>
              {staff && (
                <div className="seg" role="group" aria-label={mock ? 'Demo role' : 'View as'}>
                  <button aria-pressed={role === 'student'} onClick={() => { setRole('student'); go('home') }}>Student</button>
                  <button aria-pressed={role === 'admin'} onClick={() => setRole('admin')}>{mock ? 'Admin' : 'Staff'}</button>
                </div>
              )}
              {role === 'student' && <span className="pill accent hide-sm" title="Free plan allowance">Free explanations left: {freeLeft}</span>}
              {mock && <label className="toggle hide-sm"><input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} />Demo speed ×20</label>}
            </>
          )}
          <select className="input" style={{ width: 'auto', minHeight: 40 }} aria-label="Language" defaultValue="en">
            <option value="en">English</option>
            <option value="hi" disabled>हिन्दी (soon)</option>
            <option value="mni" disabled>Meiteilon (soon)</option>
          </select>
          <button className="icon-btn" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label="Toggle dark mode"><Icon n={dark ? 'sun' : 'moon'} /></button>
          {ready && role === 'student' && !inTest && <button className="btn sm" onClick={() => go('profile')}>{(user.name || 'Profile').split(' ')[0]}</button>}
          {user && !inTest && <button className="icon-btn" onClick={a.signOut} aria-label="Sign out"><Icon n="logout" /></button>}
        </div>
      </header>
      <main>{page}</main>
      {ready && mock && (
        <div className="footer">
          <span>Prototype. Sample data only.</span>
          <button className="link" onClick={a.resetDemo}>Reset demo (restore free plan)</button>
        </div>
      )}
      {a.paywall && <Paywall testId={a.paywall} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}
