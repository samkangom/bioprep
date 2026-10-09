import { useApp } from '../store.jsx'
import { Icon } from '../ui.jsx'

const STATUS = {
  paid: { label: 'Paid', cls: 'good', icon: 'check' },
  refunded: { label: 'Refunded', cls: 'accent', icon: 'back' },
  failed: { label: 'Failed', cls: 'bad', icon: 'x' },
}
export const StatusPill = ({ status }) => {
  const s = STATUS[status] || { label: status, cls: '', icon: 'clock' }
  return <span className={'pill ' + s.cls}><Icon n={s.icon} s={14} />{s.label}</span>
}

export default function Payments() {
  const { payments, tests, go } = useApp()
  const title = (id) => tests.find((t) => t.id === id)?.title ?? 'Test'
  const support = import.meta.env?.VITE_SUPPORT_EMAIL
  return (
    <div className="wrap stack">
      <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => go('profile')}><Icon n="back" s={16} />Back to profile</button>
      <h1>Payment history</h1>
      <div className="card stack">
        {payments.length === 0 ? <p className="muted">No payments yet. When you unlock a test it will show up here.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Test</th><th>Amount</th><th>Status</th><th>Payment ID</th></tr></thead>
            <tbody>{payments.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.at).toLocaleString()}</td>
                <td>{title(p.testId)}</td>
                <td className="num">₹{(p.amountPaise / 100).toFixed(0)}</td>
                <td><StatusPill status={p.status} />{p.refundFlag && p.status === 'paid' && <div className="small muted">Refund under review</div>}</td>
                <td className="small" style={{ fontFamily: 'var(--mono)' }}>{p.paymentId || '-'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="small muted">Unlocks are per test and permanent unless a payment is refunded.{support ? <> Need help with a payment? Write to <a href={`mailto:${support}`}>{support}</a>.</> : null}</p>
      </div>
    </div>
  )
}
