import { useApp } from '../store.jsx'
import { Bars, Donut, Icon, fmt } from '../ui.jsx'
import { optLabel } from '../../shared/labels.js'

export default function Result({ attemptId }) {
  const { attempts, tests, questions, go, isUnlocked, setPaywall, freeLeft, revealed } = useApp()
  const a = attempts.find((x) => x.id === attemptId)
  if (!a) return <div className="wrap"><p>Result not found.</p></div>
  const test = tests.find((t) => t.id === a.testId)
  const qs = test.qids.map((id) => questions.find((q) => q.id === id)).filter(Boolean)
  const state = (q) => a.results?.[q.id] ?? (a.answers[q.id] === undefined ? 'skip' : a.answers[q.id] === q.correct ? 'right' : 'wrong')
  const attempted = a.correct + a.wrong
  const accuracy = attempted ? a.correct / attempted : 0
  const totalTime = Object.values(a.times).reduce((x, y) => x + y, 0)
  const avg = totalTime / qs.length || 1

  const group = (key) => {
    const m = {}
    qs.forEach((q) => { (m[q[key]] ||= { n: 0, c: 0 }).n++; if (state(q) === 'right') m[q[key]].c++ })
    return Object.entries(m).map(([label, v]) => ({ label, value: v.c / v.n, text: `${v.c}/${v.n}` }))
  }
  const maxT = Math.max(...qs.map((q) => a.times[q.id] || 0), 1)
  const colorOf = (s) => (s === 'right' ? 'var(--good)' : s === 'wrong' ? 'var(--bad)' : 'var(--line)')

  return (
    <div className="wrap stack" style={{ gap: 20 }}>
      <div className="row between">
        <div className="stack" style={{ gap: 4 }}><span className="eyebrow">Result</span><h1>{test.title}</h1></div>
        <div className="row">
          <button className="btn" onClick={() => go('instructions', { testId: test.id })}>Retake</button>
          <button className="btn primary" onClick={() => go('home')}>Back to tests</button>
        </div>
      </div>

      <div className="grid c4">
        <div className="card stat"><b className="num">{a.score}<span className="muted" style={{ fontSize: 18 }}> / {a.max}</span></b><span className="muted small">Score</span></div>
        <div className="card stat"><b className="num">{Math.round(accuracy * 100)}%</b><span className="muted small">Accuracy on attempted</span></div>
        <div className="card stat"><b className="num">{attempted}<span className="muted" style={{ fontSize: 18 }}> / {qs.length}</span></b><span className="muted small">Attempted</span></div>
        <div className="card stat"><b className="num">{fmt(totalTime)}</b><span className="muted small">Time used</span></div>
      </div>

      <div className="grid c2">
        <section className="card stack">
          <h3>Correct, incorrect, skipped</h3>
          <div className="row" style={{ gap: 24 }}>
            <Donut center={[a.correct, 'correct']} parts={[
              { label: 'Correct', value: a.correct, color: 'var(--good)' },
              { label: 'Incorrect', value: a.wrong, color: 'var(--bad)' },
              { label: 'Skipped', value: a.skipped, color: 'var(--muted)' },
            ]} />
            <div className="stack small" style={{ gap: 6 }}>
              <span className="row" style={{ gap: 6 }}><Icon n="check" s={16} />Correct: <b>{a.correct}</b> (+{a.correct * 4})</span>
              <span className="row" style={{ gap: 6 }}><Icon n="x" s={16} />Incorrect: <b>{a.wrong}</b> ({-a.wrong})</span>
              <span className="muted">Skipped: <b>{a.skipped}</b></span>
            </div>
          </div>
        </section>
        <section className="card stack">
          <h3>Botany vs Zoology</h3>
          <Bars rows={group('subject')} />
          <h3 style={{ marginTop: 8 }}>By chapter</h3>
          <Bars rows={group('chapter')} />
        </section>
      </div>

      <section className="card stack">
        <div className="row between"><h3>Time per question</h3><span className="muted small">Average {fmt(avg)}. Bars above 1.5× average are slow.</span></div>
        <div className="tstrip" role="img" aria-label="Time spent on each question">
          {qs.map((q, n) => {
            const t = a.times[q.id] || 0
            return (
              <div className="tcol" key={q.id}>
                <span className="num">{fmt(t)}</span>
                <div style={{ height: `${Math.max(3, (t / maxT) * 70)}%`, background: colorOf(state(q)), outline: t > avg * 1.5 ? '2px solid var(--accent)' : 'none' }} />
                <span>Q{n + 1}</span>
              </div>
            )
          })}
        </div>
        <p className="small muted">Bar colour: green correct, red incorrect, grey skipped. Amber outline marks a slow question.</p>
      </section>

      <section className="card stack">
        <div className="row between">
          <h3>Review answers</h3>
          {!isUnlocked(test.id) && (
            <div className="row">
              <span className="pill accent">Free explanations left: {freeLeft}</span>
              <button className="btn accent sm" onClick={() => setPaywall(test.id)}>Unlock all solutions · ₹{test.price}</button>
            </div>
          )}
        </div>
        <div className="table-wrap"><table>
          <thead><tr><th>#</th><th>Question</th><th>Your answer</th><th>Correct</th><th>Status</th><th /></tr></thead>
          <tbody>
            {qs.map((q, n) => {
              const s = state(q)
              const mine = a.answers[q.id]
              return (
                <tr key={q.id}>
                  <td className="num">{n + 1}</td>
                  <td className="q">{q.text}<div className="muted small">{q.subject} · {q.chapter}</div></td>
                  <td>{mine === undefined ? '—' : `${optLabel(q.optionStyle, mine)}. ${q.options[mine]}`}</td>
                  <td>{revealed[q.id] ? `${optLabel(q.optionStyle, revealed[q.id].index)}. ${revealed[q.id].text}` : <span className="muted small">Shown with the explanation</span>}</td>
                  <td>{s === 'right' ? <span className="pill good"><Icon n="check" s={14} />Correct</span> : s === 'wrong' ? <span className="pill bad"><Icon n="x" s={14} />Incorrect</span> : <span className="pill">Skipped</span>}</td>
                  <td><button className="btn sm" onClick={() => go('solution', { attemptId: a.id, qid: q.id })}>Explain</button></td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      </section>
    </div>
  )
}
