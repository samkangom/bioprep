import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import { Icon, Loading, ErrorState, fmt, inr } from '../ui.jsx'
import { shuffle } from '../../shared/tutor-core.js'
import { MAX_HINTS } from '../../shared/rules.js'
import { apiDriver, mockDriver } from '../tutorDriver.js'
import { describeError } from '../errors'

const STAGES = ['Recall', 'Reason', 'Apply']

export default function Solution({ attemptId, qid }) {
  const { attempts, tests, questions, go, isUnlocked, freeLeft } = useApp()
  const a = attempts.find((x) => x.id === attemptId)
  const test = tests.find((t) => t.id === a?.testId)
  const q = questions.find((x) => x.id === qid)
  if (!a || !q || !test) return <div className="wrap"><ErrorState message="We could not find that solution." onRetry={() => go('home')} retryLabel="Back to tests" /></div>
  const ids = test.qids
  const idx = ids.indexOf(q.id)
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
      <Workspace key={q.id} q={q} idx={idx} mine={a.answers[q.id]} result={a.results?.[q.id]} test={test} attemptId={attemptId} />
    </div>
  )
}

function QuestionCard({ q, idx, mine, correct }) {
  const known = correct !== undefined
  return (
    <section className="card stack">
      <div className="row"><span className="pill">{q.subject}</span><span className="muted small">{q.chapter}</span></div>
      <p className="qtext">{idx + 1}. {q.text}</p>
      <div className="opts" style={{ marginTop: 0 }}>
        {q.options.map((o, i) => {
          const right = known && i === correct, picked = i === mine
          return (
            <div key={i} className={'opt' + (right ? ' right' : picked && known ? ' wrongpick' : '')} style={{ cursor: 'default', fontSize: 16 }}>
              <span className="letter">{'ABCD'[i]}</span><span>{o}</span>
              {right && <span className="tag" style={{ color: 'var(--good)' }}><Icon n="check" s={14} />Correct</span>}
              {picked && known && !right && <span className="tag" style={{ color: 'var(--bad)' }}><Icon n="x" s={14} />Your answer</span>}
              {picked && !known && <span className="tag"><Icon n="flag" s={14} />Your answer</span>}
            </div>
          )
        })}
      </div>
      {mine === undefined && <p className="small muted">You skipped this question.</p>}
    </section>
  )
}

// Opens the explanation through the driver (the server in real mode), handles the paywall, then shows the tutor.
function Workspace({ q, idx, mine, result, test, attemptId }) {
  const app = useApp()
  const { mock, toggleRevision, revision, setPaywall, markRevealed, revealed, refreshEntitlements } = app
  const driver = useMemo(
    () => (mock ? mockDriver({ q, testId: test.id, app }) : apiDriver({ q, attemptId, onFreeUsed: refreshEntitlements })),
    [q.id, attemptId], // eslint-disable-line
  )
  const [phase, setPhase] = useState('opening') // opening | ready | locked | error
  const [session, setSession] = useState(null)
  const [err, setErr] = useState('')
  const [tries, setTries] = useState(0)
  const [explain, setExplain] = useState(null) // { answer, explanation, ... } once the session is finished
  const [videoOpen, setVideoOpen] = useState(false)

  const onRevealed = (payload) => { setExplain(payload); markRevealed(q.id, payload.answer); setVideoOpen(true) }

  useEffect(() => {
    let off = false
    setPhase('opening'); setErr('')
    driver.open()
      .then(async (s) => {
        if (off) return
        setSession(s)
        if (s.finished) { try { onRevealed(await driver.reveal()) } catch (e) { if (!off) { setErr(describeError(e)); setPhase('error'); return } } }
        if (!off) setPhase('ready')
      })
      .catch((e) => {
        if (off) return
        if (e?.status === 402 || e?.code === 'paywall') setPhase('locked')
        else { setErr(describeError(e, 'We could not open this explanation.')); setPhase('error') }
      })
    return () => { off = true }
  }, [driver, tries]) // eslint-disable-line

  const unlockedNow = app.isUnlocked(test.id)
  useEffect(() => { if (phase === 'locked' && unlockedNow) setTries((n) => n + 1) }, [unlockedNow]) // eslint-disable-line

  const correct = explain?.answer.index ?? revealed[q.id]?.index
  if (phase === 'opening') return <div className="sol"><QuestionCard q={q} idx={idx} mine={mine} correct={correct} /><section className="card"><Loading label="Opening your explanation…" /></section></div>
  if (phase === 'error') return <div className="sol"><QuestionCard q={q} idx={idx} mine={mine} correct={correct} /><section className="card"><ErrorState message={err} onRetry={() => setTries((n) => n + 1)} /></section></div>
  if (phase === 'locked') {
    return (
      <div className="sol">
        <QuestionCard q={q} idx={idx} mine={mine} correct={correct} />
        <section className="card stack" style={{ alignItems: 'flex-start' }}>
          <span className="pill accent"><Icon n="lock" s={14} />Locked</span>
          <h2>You have used your free explanations</h2>
          <p className="muted">Your result for this question stays visible: {result === 'right' ? 'you got it right' : result === 'wrong' ? 'you got it wrong' : 'you skipped it'}. Unlock <b>{test.title}</b> for {inr(test.price)} to open the tutor, the correct answer, the full explanation and the video for every question.</p>
          <button className="btn accent" onClick={() => setPaywall(test.id)}>Unlock for {inr(test.price)}</button>
        </section>
      </div>
    )
  }

  const paid = session.access === 'paid' || session.access === 'staff'
  return (
    <div className="sol">
      <div className="stack">
        <QuestionCard q={q} idx={idx} mine={mine} correct={correct} />
        <Video q={q} driver={driver} open={videoOpen} caption={explain?.caption} canSkip={paid} onSkip={() => setVideoOpen(true)} />
      </div>
      <div className="stack">
        <Tutor q={q} driver={driver} session={session} explain={explain} onRevealed={onRevealed} />
        {explain && (
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => toggleRevision(q.id)}>
            {revision.includes(q.id) ? 'Saved to revision list' : 'Save to revision list'}
          </button>
        )}
      </div>
    </div>
  )
}

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

