import { useState } from 'react'
import { useApp } from '../store.jsx'
import { Icon, Modal, inr } from '../ui.jsx'
import { describeError } from '../errors'

export default function Profile() {
  const { user, attempts, tests, unlocked, freeLeft, go, revision, questions, exportData, deleteAccount, setToast } = useApp()
  const title = (id) => tests.find((t) => t.id === id)?.title ?? id
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [typed, setTyped] = useState('')
  const [err, setErr] = useState('')

  const download = async () => {
    setBusy(true)
    try {
      const data = await exportData()
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      Object.assign(document.createElement('a'), { href: url, download: 'my-bioprep-data.json' }).click()
      URL.revokeObjectURL(url)
    } catch (e) { setToast(describeError(e, 'We could not prepare your data. Please try again.')) }
    setBusy(false)
  }
  const remove = async () => {
    setBusy(true); setErr('')
    try { await deleteAccount() } catch (e) {
      setErr(e?.code === 'last_admin' || e?.data?.error === 'last_admin' ? 'You are the only admin. Make someone else an admin first.' : describeError(e, 'We could not delete your account. Please try again.'))
      setBusy(false)
    }
  }

  return (
    <div className="wrap stack">
      <h1>{user?.name}</h1>
      <p className="muted">NEET {user?.year} · {unlocked.length ? `${unlocked.length} test(s) unlocked` : `Free plan, ${freeLeft} explanations left`}</p>
      <div className="card stack">
        <h2>Attempt history</h2>
        {attempts.length === 0 ? <p className="muted">No attempts yet. Take a test from the home screen.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Test</th><th>Date</th><th>Score</th><th /></tr></thead>
            <tbody>{attempts.map((a) => (
              <tr key={a.id}><td>{title(a.testId)}</td><td>{new Date(a.at).toLocaleString()}</td><td className="num">{a.score}/{a.max}</td>
                <td><button className="btn sm" onClick={() => go('result', { attemptId: a.id })}>Open</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <div className="card stack">
        <h2>Revision list</h2>
        {revision.length === 0 ? <p className="muted">Questions you save from a solution show up here.</p> :
          <ul>{revision.map((id) => <li key={id}>{questions.find((q) => q.id === id)?.text}</li>)}</ul>}
      </div>
      <div className="card row between">
        <div className="stack" style={{ gap: 2 }}><h2>Payments</h2><p className="muted small">Per-test unlock price: {inr(100)}.</p></div>
        <button className="btn" onClick={() => go('payments')}>Payment history</button>
      </div>
      <div className="card stack">
        <h2>Privacy</h2>
        <p className="muted small">We keep your phone number, name, exam year, birth year, answers and payments. Tutor chats are not stored. Read the <button className="link" onClick={() => go('privacy')}>privacy policy</button>.</p>
        <div className="row">
          <button className="btn" onClick={download} disabled={busy}>{busy && !asking ? 'Preparing…' : 'Download my data'}</button>
          <button className="btn danger" onClick={() => { setAsking(true); setTyped(''); setErr('') }}><Icon n="x" s={16} />Delete my account and data</button>
        </div>
      </div>
      {asking && (
        <Modal title="Delete your account?" onClose={() => !busy && setAsking(false)}>
          <div className="stack">
            <p>This permanently removes your account, attempts, answers, saved questions, unlocked tests and consent record. <b>It cannot be undone</b>, and any test you paid for will be locked again.</p>
            <p className="small muted">Payment records stay for accounting, without your name or number.</p>
            <div className="field"><label htmlFor="del">Type DELETE to confirm</label><input id="del" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></div>
            {err && <p role="alert" className="err-text"><Icon n="x" s={16} />{err}</p>}
            <div className="row">
              <button className="btn danger" disabled={typed !== 'DELETE' || busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete everything'}</button>
              <button className="btn ghost" disabled={busy} onClick={() => setAsking(false)}>Keep my account</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
