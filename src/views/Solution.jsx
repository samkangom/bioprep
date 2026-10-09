import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import { Icon, fmt, inr } from '../ui.jsx'
import { CHOICES } from '../data'
import { getSample, claudeTurn, claudeWrapUp, scriptedTurn, errorCopy } from '../tutor.js'

const ATTEMPT_SECONDS = 120
const STAGES = ['Recall', 'Reason', 'Apply']

export default function Solution({ attemptId, qid }) {
  const { attempts, tests, questions, go, canExplain, openExplanation, setPaywall, isUnlocked, freeLeft } = useApp()
  const a = attempts.find((x) => x.id === attemptId)
  const test = tests.find((t) => t.id === a?.testId)
  const q = questions.find((x) => x.id === qid)
  const allowed = a && q ? canExplain(test.id, q.id) : false

  useEffect(() => { if (a && q) openExplanation(test.id, q.id) }, [qid]) // eslint-disable-line

  if (!a || !q) return <div className="wrap"><p>Solution not found.</p></div>
  const ids = test.qids
  const idx = ids.indexOf(q.id)
  const mine = a.answers[q.id]
  const nav = (n) => go('solution', { attemptId, qid: ids[n] })

  return (
    <div className="wrap stack" style={{ gap: 18 }}>
      <div className="row between">
        <button className="btn ghost sm" onClick={() => go('result', { attemptId })}><Icon n="back" s={16} />Back to result</button>
        <div className="row">
          {!isUnlocked(test.id) && <span className="pill accent">Free explanations left: {freeLeft}</span>}
          <button className="btn sm" disabled={idx === 0} onClick={() => nav(idx - 1)}><Icon n="back" s={14} />Prev</button>
          <span className="muted small num">{idx + 1} / {ids.length}</span>
          <button className="btn sm" disabled={idx === ids.length - 1} onClick={() => nav(idx + 1)}>Next<Icon n="next" s={14} /></button>
        </div>
      </div>
      {allowed
        ? <Workspace key={q.id} q={q} idx={idx} mine={mine} testId={test.id} />
        : (
          <div className="sol">
            <QuestionCard q={q} idx={idx} mine={mine} />
            <section className="card stack" style={{ alignItems: 'flex-start' }}>
              <span className="pill accent"><Icon n="lock" s={14} />Locked</span>
              <h2>You have used your free explanations</h2>
              <p className="muted">The correct answer stays visible. Unlock <b>{test.title}</b> for {inr(test.price)} to open the tutor, the full explanation and the video for every question.</p>
              <button className="btn accent" onClick={() => setPaywall(test.id)}>Unlock for {inr(test.price)}</button>
            </section>
          </div>
        )}
    </div>
  )
}

function QuestionCard({ q, idx, mine }) {
  return (
    <section className="card stack">
      <div className="row"><span className="pill">{q.subject}</span><span className="muted small">{q.chapter}</span></div>
      <p className="qtext">{idx + 1}. {q.text}</p>
      <div className="opts" style={{ marginTop: 0 }}>
        {q.options.map((o, i) => {
          const right = i === q.correct, picked = i === mine
          return (
            <div key={i} className={'opt' + (right ? ' right' : picked ? ' wrongpick' : '')} style={{ cursor: 'default', fontSize: 16 }}>
              <span className="letter">{'ABCD'[i]}</span><span>{o}</span>
              {right && <span className="tag" style={{ color: 'var(--good)' }}><Icon n="check" s={14} />Correct</span>}
              {picked && !right && <span className="tag" style={{ color: 'var(--bad)' }}><Icon n="x" s={14} />Your answer</span>}
            </div>
          )
        })}
      </div>
      {mine === undefined && <p className="small muted">You skipped this question.</p>}
    </section>
  )
}

function Workspace({ q, idx, mine, testId }) {
  const { isUnlocked, toggleRevision, revision } = useApp()
  const [videoOpen, setVideoOpen] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const paid = isUnlocked(testId)
  return (
    <div className="sol">
      <div className="stack">
        <QuestionCard q={q} idx={idx} mine={mine} />
        <Video q={q} open={videoOpen} canSkip={paid} onSkip={() => setVideoOpen(true)} />
      </div>
      <div className="stack">
        <Tutor q={q} onReveal={() => { setRevealed(true); setVideoOpen(true) }} />
        {revealed && (
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => toggleRevision(q.id)}>
            {revision.includes(q.id) ? 'Saved to revision list' : 'Save to revision list'}
          </button>
        )}
      </div>
    </div>
  )
}