function Tutor({ q, driver, session, explain, onRevealed }) {
  const { fast } = useApp()
  const steps = session.steps
  const already = session.finished // earned in an earlier visit: no chat, straight to the explanation
  const [msgs, setMsgs] = useState(() => already ? [] : [
    { from: 'tutor', text: "Let's work this out before I show you the answer. I'll ask a couple of short questions. Take your time." },
    { from: 'tutor', text: session.ask },
  ])
  const [step, setStep] = useState(session.step || 1)
  const [choices, setChoices] = useState(session.choices || [])
  const [facts, setFacts] = useState([])
  const [hints, setHints] = useState(0)
  const [text, setText] = useState('')
  const [left, setLeft] = useState(session.secondsLeft)
  const [thinking, setThinking] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [revealErr, setRevealErr] = useState('')
  const [mode, setMode] = useState('idle') // idle | claude | scripted
  const [note, setNote] = useState('')
  const [wrap, setWrap] = useState(null)
  const [wrapLoading, setWrapLoading] = useState(false)
  const chatRef = useRef(null)
  const msgsRef = useRef(msgs); msgsRef.current = msgs
  const busyRef = useRef(false)
  const whyRef = useRef('done')
  const open = !!explain

  useEffect(() => { const el = chatRef.current; if (el) el.scrollTop = el.scrollHeight }, [msgs, thinking, open])

  // The countdown pauses while the tutor is thinking (the server measures that time too).
  useEffect(() => {
    if (open || already || thinking || revealing) return
    const id = setInterval(() => setLeft((l) => l - (fast ? 20 : 1)), 1000)
    return () => clearInterval(id)
  }, [open, already, thinking, revealing, fast])
  useEffect(() => { if (left <= 0 && !open && !already) reveal('timeout') }, [left]) // eslint-disable-line

  const addTutor = (t) => setMsgs((m) => [...m, { from: 'tutor', text: t, fresh: true }])

  // why: 'done' (the server already finished the session), 'skip', 'timeout'.
  async function reveal(why) {
    if (open || busyRef.current) return
    busyRef.current = true; whyRef.current = why
    setRevealing(true); setRevealErr('')
    try {
      if (why !== 'done') await driver.finish(why)
      const payload = await driver.reveal()
      const lead = why === 'timeout' ? "Time is up. Let's walk through it together." : why === 'skip' ? 'Okay. Here is the full explanation.' : 'You have the pieces. Here is how they fit together.'
      addTutor(lead)
      onRevealed(payload)
      const spoke = msgsRef.current.some((m) => m.from === 'me')
      if (spoke) {
        setWrapLoading(true)
        try { setWrap(await driver.wrapup(msgsRef.current)) } catch { /* wrap-up is optional */ }
        setWrapLoading(false)
      }
    } catch (e) {
      setRevealErr(describeError(e, 'We could not load the explanation.'))
    }
    busyRef.current = false
    setRevealing(false)
  }

  async function submit(kind, raw) {
    const t = (raw ?? text).trim()
    if (thinking || open || revealing) return
    if (kind === 'answer' && !t) return
    const shown = kind === 'hint' ? 'Can I get a hint?' : kind === 'unsure' ? "I'm not sure." : t
    const nextMsgs = [...msgsRef.current, { from: 'me', text: shown, kind }]
    setMsgs(nextMsgs); setText(''); setThinking(true)
    const nh = kind === 'hint' ? Math.min(MAX_HINTS, hints + 1) : hints
    if (kind === 'hint') setHints(nh)
    let res
    try {
      res = await driver.turn({ messages: nextMsgs, kind, hintLevel: nh })
    } catch (e) {
      setThinking(false)
      if (e?.code === 'expired' || e?.code === 'finished') return reveal(e.code === 'expired' ? 'timeout' : 'done')
      setMsgs((m) => m.slice(0, -1)); setText(raw ? '' : t)
      setNote(describeError(e, 'That did not go through. Please try again.'))
      return
    }
    setMode(res.mode === 'claude' ? 'claude' : 'scripted'); setNote(res.note || '')
    setThinking(false)
    setMsgs((m) => {
      const c = [...m]
      for (let i = c.length - 1; i >= 0; i--) if (c[i].from === 'me') { if (kind === 'answer' || kind === 'unsure') c[i] = { ...c[i], verdict: res.verdict }; break }
      return [...c, { from: 'tutor', text: res.reply, fresh: true }]
    })
    setChoices(res.done ? [] : shuffle(res.choices || []))
    if (res.established) setFacts((f) => (f.includes(res.established) ? f : [...f, res.established]))
    setStep(res.step)
    if (res.done) setTimeout(() => reveal('done'), 900)
  }

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit('answer') } }
  const fillSample = () => setText(driver.sample(step))

  const status =
    mode === 'claude' ? <span className="pill good"><i className="dot" />Claude is tutoring</span>
    : mode === 'scripted' ? <span className="pill accent">Built-in guide</span>
    : <span className="pill primary"><i className="dot" />Claude tutor</span>

  return (
    <section className="card tutor-card" aria-label="Socratic tutor">
      <div className="tutor-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">Socratic explanation</span>
          <div className="row" style={{ gap: 8 }}><h3>{already ? 'Your explanation' : 'Think it through'}</h3>{!already && status}</div>
        </div>
        {!open && !already && <span className={'timer ' + (left <= 30 ? 'crit' : left <= 60 ? 'warn' : '')} style={{ fontSize: 18 }} role="timer" aria-label="Attempt time left"><Icon n="clock" s={16} />{fmt(left)}</span>}
      </div>

      {!already && (
        <ol className="stages" aria-label="Progress">
          {Array.from({ length: steps }, (_, i) => {
            const state = open || i + 1 < step ? 'done' : i + 1 === step ? 'now' : ''
            return <li key={i} className={state}><span className="stage-dot">{state === 'done' ? <Icon n="check" s={12} /> : i + 1}</span>{STAGES[i] || `Step ${i + 1}`}</li>
          })}
        </ol>
      )}

      {facts.length > 0 && (
        <div className="facts" aria-label="What you have worked out">
          <span className="eyebrow">You have worked out</span>
          {facts.map((f) => <span className="fact" key={f}><Icon n="check" s={13} />{f}</span>)}
        </div>
      )}

      {!already && (
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
      )}
      {note && <p className="small muted" role="status">{note}</p>}

      {!open && !already && (
        <div className="stack" style={{ gap: 10 }}>
          {choices.length > 0 && (
            <div className="choices" role="group" aria-label="Tap an answer">
              <span className="eyebrow">Tap an answer, or type your own below</span>
              {choices.map((c) => <button key={c} className="choice" disabled={thinking || revealing} onClick={() => submit('answer', c)}>{c}</button>)}
            </div>
          )}
          <div className="composer">
            <label htmlFor="ans" style={{ position: 'absolute', left: -9999 }}>Your answer</label>
            <textarea id="ans" className="input" rows={2} maxLength={500} placeholder="Type your thinking. Short is fine. Enter to send." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} disabled={thinking || revealing} />
            <button className="btn primary" onClick={() => submit('answer')} disabled={!text.trim() || thinking || revealing}>Send</button>
          </div>
          <div className="row between small" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 8 }}>
              <button className="chip-btn" onClick={() => submit('hint')} disabled={thinking || revealing || hints >= MAX_HINTS}>Give me a hint{hints ? ` (${hints}/${MAX_HINTS})` : ''}</button>
              <button className="chip-btn" onClick={() => submit('unsure')} disabled={thinking || revealing}>I am not sure</button>
              <button className="chip-btn" onClick={() => reveal('skip')} disabled={thinking || revealing}>Show me the answer</button>
            </div>
            {driver.sample && <button className="link" onClick={fillSample} disabled={thinking}>Demo: fill a sample answer</button>}
          </div>
          <p className="small muted">The tutor will not reveal the answer until you finish, or the timer ends.</p>
        </div>
      )}

      {revealing && <Loading label="Loading the explanation…" />}
      {revealErr && !open && <ErrorState message={revealErr} onRetry={() => reveal(whyRef.current)} />}

      {open && (
        <div className="explain stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          {(wrapLoading || wrap) && (
            <div className="feedback">
              <span className="eyebrow">Your thinking</span>
              {wrapLoading && <p className="muted small">Reviewing the conversation…</p>}
              {wrap?.strength && <p className="small"><b>Strong:</b> {wrap.strength}</p>}
              {wrap?.gap && <p className="small"><b>Revisit:</b> {wrap.gap}</p>}
              {wrap?.tip && <p className="small"><b>Exam tip:</b> {wrap.tip}</p>}
            </div>
          )}
          <div className="pill good" style={{ alignSelf: 'flex-start' }}><Icon n="check" s={14} />Answer: {explain.answer.letter}. {explain.answer.text}</div>
          <p>{explain.explanation}</p>
          <div className="why">
            {q.options.map((o, i) => i !== explain.answer.index && explain.whyWrong?.[i] && <div key={i}><b>{'ABCD'[i]}.</b><span>{explain.whyWrong[i]}</span></div>)}
          </div>
          {(explain.recap?.concept || explain.recap?.mistake) && (
            <div className="card" style={{ background: 'var(--surface2)', padding: 14 }}>
              {explain.recap.concept && <p className="small"><b>Key idea.</b> {explain.recap.concept}</p>}
              {explain.recap.mistake && <p className="small"><b>Common mistake.</b> {explain.recap.mistake}</p>}
            </div>
          )}
          {explain.ncert && <p className="small muted">NCERT: {explain.ncert}</p>}
        </div>
      )}
    </section>
  )
}

