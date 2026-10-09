import { useState } from 'react'
import { useApp } from '../store.jsx'
import { Icon, Modal, inr } from '../ui.jsx'
import { FREE_EXPLANATIONS } from '../data'

export default function Paywall({ testId }) {
  const { tests, setPaywall, unlockTest } = useApp()
  const t = tests.find((x) => x.id === testId)
  const [tab, setTab] = useState('upi')
  const [paid, setPaid] = useState(false)
  if (!t) return null
  const close = () => setPaywall(null)

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