const shuffle = (a) => { const c = [...a]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]] } return c }

const VERDICT = {
  on_track: { label: 'On track', cls: 'good', icon: 'check' },
  partial: { label: 'Partly there', cls: 'accent', icon: 'bolt' },
  off_track: { label: 'Let us rethink', cls: 'accent', icon: 'bolt' },
  unsure: { label: 'Hint given', cls: 'primary', icon: 'bolt' },
}

function Say({ text, animate }) {
  const [n, setN] = useState(animate ? 0 : text.length)
  useEffect(() => {
    if (!animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(text.length); return }
    const id = setInterval(() => setN((v) => { if (v >= text.length) { clearInterval(id); return v } return v + 3 }), 16)
    return () => clearInterval(id)
  }, [text, animate])
  return <>{text.slice(0, n)}</>
}

function Tutor({ q, onReveal }) {
  const { fast } = useApp()
  const steps = q.socratic
  const [msgs, setMsgs] = useState([
    { from: 'tutor', text: "Let's work this out before I show you the answer. I'll ask a couple of short questions. Take your time." },
    { from: 'tutor', text: steps[0].ask },
  ])
  const [step, setStep] = useState(1)
  const [choices, setChoices] = useState(() => shuffle(CHOICES[q.id + ':0'] || []))
  const [scriptIdx, setScriptIdx] = useState(0)
  const [facts, setFacts] = useState([])
  const [hints, setHints] = useState(0)
  const [count, setCount] = useState(0)
  const [text, setText] = useState('')
  const [left, setLeft] = useState(ATTEMPT_SECONDS)
  const [thinking, setThinking] = useState(false)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('idle') // idle | claude | scripted
  const [note, setNote] = useState('')
  const [wrap, setWrap] = useState(null)
  const [wrapLoading, setWrapLoading] = useState(false)
  const chatRef = useRef(null)
  const ctl = useRef(null)
  const msgsRef = useRef(msgs); msgsRef.current = msgs

  useEffect(() => () => ctl.current?.abort(), [])
  useEffect(() => { const el = chatRef.current; if (el) el.scrollTop = el.scrollHeight }, [msgs, thinking, open])

  useEffect(() => {
    if (open || thinking) return
    const id = setInterval(() => setLeft((l) => l - (fast ? 20 : 1)), 1000)
    return () => clearInterval(id)
  }, [open, thinking, fast])
  useEffect(() => { if (left <= 0 && !open) reveal('timeout') }, [left]) // eslint-disable-line

  const addTutor = (t) => setMsgs((m) => [...m, { from: 'tutor', text: t, fresh: true }])

  async function reveal(why) {
    if (open) return
    ctl.current?.abort()
    setThinking(false)
    setOpen(true); onReveal()
    const lead = why === 'timeout' ? "Time is up. Let's walk through it together." : why === 'skip' ? 'Okay. Here is the full explanation.' : 'You have the pieces. Here is how they fit together.'
    if (why !== 'done') addTutor(lead)
    const sample = mode === 'scripted' ? null : await getSample()
    const spoke = msgsRef.current.some((m) => m.from === 'me')
    if (sample && spoke) {
      setWrapLoading(true)
      try {
        ctl.current = new AbortController()
        setWrap(await claudeWrapUp(sample, { q, msgs: msgsRef.current }, ctl.current.signal))
      } catch { /* wrap-up is optional */ }
      setWrapLoading(false)
    }
  }

  async function submit(kind, raw) {
    const t = (raw ?? text).trim()
    if (thinking || open) return
    if (kind === 'answer' && !t) return
    const shown = kind === 'hint' ? 'Can I get a hint?' : kind === 'unsure' ? "I'm not sure." : t
    const nextMsgs = [...msgsRef.current, { from: 'me', text: shown, kind }]
    setMsgs(nextMsgs); setText(''); setThinking(true)
    const nh = kind === 'hint' ? Math.min(3, hints + 1) : hints
    if (kind === 'hint') setHints(nh)
    const n = count + 1; setCount(n)

    let res = null
    const sample = mode === 'scripted' ? null : await getSample()
    if (sample) {
      try {
        ctl.current = new AbortController()
        res = await claudeTurn(sample, { q, msgs: nextMsgs, kind, hintLevel: nh, count: n }, ctl.current.signal)
        setMode('claude'); setNote('')
      } catch (e) {
        if (e?.code === 'cancelled') return
        setMode('scripted'); setNote(errorCopy(e?.code))
      }
    } else { setMode('scripted'); if (mode !== 'scripted') setNote('Claude is not available here, so the built-in guide is helping.') }
    if (!res) {
      res = scriptedTurn(q, scriptIdx, t, kind)
      if (res.advance) setScriptIdx((i) => i + 1)
    }
    setThinking(false)
    setMsgs((m) => {
      const c = [...m]
      for (let i = c.length - 1; i >= 0; i--) if (c[i].from === 'me') { if (kind === 'answer' || kind === 'unsure') c[i] = { ...c[i], verdict: res.verdict }; break }
      return [...c, { from: 'tutor', text: res.reply, fresh: true }]
    })
    setChoices(res.done ? [] : shuffle(res.choices?.length ? res.choices : CHOICES[q.id + ':' + (res.step - 1)] || []))
    if (res.established) setFacts((f) => (f.includes(res.established) ? f : [...f, res.established]))
    setStep(res.step)
    if (res.done) setTimeout(() => reveal('done'), 900)
  }

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit('answer') } }
  const fillSample = () => setText(steps[Math.min(step, steps.length) - 1].sample)

  const status =
    mode === 'claude' ? <span className="pill good"><i className="dot" />Claude is tutoring</span>
    : mode === 'scripted' ? <span className="pill accent">Built-in guide</span>
    : <span className="pill primary"><i className="dot" />Claude tutor</span>

  return (
    <section className="card tutor-card" aria-label="Socratic tutor">
      <div className="tutor-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">Socratic explanation</span>
          <div className="row" style={{ gap: 8 }}><h3>Think it through</h3>{status}</div>
        </div>
        {!open && <span className={'timer ' + (left <= 30 ? 'crit' : left <= 60 ? 'warn' : '')} style={{ fontSize: 18 }} role="timer" aria-label="Attempt time left"><Icon n="clock" s={16} />{fmt(left)}</span>}
      </div>

      <ol className="stages" aria-label="Progress">
        {steps.map((_, i) => {
          const state = open || i + 1 < step ? 'done' : i + 1 === step ? 'now' : ''
          return <li key={i} className={state}><span className="stage-dot">{state === 'done' ? <Icon n="check" s={12} /> : i + 1}</span>{STAGES[i] || `Step ${i + 1}`}</li>
        })}
      </ol>

      {facts.length > 0 && (
        <div className="facts" aria-label="What you have worked out">
          <span className="eyebrow">You have worked out</span>
          {facts.map((f) => <span className="fact" key={f}><Icon n="check" s={13} />{f}</span>)}
        </div>
      )}

      <div className="chat" ref={chatRef} aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={'bubble-row ' + m.from}>
            {m.from === 'tutor' && <span className="avatar" aria-hidden="true">C</span>}
            <div className="stack" style={{ gap: 4, alignItems: m.from === 'me' ? 'flex-end' : 'flex-start', minWidth: 0 }}>
              <div className={'msg ' + m.from}>{m.from === 'tutor' ? <Say text={m.text} animate={!!m.fresh && i === msgs.length - 1} /> : m.text}</div>
              {m.verdict && VERDICT[m.verdict] && <span className={'pill ' + VERDICT[m.verdict].cls} style={{ fontSize: 12 }}><Icon n={VERDICT[m.verdict].icon} s={12} />{VERDICT[m.verdict].label}</span>}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="bubble-row tutor"><span className="avatar" aria-hidden="true">C</span><div className="msg tutor typing" aria-label="Tutor is thinking"><i /><i /><i /></div></div>
        )}
      </div>
      {note && <p className="small muted" role="status">{note}</p>}

      {!open && (
        <div className="stack" style={{ gap: 10 }}>
          {choices.length > 0 && (
            <div className="choices" role="group" aria-label="Tap an answer">
              <span className="eyebrow">Tap an answer, or type your own below</span>
              {choices.map((c) => <button key={c} className="choice" disabled={thinking} onClick={() => submit('answer', c)}>{c}</button>)}
            </div>
          )}
          <div className="composer">
            <label htmlFor="ans" style={{ position: 'absolute', left: -9999 }}>Your answer</label>
            <textarea id="ans" className="input" rows={2} placeholder="Type your thinking. Short is fine. Enter to send." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} disabled={thinking} />
            <button className="btn primary" onClick={() => submit('answer')} disabled={!text.trim() || thinking}>Send</button>
          </div>
          <div className="row between small" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 8 }}>
              <button className="chip-btn" onClick={() => submit('hint')} disabled={thinking || hints >= 3}>Give me a hint{hints ? ` (${hints}/3)` : ''}</button>
              <button className="chip-btn" onClick={() => submit('unsure')} disabled={thinking}>I am not sure</button>
              <button className="chip-btn" onClick={() => reveal('skip')} disabled={thinking}>Show me the answer</button>
            </div>
            <button className="link" onClick={fillSample} disabled={thinking}>Demo: fill a sample answer</button>
          </div>
          <p className="small muted">The tutor will not reveal the answer until you finish, or the timer ends.</p>
        </div>
      )}

      {open && (
        <div className="explain stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          {(wrapLoading || wrap) && (
            <div className="feedback">
              <span className="eyebrow">Your thinking</span>
              {wrapLoading && <p className="muted small">Claude is reviewing the conversation…</p>}
              {wrap?.strength && <p className="small"><b>Strong:</b> {wrap.strength}</p>}
              {wrap?.gap && <p className="small"><b>Revisit:</b> {wrap.gap}</p>}
              {wrap?.tip && <p className="small"><b>Exam tip:</b> {wrap.tip}</p>}
            </div>
          )}
          <div className="pill good" style={{ alignSelf: 'flex-start' }}><Icon n="check" s={14} />Answer: {'ABCD'[q.correct]}. {q.options[q.correct]}</div>
          <p>{q.explanation}</p>
          <div className="why">
            {q.options.map((o, i) => i !== q.correct && <div key={i}><b>{'ABCD'[i]}.</b><span>{q.whyWrong[i]}</span></div>)}
          </div>
          <div className="card" style={{ background: 'var(--surface2)', padding: 14 }}>
            <p className="small"><b>Key idea.</b> {q.recap.concept}</p>
            <p className="small"><b>Common mistake.</b> {q.recap.mistake}</p>
          </div>
          <p className="small muted">NCERT: {q.ncert}</p>
        </div>
      )}
    </section>
  )
}

