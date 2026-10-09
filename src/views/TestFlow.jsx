import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import { Icon, Modal, ErrorState, Loading, QuestionImage, fmt } from '../ui.jsx'
import { describeError } from '../errors'
import { optLabel } from '../../shared/labels.js'
import { MARKS } from '../data'

export function Instructions({ testId }) {
  const { tests, go } = useApp()
  const t = tests.find((x) => x.id === testId)
  if (!t) return null
  return (
    <div className="wrap narrow stack">
      <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => go('home')}><Icon n="back" s={16} />Back</button>
      <span className="eyebrow">{t.kind}</span>
      <h1>{t.title}</h1>
      <div className="grid c3">
        <div className="card stat"><b className="num">{t.qids.length}</b><span className="muted small">Questions</span></div>
        <div className="card stat"><b className="num">{t.duration} min</b><span className="muted small">Duration (demo length)</span></div>
        <div className="card stat"><b className="num">+{MARKS.correct} / {MARKS.wrong}</b><span className="muted small">Correct / wrong</span></div>
      </div>
      <div className="card stack">
        <h3>Before you start</h3>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Each question has four options and one correct answer. Unanswered questions score 0.</li>
          <li>The timer keeps running once you start. The test submits itself at 00:00.</li>
          <li>Use <b>Mark for review</b> to come back to a question. Marked questions still count if answered.</li>
          <li>After submitting, you get a score report and can open the solution for each question.</li>
        </ul>
      </div>
      <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => go('test', { testId })}>Start test</button>
    </div>
  )
}

// Gate: create the attempt on the server first (so the clock the server checks starts with ours), then run the test.
export function TestRun({ testId }) {
  const { tests, startAttempt, go } = useApp()
  const test = tests.find((t) => t.id === testId)
  const [attemptId, setAttemptId] = useState(null)
  const [err, setErr] = useState('')
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (!test) return
    let off = false
    setErr('')
    startAttempt(testId).then((id) => { if (!off) setAttemptId(id) }).catch((e) => { if (!off) setErr(describeError(e, 'We could not start the test.')) })
    return () => { off = true }
  }, [testId, tries]) // eslint-disable-line
  if (!test) return <div className="wrap"><ErrorState message="That test is not available." onRetry={() => go('home')} retryLabel="Back to tests" /></div>
  if (err) return <div className="wrap"><ErrorState message={err} onRetry={() => setTries((n) => n + 1)} /></div>
  if (!attemptId) return <div className="wrap"><Loading label="Getting your test ready…" /></div>
  return <Run test={test} attemptId={attemptId} />
}

