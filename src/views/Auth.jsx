import { useEffect, useState } from 'react'
import { useApp } from '../store.jsx'
import { APP_NAME } from '../data'
import { Icon } from '../ui.jsx'
import { describeError } from '../errors'

// Steps: 0 phone, 1 one-time code, 2 about you (first sign-in only).
export default function Auth() {
  const { user, mock, sendOtp, verifyOtp, completeProfile, demoLogin, signOut } = useApp()
  const [step, setStep] = useState(user && !user.onboarded ? 2 : 0)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [name, setName] = useState('')
  const [year, setYear] = useState('2027')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)
  const otpLen = mock ? 4 : 6
  const phoneOk = mock ? /^\d{10}$/ : /^[6-9]\d{9}$/

  useEffect(() => {
    if (wait <= 0) return
    const id = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])

  const run = async (fn) => {
    setErr(''); setBusy(true)
    try { await fn() } catch (e) { setErr(mock && e?.message ? e.message : describeError(e, e?.message || undefined)) }
    setBusy(false)
  }
  const send = (e) => {
    e?.preventDefault()
    if (!phoneOk.test(phone)) return setErr('Enter your 10-digit Indian mobile number.')
    run(async () => { await sendOtp(phone); setOtp(''); setWait(30); setStep(1) })
  }
  const verify = (e) => {
    e.preventDefault()
    if (otp.length !== otpLen) return setErr(`Enter the ${otpLen}-digit code.`)
    run(async () => { const u = await verifyOtp(phone, otp); if (!u.onboarded) setStep(2) })
  }
  const finish = (e) => {
    e.preventDefault()
    if (!name.trim()) return setErr('Enter your name.')
    run(() => completeProfile({ name, year }))
  }

  const title = step === 0 ? `Welcome to ${APP_NAME}` : step === 1 ? 'Enter the code' : 'About you'
  const lead = step === 0 ? 'Timed mock tests, and solutions that make you think before they tell you.'
    : step === 1 ? `We sent a ${otpLen}-digit code to +91 ${phone}.` : 'Two quick details so we can set up your prep.'

  return (
    <div className="auth card lift stack">
      <div className="stack" style={{ gap: 6 }}>
        <span className="eyebrow">NEET (UG) · Biology</span>
        <h1>{title}</h1>
        <p className="muted">{lead}</p>
      </div>

      {step === 0 && (
        <form className="stack" onSubmit={send}>
          <div className="field"><label htmlFor="phone">Mobile number</label>
            <input id="phone" className="input" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} autoComplete="tel-national" placeholder="10 digits" />
          </div>
          {err && <p role="alert" className="err-text"><Icon n="x" s={16} />{err}</p>}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
          {mock && <button className="btn" type="button" onClick={() => demoLogin('student')}>Continue with Google (demo)</button>}
        </form>
      )}

      {step === 1 && (
        <form className="stack" onSubmit={verify}>
          <div className="field"><label htmlFor="otp">{otpLen}-digit code</label>
            <input id="otp" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={otpLen} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} autoFocus />
          </div>
          {mock && <p className="small muted">Demo: any {otpLen} digits work.</p>}
          {err && <p role="alert" className="err-text"><Icon n="x" s={16} />{err}</p>}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Verify and continue'}</button>
          <div className="row between">
            <button className="link" type="button" onClick={() => { setStep(0); setErr('') }}>Change number</button>
            <button className="link" type="button" disabled={wait > 0 || busy} onClick={send}>{wait > 0 ? `Resend in ${wait}s` : 'Resend code'}</button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form className="stack" onSubmit={finish}>
          <div className="field"><label htmlFor="name">Your name</label><input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} autoFocus /></div>
          <div className="field"><label htmlFor="year">NEET attempt year</label>
            <select id="year" className="input" value={year} onChange={(e) => setYear(e.target.value)}><option>2027</option><option>2028</option><option>2029</option></select>
          </div>
          {err && <p role="alert" className="err-text"><Icon n="x" s={16} />{err}</p>}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Start preparing'}</button>
          <button className="link" type="button" onClick={signOut}>Use a different number</button>
        </form>
      )}

      {mock && step < 2 && (
        <div className="row between small muted" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <span>Just exploring?</span>
          <span className="row" style={{ gap: 12 }}>
            <button className="link" onClick={() => demoLogin('student')}>Skip as student</button>
            <button className="link" onClick={() => demoLogin('admin')}>Skip as admin</button>
          </span>
        </div>
      )}
    </div>
  )
}