function Video({ q, open, canSkip, onSkip }) {
  const [rate, setRate] = useState(1)
  const [cc, setCc] = useState(true)
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.playbackRate = rate }, [rate, open])
  return (
    <section className="card stack" aria-label="Video explanation">
      <div className="row between">
        <div><span className="eyebrow">Video explanation</span><h3>Watch the concept</h3></div>
        {open && (
          <div className="row" style={{ gap: 8 }}>
            <div className="seg" role="group" aria-label="Playback speed">
              {[1, 1.5, 2].map((r) => <button key={r} aria-pressed={rate === r} onClick={() => setRate(r)}>{r}×</button>)}
            </div>
            <label className="toggle"><input type="checkbox" checked={cc} onChange={(e) => setCc(e.target.checked)} />Captions</label>
          </div>
        )}
      </div>
      <div className={'vid' + (open ? '' : ' locked')}>
        {open && q.video ? <video ref={ref} src={q.video} controls playsInline aria-label="Explanation video" /> : (
          <div className="vid-fake">
            <div className="stack" style={{ alignItems: 'center', gap: 8 }}>
              <Icon n="play" s={44} />
              <b>{q.subject} · {q.chapter}</b>
              <span className="small" style={{ opacity: .8 }}>{open ? 'Placeholder frame. Upload the MP4 for this question in Admin > Question bank.' : 'Video placeholder'}</span>
            </div>
          </div>
        )}
        {!open && (
          <div className="vid-over">
            <Icon n="lock" s={28} />
            <b>Video unlocks after the tutor session</b>
            <span className="small" style={{ opacity: .85 }}>Finish the guided questions, or wait for the 2:00 timer to end.</span>
            {canSkip && <button className="btn sm" onClick={onSkip} style={{ color: '#14201A' }}>Skip to video</button>}
          </div>
        )}
      </div>
      {open && cc && <p className="small muted">Captions: {q.caption}</p>}
    </section>
  )
}
