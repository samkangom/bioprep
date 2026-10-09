import { useApp } from '../store.jsx'
import { inr } from '../ui.jsx'

export default function Profile() {
  const { user, attempts, tests, unlocked, freeLeft, go, revision, questions } = useApp()
  const title = (id) => tests.find((t) => t.id === id)?.title ?? id
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
      <p className="muted small">Per-test unlock price: {inr(100)}.</p>
    </div>
  )
}
