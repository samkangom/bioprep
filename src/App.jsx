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
import Privacy from './views/Privacy.jsx'
import { LANGUAGES } from './i18n'
import Admin from './views/Admin.jsx'

export default function App() {
  const a = useApp()
  const { user, role, setRole, route, go, theme, setTheme, fast, setFast, freeLeft, toast, mock, boot, t, lang, setLang } = a
  const ready = !!user && user.onboarded
  const staff = mock || (user && user.role !== 'student')
  const inTest = route.name === 'test'
  const dark = theme === 'dark' || (!theme && window.matchMedia?.('(prefers-color-scheme: dark)').matches)

  let page
  if (boot === 'loading') page = <Loading label="Loading BioPrep…" />
  else if (boot === 'error') page = <div className="wrap"><ErrorState message={a.bootError} onRetry={a.retryBoot} /></div>
  else if (route.name === 'privacy') page = <Privacy />
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
          <button className="brand" onClick={() => { setRole('student'); go('home') }} aria-label={t('nav.homeAria', { app: APP_NAME })}>
            <span className="brand-mark">B</span>{APP_NAME}
          </button>
          <div className="grow" />
          {ready && (
            <>
              {staff && (
                <div className="seg" role="group" aria-label={mock ? 'Demo role' : 'View as'}>
                  <button aria-pressed={role === 'student'} onClick={() => { setRole('student'); go('home') }}>{t('nav.student')}</button>
                  <button aria-pressed={role === 'admin'} onClick={() => setRole('admin')}>{mock ? t('nav.admin') : t('nav.staff')}</button>
                </div>
              )}
              {role === 'student' && <span className="pill accent hide-sm" title="Free plan allowance">{t('nav.freeLeft', { n: freeLeft })}</span>}
              {mock && <label className="toggle hide-sm"><input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} />{t('nav.demoSpeed')}</label>}
            </>
          )}
          <select className="input" style={{ width: 'auto', minHeight: 44 }} aria-label={t('lang.label')} value={lang} onChange={(e) => setLang(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code} disabled={!l.ready}>{l.label}{l.ready ? '' : ` ${t('lang.soon')}`}</option>)}
          </select>
          <button className="icon-btn" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={t('nav.darkMode')}><Icon n={dark ? 'sun' : 'moon'} /></button>
          {ready && role === 'student' && !inTest && <button className="btn sm" onClick={() => go('profile')}>{(user.name || t('nav.profile')).split(' ')[0]}</button>}
          {user && !inTest && <button className="icon-btn" onClick={a.signOut} aria-label={t('nav.signOut')}><Icon n="logout" /></button>}
        </div>
      </header>
      <main>{page}</main>
      {!inTest && (
        <div className="footer">
          {ready && mock ? <span>{t('footer.prototype')}</span> : <span />}
          <span className="row" style={{ gap: 16 }}>
            <button className="link" onClick={() => go('privacy')}>{t('footer.privacy')}</button>
            {ready && mock && <button className="link" onClick={a.resetDemo}>{t('footer.reset')}</button>}
          </span>
        </div>
      )}
      {a.paywall && <Paywall testId={a.paywall} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}