function Video({ q, driver, open, caption, canSkip, onSkip }) {
  const [rate, setRate] = useState(1)
  const [cc, setCc] = useState(true)
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.playbackRate = rate }, [rate, open, url])
  // Signed URLs are short-lived. If playback fails mid-way (expired link), fetch a fresh one and resume.
  const lastRetry = useRef(0)
  const onVideoError = async () => {
    if (Date.now() - lastRetry.current < 5000) return
    lastRetry.current = Date.now()
    const at = ref.current?.currentTime || 0
    try {
      const u = await driver.videoUrl()
      if (!u) return
      setUrl(u)
      setTimeout(() => { if (ref.current) ref.current.currentTime = at }, 300)
    } catch { setErr('The video link expired. Reload the page to keep watching.') }
  }
  useEffect(() => {
    if (!open) return
    let off = false
    setLoading(true); setErr('')
    driver.videoUrl().then((u) => { if (!off) setUrl(u) }).catch((e) => { if (!off) setErr(describeError(e, 'The video could not be loaded.')) }).finally(() => { if (!off) setLoading(false) })
    return () => { off = true }
  }, [open, driver])
  return (
    <section className="card stack" aria-label="Video explanation">
      <div className="row between">
        <div><span className="eyebrow">Video explanation</span><h3>Watch the concept</h3></div>
        {open && url && (
          <div className="row" style={{ gap: 8 }}>
            <div className="seg" role="group" aria-label="Playback speed">
              {[1, 1.5, 2].map((r) => <button key={r} aria-pressed={rate === r} onClick={() => setRate(r)}>{r}×</button>)}
            </div>
            <label className="toggle"><input type="checkbox" checked={cc} onChange={(e) => setCc(e.target.checked)} />Captions</label>
          </div>
        )}
      </div>
      <div className={'vid' + (open ? '' : ' locked')}>
        {open && url ? <video ref={ref} src={url} controls playsInline aria-label="Explanation video" onError={onVideoError} /> : (
          <div className="vid-fake">
            <div className="stack" style={{ alignItems: 'center', gap: 8 }}>
              <Icon n="play" s={44} />
              <b>{q.subject} · {q.chapter}</b>
              <span className="small" style={{ opacity: .8 }}>{open ? (loading ? 'Loading video…' : err || 'No video has been added for this question yet.') : 'Video placeholder'}</span>
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
      {open && url && cc && caption && <p className="small muted">Captions: {caption}</p>}
    </section>
  )
}