function Run({ test, attemptId }) {
  const { questions, fast, submitAttempt, media } = useApp()
  const testId = test.id
  const qs = test.qids.map((id) => questions.find((q) => q.id === id)).filter(Boolean)
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState('')
  const [i, setI] = useState(0)
  const [ans, setAns] = useState({})
  const [marked, setMarked] = useState({})
  const [visited, setVisited] = useState({ [qs[0].id]: true })
  const [times, setTimes] = useState({})
  const [left, setLeft] = useState(test.duration * 60)
  const [confirm, setConfirm] = useState(false)
  const done = useRef(false)
  const curRef = useRef(qs[0].id)
  curRef.current = qs[i].id
  const q = qs[i]

  useEffect(() => {
    const step = fast ? 20 : 1
    const id = setInterval(() => {
      setLeft((l) => Math.max(0, l - step))
      setTimes((t) => ({ ...t, [curRef.current]: (t[curRef.current] || 0) + step }))
    }, 1000)
    return () => clearInterval(id)
  }, [fast])

  // Answers stay in memory until the server confirms, so a dropped connection never loses the attempt.
  const submit = async () => {
    if (done.current) return
    done.current = true
    setSubmitting(true); setSubmitErr('')
    try {
      await submitAttempt({ testId, attemptId, answers: ans, times })
    } catch (e) {
      done.current = false
      setSubmitErr(describeError(e, 'We could not submit your test.'))
      setSubmitting(false); setConfirm(true)
    }
  }
  useEffect(() => { if (left === 0) submit() }, [left]) // eslint-disable-line

  const goTo = (n) => { setI(n); setVisited((v) => ({ ...v, [qs[n].id]: true })) }
  const pick = (idx) => setAns((a) => ({ ...a, [q.id]: idx }))
  const status = (x, n) => (n === i ? 'cur ' : '') + (marked[x.id] ? 'marked' : ans[x.id] !== undefined ? 'answered' : visited[x.id] ? 'na' : '')
  const counts = {
    answered: qs.filter((x) => ans[x.id] !== undefined).length,
    marked: qs.filter((x) => marked[x.id]).length,
  }
  const cls = left <= 120 ? 'crit' : left <= 600 ? 'warn' : ''

  return (
    <>
      <div className="test-bar">
        <div className="test-bar-in">
          <div className="grow"><b>{test.title}</b> <span className="muted small">· Question {i + 1} of {qs.length}</span></div>
          <span className={'timer ' + cls} role="timer" aria-label="Time left"><Icon n="clock" />{fmt(left)}</span>
          <button className="btn primary" onClick={() => setConfirm(true)}>Submit</button>
        </div>
      </div>
      <div className="wrap">
        <div className="test-layout">
          <section className="card stack" aria-live="polite">
            <div className="row"><span className="pill">{q.subject}</span><span className="muted small">{q.chapter}</span></div>
            <p className="qtext">{i + 1}. {q.text}</p>
            <QuestionImage q={q} media={media} />
            <div className="opts" role="group" aria-label="Options">
              {q.options.map((o, idx) => (
                <button key={idx} className="opt" aria-pressed={ans[q.id] === idx} onClick={() => pick(idx)}>
                  <span className="letter">{optLabel(q.optionStyle, idx)}</span><span>{o}</span>
                </button>
              ))}
            </div>
            <div className="row between" style={{ marginTop: 8 }}>
              <div className="row">
                <button className="btn" onClick={() => setMarked((m) => ({ ...m, [q.id]: !m[q.id] }))}><Icon n="flag" s={16} />{marked[q.id] ? 'Unmark' : 'Mark for review'}</button>
                <button className="btn ghost" disabled={ans[q.id] === undefined} onClick={() => setAns((a) => { const n = { ...a }; delete n[q.id]; return n })}>Clear response</button>
              </div>
              <div className="row">
                <button className="btn" disabled={i === 0} onClick={() => goTo(i - 1)}><Icon n="back" s={16} />Previous</button>
                <button className="btn primary" disabled={i === qs.length - 1} onClick={() => goTo(i + 1)}>Save and next<Icon n="next" s={16} /></button>
              </div>
            </div>
          </section>
          <aside className="card stack">
            <h3>Question palette</h3>
            <div className="palette">
              {qs.map((x, n) => (
                <button key={x.id} className={'pal ' + status(x, n)} onClick={() => goTo(n)} aria-label={`Question ${n + 1}`}>{n + 1}</button>
              ))}
            </div>
            <div className="legend">
              <span><i style={{ background: 'var(--primary)' }} />Answered</span>
              <span><i style={{ background: 'var(--bad-soft)', borderColor: 'var(--bad)' }} />Not answered</span>
              <span><i style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)' }} />Marked</span>
              <span><i />Not visited</span>
            </div>
          </aside>
        </div>
      </div>
      {submitting && !confirm && <Modal title="Submitting your test" onClose={() => {}}><Loading label="Saving your answers…" /></Modal>}
      {confirm && (
        <Modal title="Submit test?" onClose={() => setConfirm(false)}>
          <div className="grid c3" style={{ gap: 8 }}>
            <div className="stat"><b className="num">{counts.answered}</b><span className="small muted">Answered</span></div>
            <div className="stat"><b className="num">{qs.length - counts.answered}</b><span className="small muted">Not answered</span></div>
            <div className="stat"><b className="num">{counts.marked}</b><span className="small muted">Marked</span></div>
          </div>
          <p className="muted small">{fmt(left)} left. You cannot change answers after submitting.</p>
          {submitErr && <p role="alert" className="err-text"><Icon n="x" s={16} />{submitErr} Your answers are still here. Try again.</p>}
          <div className="row"><button className="btn primary" onClick={submit} disabled={submitting}>{submitting ? 'Submitting…' : submitErr ? 'Try again' : 'Submit now'}</button><button className="btn" onClick={() => setConfirm(false)} disabled={submitting}>Keep working</button></div>
        </Modal>
      )}
    </>
  )
}
