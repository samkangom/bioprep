import { useEffect, useState } from 'react'
import { useApp } from '../store.jsx'
import { APP_NAME } from '../data'
import { Icon } from '../ui.jsx'
import { describeError } from '../errors'
import { ageOn, MIN_AGE, ADULT_AGE } from '../privacy'

// Steps: 0 phone, 1 one-time code, 2 about you (first sign-in only: age, privacy policy and, under 18, parental consent).
export default function Auth() {
  const { user, mock, t, sendOtp, verifyOtp, completeProfile, demoLogin, signOut } = useApp()
  const [step, setStep] = useState(user && !user.onboarded ? 2 : 0)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [name, setName] = useState('')
  const [year, setYear] = useState('2027')
  const [dob, setDob] = useState('')
  const [policy, setPolicy] = useState(false)
  const [gName, setGName] = useState('')
  const [gPhone, setGPhone] = useState('')
  const [rel, setRel] = useState('mother')
  const [gConsent, setGConsent] = useState(false)
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
    if (!phoneOk.test(phone)) return setErr(t('auth.err.phone'))
    run(async () => { await sendOtp(phone); setOtp(''); setWait(30); setStep(1) })
  }
  const verify = (e) => {
    e.preventDefault()
    if (otp.length !== otpLen) return setErr(t('auth.err.code', { n: otpLen }))
    run(async () => { const u = await verifyOtp(phone, otp); if (!u.onboarded) setStep(2) })
  }
  const age = dob ? ageOn(dob) : null
  const minor = age !== null && age >= MIN_AGE && age < ADULT_AGE
  const finish = (e) => {
    e.preventDefault()
    if (!name.trim()) return setErr(t('auth.err.name'))
    if (!dob || age === null || age < 0 || age > 80) return setErr(t('auth.err.dob'))
    if (age < MIN_AGE) return setErr(t('auth.err.minAge', { n: MIN_AGE }))
    if (!policy) return setErr(t('auth.err.policy'))
    if (minor) {
      if (gName.trim().length < 2) return setErr(t('auth.err.guardianName'))
      if (!/^[6-9]\d{9}$/.test(gPhone)) return setErr(t('auth.err.guardianPhone'))
      if (!gConsent) return setErr(t('auth.err.guardianConsent'))
    }
    run(() => completeProfile({ name, year, birthDate: dob, consent: policy, guardian: minor ? { name: gName, phone: gPhone, relationship: rel } : null }))
  }

  const title = step === 0 ? t('auth.welcome', { app: APP_NAME }) : step === 1 ? t('auth.enterCode') : t('auth.about')
  const lead = step === 0 ? t('auth.lead') : step === 1 ? t('auth.codeSent', { n: otpLen, phone }) : t('auth.aboutLead')
  const Err = () => err && <p role="alert" className="err-text"><Icon n="x" s={16} />{err}</p>

  return (
    <div className="auth card lift stack">
      <div className="stack" style={{ gap: 6 }}>
        <span className="eyebrow">{t('auth.eyebrow')}</span>
        <h1>{title}</h1>
        <p className="muted">{lead}</p>
      </div>

      {step === 0 && (
        <form className="stack" onSubmit={send}>
          <div className="field"><label htmlFor="phone">{t('auth.phone')}</label>
            <input id="phone" className="input" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} autoComplete="tel-national" placeholder={t('auth.phoneHint')} />
          </div>
          <Err />
          <button className="btn primary" type="submit" disabled={busy}>{busy ? t('auth.sending') : t('auth.sendCode')}</button>
          {mock && <button className="btn" type="button" onClick={() => demoLogin('student')}>Continue with Google (demo)</button>}
        </form>
      )}

      {step === 1 && (
        <form className="stack" onSubmit={verify}>
          <div className="field"><label htmlFor="otp">{t('auth.codeLabel', { n: otpLen })}</label>
            <input id="otp" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={otpLen} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} autoFocus />
          </div>
          {mock && <p className="small muted">Demo: any {otpLen} digits work.</p>}
          <Err />
          <button className="btn primary" type="submit" disabled={busy}>{busy ? t('auth.checking') : t('auth.verify')}</button>
          <div className="row between">
            <button className="link" type="button" onClick={() => { setStep(0); setErr('') }}>{t('auth.changeNumber')}</button>
            <button className="link" type="button" disabled={wait > 0 || busy} onClick={send}>{wait > 0 ? t('auth.resendIn', { n: wait }) : t('auth.resend')}</button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form className="stack" onSubmit={finish}>
          <div className="field"><label htmlFor="name">{t('auth.name')}</label><input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} autoFocus /></div>
          <div className="field"><label htmlFor="year">{t('auth.year')}</label>
            <select id="year" className="input" value={year} onChange={(e) => setYear(e.target.value)}><option>2027</option><option>2028</option><option>2029</option></select>
          </div>
          <div className="field"><label htmlFor="dob">{t('auth.dob')}</label>
            <input id="dob" className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} min="1950-01-01" max={new Date().toISOString().slice(0, 10)} autoComplete="bday" />
            <span className="small muted">{t('auth.dobHint')}</span>
          </div>
          {minor && (
            <fieldset className="stack" style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, margin: 0 }}>
              <legend className="small" style={{ fontWeight: 600, padding: '0 6px' }}>{t('auth.guardianLegend')}</legend>
              <p className="small muted">{t('auth.guardianLead')}</p>
              <div className="field"><label htmlFor="g-rel">{t('auth.guardianIs')}</label>
                <select id="g-rel" className="input" value={rel} onChange={(e) => setRel(e.target.value)}>
                  <option value="mother">{t('auth.mother')}</option><option value="father">{t('auth.father')}</option><option value="legal guardian">{t('auth.legalGuardian')}</option>
                </select>
              </div>
              <div className="field"><label htmlFor="g-name">{t('auth.guardianName')}</label><input id="g-name" className="input" value={gName} onChange={(e) => setGName(e.target.value)} maxLength={80} autoComplete="off" /></div>
              <div className="field"><label htmlFor="g-phone">{t('auth.guardianPhone')}</label><input id="g-phone" className="input" inputMode="numeric" maxLength={10} value={gPhone} onChange={(e) => setGPhone(e.target.value.replace(/\D/g, ''))} autoComplete="off" placeholder={t('auth.phoneHint')} /></div>
              <label className="toggle check"><input type="checkbox" checked={gConsent} onChange={(e) => setGConsent(e.target.checked)} /><span>{t('auth.guardianConsent')}</span></label>
            </fieldset>
          )}
          <label className="toggle check"><input type="checkbox" checked={policy} onChange={(e) => setPolicy(e.target.checked)} />
            <span>{t('auth.policyPre')}<a href="#/privacy" target="_blank" rel="noreferrer">{t('auth.policyLink')}</a>{t('auth.policyPost')}</span></label>
          <Err />
          <button className="btn primary" type="submit" disabled={busy}>{busy ? t('auth.saving') : t('auth.start')}</button>
          <button className="link" type="button" onClick={signOut}>{t('auth.otherNumber')}</button>
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
