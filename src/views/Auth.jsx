import { useState } from 'react'
import { useApp } from '../store.jsx'
import { APP_NAME } from '../data'

export default function Auth() {
  const { setUser, setRole, go } = useApp()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [year, setYear] = useState('2027')
  const [otp, setOtp] = useState('')
  const [err, setErr] = useState('')

  const sendOtp = (e) => {
    e.preventDefault()
    if (!/^\d{10}$/.test(phone)) return setErr('Enter a 10-digit mobile number.')
    setErr(''); setStep(1)
  }
  const verify = (e) => {
    e.preventDefault()
    if (!/^\d{4}$/.test(otp)) return setErr('Enter the 4-digit code. In this demo, any 4 digits work.')
    setUser({ name: name.trim() || 'Student', phone, year }); setRole('student'); go('home')
  }
  const demo = (r) => { setUser({ name: 'Demo user', phone: '0000000000', year }); setRole(r); go('home') }

  return (
    <div className="auth card lift stack">
      <div className="stack" style={{ gap: 6 }}>
        <span className="eyebrow">NEET (UG) · Biology</span>
        <h1>{step === 0 ? `Welcome to ${APP_NAME}` : 'Enter the code'}</h1>
        <p className="muted">{step === 0 ? 'Timed mock tests, and solutions that make you think before they tell you.' : `We sent a 4-digit code to ${phone}.`}</p>
      </div>
      {step === 0 ? (
        <form className="stack" onSubmit={sendOtp}>
          <div className="field"><label htmlFor="name">Your name</label><input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
          <div className="field"><label htmlFor="phone">Mobile number</label><input id="phone" className="input" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} autoComplete="tel-national" placeholder="10 digits" /></div>
          <div className="field"><label htmlFor="year">NEET attempt year</label>
            <select id="year" className="input" value={year} onChange={(e) => setYear(e.target.value)}><option>2027</option><option>2028</option><option>2029</option></select>
          </div>
          {err && <p role="alert" style={{ color: 'var(--bad)' }}>{err}</p>}
          <button className="btn primary" type="submit">Send code</button>
          <button className="btn" type="button" onClick={() => demo('student')}>Continue with Google (demo)</button>
        </form>
      ) : (
        <form className="stack" onSubmit={verify}>
          <div className="field"><label htmlFor="otp">4-digit code</label><input id="otp" className="input" inputMode="numeric" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} autoFocus /></div>
          {err && <p role="alert" style={{ color: 'var(--bad)' }}>{err}</p>}
          <button className="btn primary" type="submit">Verify and continue</button>
          <button className="link" type="button" onClick={() => { setStep(0); setErr('') }}>Change number</button>
        </form>
      )}
      <div className="row between small muted" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <span>Just exploring?</span>
        <span className="row" style={{ gap: 12 }}>
          <button className="link" onClick={() => demo('student')}>Skip as student</button>
          <button className="link" onClick={() => demo('admin')}>Skip as admin</button>
        </span>
      </div>
    </div>
  )
}
