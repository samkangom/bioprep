import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import { Icon, Modal, Loading, inr } from '../ui.jsx'
import { FREE_EXPLANATIONS } from '../data'
import { openCheckout, waitForPaid } from '../checkout'
import { describeError } from '../errors'

export default function Paywall({ testId }) {
  const { tests, setPaywall, mock } = useApp()
  const t = tests.find((x) => x.id === testId)
  if (!t) return null
  const close = () => setPaywall(null)
  return mock ? <DemoCheckout t={t} close={close} /> : <RazorpayCheckout t={t} close={close} />
}

const Plans = ({ t }) => (
  <>
    <div className="card" style={{ background: 'var(--surface2)' }}>
      <div className="row between"><b>{t.title}</b><b className="num">{inr(t.price)}</b></div>
      <p className="muted small">One-time, for this test.</p>
    </div>
    <div className="grid c2" style={{ gap: 10 }}>
      <div className="stack small" style={{ gap: 6 }}>
        <b>Free plan</b>
        <span>Take any test</span><span>Score and analytics</span><span>{FREE_EXPLANATIONS} full explanations in total</span>
      </div>
      <div className="stack small" style={{ gap: 6 }}>
        <b>This test, unlocked</b>
        <span>Every question explained</span><span>Guided Socratic questions</span><span>Video lecture for each</span>
      </div>
    </div>
  </>
)

// Real payments: Razorpay Checkout (UPI and cards). Unlocking happens only when the verified webhook lands.
function RazorpayCheckout({ t, close }) {
  const { user, refreshEntitlements, go } = useApp()
  const [phase, setPhase] = useState('choose') // choose | starting | confirming | paid | pending | failed
  const [err, setErr] = useState('')
  const [testMode, setTestMode] = useState(false)
  const [orderId, setOrderId] = useState(null)
  const ctl = useRef(null)
  useEffect(() => () => ctl.current?.abort(), [])

  async function confirm(id) {
    setPhase('confirming'); setErr('')
    ctl.current = new AbortController()
    try {
      const status = await waitForPaid(id, { signal: ctl.current.signal })
      if (status === 'aborted') return
      if (status === 'paid') { await refreshEntitlements(); setPhase('paid') }
      else if (status === 'failed') { setErr('The payment did not go through. You have not been charged.'); setPhase('failed') }
      else setPhase('pending')
    } catch (e) { setErr(describeError(e)); setPhase('pending') }
  }
  async function pay() {
    setPhase('starting'); setErr('')
    try {
      const r = await openCheckout({ testId: t.id, user })
      setTestMode(r.testMode); setOrderId(r.orderId)
      if (r.outcome === 'dismissed') { setPhase('choose'); return }
      if (r.outcome === 'failed') { setErr(r.reason || 'The payment did not go through. You have not been charged.'); setPhase('failed'); return }
      await confirm(r.orderId)
    } catch (e) {
      const code = e?.code
      setErr(code === 'already_unlocked' ? 'This test is already unlocked.' : code === 'payments_not_configured' ? 'Payments are not available right now.' : code === 'checkout_script' ? 'We could not load the payment window. Check your connection and try again.' : describeError(e, 'We could not start the payment.'))
      setPhase('failed')
      if (code === 'already_unlocked') refreshEntitlements()
    }
  }

  if (phase === 'paid') {
    return (
      <Modal title="Payment successful" onClose={close}>
        <div className="stack">
          <span className="pill good" style={{ alignSelf: 'flex-start' }}><Icon n="check" s={14} />{inr(t.price)} paid{testMode ? ' (test mode)' : ''}</span>
          <p><b>{t.title}</b> is unlocked. Every question now opens the guided Socratic explanation and the video.</p>
          <div className="row"><button className="btn primary" onClick={close}>Continue</button><button className="btn" onClick={() => { close(); go('payments') }}>Payment history</button></div>
        </div>
      </Modal>
    )
  }
  return (
    <Modal title="Unlock full solutions" onClose={phase === 'confirming' ? () => {} : close}>
      <div className="stack">
        <Plans t={t} />
        {phase === 'confirming' && <Loading label="Confirming your payment…" />}
        {phase === 'pending' && (
          <div className="stack" role="status">
            <p><b>We have not heard back from the bank yet.</b> If money left your account, your test unlocks within a few minutes. You will see it in Payment history. You can close this window.</p>
            <div className="row"><button className="btn primary" onClick={() => confirm(orderId)}>Check again</button><button className="btn" onClick={close}>Close</button></div>
          </div>
        )}
        {err && <p role="alert" className="err-text"><Icon n="x" s={16} />{err}</p>}
        {(phase === 'choose' || phase === 'starting' || phase === 'failed') && (
          <>
            <button className="btn primary" onClick={pay} disabled={phase === 'starting'}>{phase === 'starting' ? 'Opening payment…' : phase === 'failed' ? `Try again · ${inr(t.price)}` : `Pay ${inr(t.price)} with UPI or card`}</button>
            <p className="small muted">Secure checkout by Razorpay. We never see your card or UPI details.{testMode ? ' Test mode: no real money is charged.' : ''}</p>
          </>
        )}
      </div>
    </Modal>
  )
}

// Offline demo checkout (mock mode only): no payment is taken.
function DemoCheckout({ t, close }) {
  const { unlockTest } = useApp()
  const [tab, setTab] = useState('upi')
  const [paid, setPaid] = useState(false)
  if (paid) {
    return (
      <Modal title="Payment successful" onClose={close}>
        <div className="stack">
          <span className="pill good" style={{ alignSelf: 'flex-start' }}><Icon n="check" s={14} />{inr(t.price)} paid (demo)</span>
          <p><b>{t.title}</b> is unlocked. Every question now opens the guided Socratic explanation and the video.</p>
          <button className="btn primary" onClick={close}>Continue</button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal title="Unlock full solutions" onClose={close}>
      <div className="stack">
        <Plans t={t} />
        <div className="seg" role="group" aria-label="Payment method" style={{ alignSelf: 'flex-start' }}>
          <button aria-pressed={tab === 'upi'} onClick={() => setTab('upi')}>UPI</button>
          <button aria-pressed={tab === 'card'} onClick={() => setTab('card')}>Card</button>
        </div>
        {tab === 'upi'
          ? <div className="field"><label htmlFor="upi">UPI ID</label><input id="upi" className="input" placeholder="name@bank" /></div>
          : <div className="stack"><div className="field"><label htmlFor="cn">Card number</label><input id="cn" className="input" inputMode="numeric" placeholder="Test mode, nothing is charged" /></div>
              <div className="grid c2"><div className="field"><label htmlFor="ex">Expiry</label><input id="ex" className="input" placeholder="MM/YY" /></div><div className="field"><label htmlFor="cv">CVV</label><input id="cv" className="input" placeholder="123" /></div></div></div>}
        <button className="btn primary" onClick={() => { unlockTest(t.id); setPaid(true) }}>Pay {inr(t.price)}</button>
        <p className="small muted">Demo checkout. No payment is taken.</p>
      </div>
    </Modal>
  )
}
