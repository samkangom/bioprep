import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import { Bars, Icon, Modal, Loading, ErrorState, inr } from '../ui.jsx'
import { sampleUsers, UNLOCK_PRICE } from '../data'
import { describeError } from '../errors'
import { LABEL_STYLES, optLabel } from '../../shared/labels.js'
import UploadField from './UploadField.jsx'
import CsvImport from './CsvImport.jsx'
import { StatusPill } from './Payments.jsx'

const TABS = [
  ['dash', 'Dashboard', 'grid'],
  ['questions', 'Question bank', 'book'],
  ['tests', 'Tests', 'list'],
  ['analytics', 'Analytics', 'chart'],
  ['payments', 'Payments', 'list', true],
  ['users', 'Users and plans', 'users'],
]

export default function Admin() {
  const [tab, setTab] = useState('dash')
  const { mock, user } = useApp()
  const isAdmin = mock || user?.role === 'admin' // teachers manage content; money and people are admin-only
  const tabs = TABS.filter(([, , , adminOnly]) => !adminOnly || isAdmin)
  return (
    <div className="admin">
      <nav className="side" aria-label="Admin">
        {tabs.map(([k, label, icon]) => (
          <button key={k} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}><Icon n={icon} />{label}</button>
        ))}
      </nav>
      <div className="stack" style={{ gap: 20, minWidth: 0 }}>
        {tab === 'dash' && <Dash go={setTab} />}
        {tab === 'questions' && <Questions />}
        {tab === 'tests' && <Tests />}
        {tab === 'analytics' && <Analytics />}
        {tab === 'payments' && isAdmin && <PaymentsAdmin />}
        {tab === 'users' && <Users />}
      </div>
    </div>
  )
}

const Sample = () => <span className="pill">Sample data</span>

function Dash({ go }) {
  const { adminApi, mock } = useApp()
  const [o, setO] = useState(null)
  const [err, setErr] = useState('')
  const load = () => { setErr(''); adminApi.overview().then(setO).catch((e) => setErr(describeError(e, 'Could not load the overview.'))) }
  useEffect(load, []) // eslint-disable-line
  return (
    <>
      <h1>Admin dashboard</h1>
      {err && <ErrorState message={err} onRetry={load} />}
      {!o && !err && <Loading />}
      {o && (
        <div className="grid c4">
          <div className="card stat"><b className="num">{o.tests}</b><span className="muted small">Tests</span></div>
          <div className="card stat"><b className="num">{o.questions}</b><span className="muted small">Questions ({o.publishedQuestions} published)</span></div>
          <div className="card stat"><b className="num">{o.attempts}</b><span className="muted small">Submitted attempts{mock ? ' (this browser)' : ''}</span></div>
          {o.students !== null && o.students !== undefined && <div className="card stat"><b className="num">{o.students}</b><span className="muted small">Students · {o.activeUnlocks} active unlocks</span></div>}
          {mock && o.students === null && <div className="card stat"><b className="num">{o.activeUnlocks}</b><span className="muted small">Unlocks (this browser)</span></div>}
        </div>
      )}
      <div className="card stack">
        <h3>Quick actions</h3>
        <div className="row">
          <button className="btn primary" onClick={() => go('questions')}><Icon n="plus" s={16} />Add question</button>
          <button className="btn" onClick={() => go('tests')}><Icon n="plus" s={16} />Build a test</button>
          <button className="btn" onClick={() => go('analytics')}>See analytics</button>
        </div>
      </div>
    </>
  )
}

function Questions() {
  const { questions, setToast, getQuestionForEdit } = useApp()
  const [edit, setEdit] = useState(null)
  const [importing, setImporting] = useState(false)
  const [opening, setOpening] = useState('')
  const openEdit = async (q) => {
    setOpening(q.id)
    try { setEdit(await getQuestionForEdit(q.id)) } catch (e) { setToast(describeError(e, 'Could not open that question.')) }
    setOpening('')
  }
  const [subject, setSubject] = useState('All')
  const [status, setStatus] = useState('All')
  const [term, setTerm] = useState('')
  const rows = questions.filter((q) => (subject === 'All' || q.subject === subject) && (status === 'All' || q.status === status) && q.text.toLowerCase().includes(term.toLowerCase()))
  return (
    <>
      <div className="row between"><h1>Question bank</h1>
        <div className="row"><button className="btn" onClick={() => setImporting(true)}>Import CSV</button><button className="btn primary" onClick={() => setEdit('new')}><Icon n="plus" s={16} />Add question</button></div>
      </div>
      <div className="card stack">
        <div className="row">
          <div className="field grow"><label htmlFor="qs">Search</label><input id="qs" className="input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search question text" /></div>
          <div className="field"><label htmlFor="qsub">Subject</label><select id="qsub" className="input" value={subject} onChange={(e) => setSubject(e.target.value)}><option>All</option><option>Botany</option><option>Zoology</option></select></div>
          <div className="field"><label htmlFor="qst">Status</label><select id="qst" className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option>All</option><option>published</option><option>draft</option></select></div>
        </div>
        <div className="table-wrap"><table>
          <thead><tr><th>Question</th><th>Subject</th><th>Chapter</th><th>Level</th><th>Video</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((q) => (
            <tr key={q.id}>
              <td className="q">{q.text}</td><td>{q.subject}</td><td>{q.chapter}</td><td>{q.difficulty}</td>
              <td>{q.video ? <span className="pill good">Uploaded</span> : <span className="pill">Placeholder</span>}</td>
              <td><span className={'pill ' + (q.status === 'published' ? 'primary' : 'accent')}>{q.status}</span></td>
              <td><button className="btn sm" disabled={opening === q.id} onClick={() => openEdit(q)}>{opening === q.id ? 'Opening…' : 'Edit'}</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
      {edit && <QuestionForm initial={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {importing && <CsvImport onClose={() => setImporting(false)} />}
    </>
  )
}

const blank = () => ({
  id: crypto.randomUUID(), subject: 'Botany', chapter: '', difficulty: 'Medium', text: '', options: ['', '', '', ''], correct: 0, optionStyle: 'ABCD',
  ncert: '', explanation: '', whyWrong: ['', '', '', ''], recap: { concept: '', mistake: '' }, caption: '', video: null, imagePath: null, imageAlt: '', status: 'draft',
  socratic: [{ ask: '', keys: [], hint: '', good: '', sample: '' }, { ask: '', keys: [], hint: '', good: '', sample: '' }],
})

function QuestionForm({ initial, onClose }) {
  const { upsertQuestion, setToast } = useApp()
  const [q, setQ] = useState(() => structuredClone(initial || blank()))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setQ((x) => ({ ...x, [k]: v }))
  const setOpt = (i, v) => set('options', q.options.map((o, n) => (n === i ? v : o)))
  const setStep = (i, k, v) => set('socratic', q.socratic.map((s, n) => (n === i ? { ...s, [k]: v } : s)))
  const { media } = useApp()
  // Uploads made in this editing session. Anything not saved as the final value is deleted so storage stays clean.
  const fresh = useRef([])
  const originalVideo = useRef(initial?.video || null)
  const cleanup = async (keep) => { for (const p of fresh.current) if (p !== keep) await media.removeVideo(p).catch(() => {}) }
  const freshImg = useRef([])
  const originalImage = useRef(initial?.imagePath || null)
  const cleanupImg = async (keep) => { for (const p of freshImg.current) if (p !== keep) await media.removeImage(p).catch(() => {}) }
  const close = async () => { await cleanup(originalVideo.current); await cleanupImg(originalImage.current); onClose() }
  const save = async (status) => {
    if (!q.text.trim() || q.options.some((o) => !o.trim())) return setErr('Add the question text and all four options.')
    if (q.imagePath && !(q.imageAlt || '').trim()) return setErr('Describe the diagram in the alt text field, so students who cannot see it still get the question.')
    if (status === 'published' && q.socratic.some((s) => !s.ask.trim())) return setErr('Add the guiding questions before publishing.')
    const steps = q.socratic.filter((s) => s.ask.trim()).map((s) => ({
      ...s, keys: Array.isArray(s.keys) ? s.keys : String(s.keys).split(',').map((k) => k.trim()).filter(Boolean),
      sample: s.sample || (String(s.keys).split(',')[0] || '').trim(), good: s.good || 'Right.', hint: s.hint || 'Think about the basics.',
    }))
    setBusy(true); setErr('')
    try {
      await upsertQuestion({ ...q, video: q.video || null, socratic: steps, status, explanation: q.explanation || (status === 'draft' ? '' : 'Explanation to be added.'), caption: q.caption || '', recap: { concept: q.recap?.concept || '', mistake: q.recap?.mistake || '' } })
      setToast(status === 'published' ? 'Question published.' : 'Draft saved.')
      await cleanup(q.video)
      await cleanupImg(q.imagePath)
      if (originalImage.current && originalImage.current !== q.imagePath) await media.removeImage(originalImage.current).catch(() => {})
      if (originalVideo.current && originalVideo.current !== q.video) await media.removeVideo(originalVideo.current).catch(() => {})
      onClose()
    } catch (e) {
      setErr(describeError(e, 'Could not save the question.'))
      setBusy(false)
    }
  }
  const keysText = (s) => (Array.isArray(s.keys) ? s.keys.join(', ') : s.keys)

  return (
    <Modal wide title={initial ? 'Edit question' : 'Add question'} onClose={close}>
      <div className="stack">
        <div className="grid c3">
          <div className="field"><label htmlFor="f-sub">Subject</label><select id="f-sub" className="input" value={q.subject} onChange={(e) => set('subject', e.target.value)}><option>Botany</option><option>Zoology</option></select></div>
          <div className="field"><label htmlFor="f-ch">Chapter</label><input id="f-ch" className="input" value={q.chapter} onChange={(e) => set('chapter', e.target.value)} /></div>
          <div className="field"><label htmlFor="f-df">Difficulty</label><select id="f-df" className="input" value={q.difficulty} onChange={(e) => set('difficulty', e.target.value)}><option>Easy</option><option>Medium</option><option>Hard</option></select></div>
        </div>
        <div className="field"><label htmlFor="f-q">Question</label><textarea id="f-q" className="input" value={q.text} onChange={(e) => set('text', e.target.value)} /></div>
        <div className="stack">
          <UploadField kind="image" label="Diagram (optional)" value={q.imagePath} questionId={q.id} onChange={(v) => set('imagePath', v)} onUploaded={(p) => freshImg.current.push(p)} />
          {q.imagePath && <div className="field"><label htmlFor="f-alt">Alt text for the diagram (required)</label><input id="f-alt" className="input" maxLength={300} value={q.imageAlt || ''} onChange={(e) => set('imageAlt', e.target.value)} placeholder="Describe what the diagram shows" /></div>}
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
          <legend className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Options. Select the correct one.</legend>
          <div className="field" style={{ maxWidth: 260 }}>
            <label htmlFor="f-ls">Option labels</label>
            <select id="f-ls" className="input" value={q.optionStyle || 'ABCD'} onChange={(e) => set('optionStyle', e.target.value)}>
              {Object.entries(LABEL_STYLES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>
          </div>
          {q.options.map((o, i) => (
            <div className="row" style={{ flexWrap: 'nowrap' }} key={i}>
              <input type="radio" name="correct" id={`c${i}`} checked={q.correct === i} onChange={() => set('correct', i)} style={{ width: 20, height: 20, accentColor: 'var(--primary)' }} aria-label={`Option ${optLabel(q.optionStyle, i)} is correct`} />
              <span style={{ fontWeight: 600, minWidth: 26 }}>{optLabel(q.optionStyle, i)}</span>
              <input className="input" value={o} onChange={(e) => setOpt(i, e.target.value)} aria-label={`Option ${optLabel(q.optionStyle, i)}`} />
            </div>
          ))}
        </fieldset>
        <div className="field"><label htmlFor="f-nc">NCERT reference</label><input id="f-nc" className="input" value={q.ncert} placeholder="Class 11 · Chapter name" onChange={(e) => set('ncert', e.target.value)} /></div>
        <div className="field"><label htmlFor="f-ex">Written explanation</label><textarea id="f-ex" className="input" value={q.explanation} onChange={(e) => set('explanation', e.target.value)} /></div>

        <div className="stack">
          <h3>Socratic prompts</h3>
          <p className="small muted">2 to 3 guiding questions. Keywords are what a correct student answer should contain, separated by commas.</p>
          {q.socratic.map((s, i) => (
            <div className="card stack" key={i} style={{ gap: 10 }}>
              <b className="small">Guiding question {i + 1}</b>
              <input className="input" placeholder="Question the tutor asks" value={s.ask} onChange={(e) => setStep(i, 'ask', e.target.value)} aria-label={`Guiding question ${i + 1}`} />
              <div className="grid c2">
                <input className="input" placeholder="Expected keywords" value={keysText(s)} onChange={(e) => setStep(i, 'keys', e.target.value)} aria-label={`Keywords ${i + 1}`} />
                <input className="input" placeholder="Hint if wrong" value={s.hint} onChange={(e) => setStep(i, 'hint', e.target.value)} aria-label={`Hint ${i + 1}`} />
              </div>
            </div>
          ))}
          {q.socratic.length < 3 && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => set('socratic', [...q.socratic, { ask: '', keys: [], hint: '', good: '', sample: '' }])}><Icon n="plus" s={14} />Add third question</button>}
        </div>

        <div className="stack">
          <h3>Video explanation (MP4)</h3>
          <UploadField kind="video" label="Video file" value={q.video} questionId={q.id} onChange={(v) => set('video', v)} onUploaded={(p) => fresh.current.push(p)} />
          <div className="field"><label htmlFor="f-cap">Caption text</label><input id="f-cap" className="input" value={q.caption} onChange={(e) => set('caption', e.target.value)} /></div>
        </div>

        {err && <p role="alert" style={{ color: 'var(--bad)' }}>{err}</p>}
        <div className="row"><button className="btn primary" disabled={busy} onClick={() => save('published')}>{busy ? 'Saving…' : 'Publish'}</button><button className="btn" disabled={busy} onClick={() => save('draft')}>Save draft</button><button className="btn ghost" disabled={busy} onClick={close}>Cancel</button></div>
      </div>
    </Modal>
  )
}

function Tests() {
  const { tests, upsertTest, setToast } = useApp()
  const [edit, setEdit] = useState(null)
  return (
    <>
      <div className="row between"><h1>Tests</h1><button className="btn primary" onClick={() => setEdit('new')}><Icon n="plus" s={16} />Build a test</button></div>
      <div className="card"><div className="table-wrap"><table>
        <thead><tr><th>Test</th><th>Questions</th><th>Duration</th><th>Unlock price</th><th>Published</th><th /></tr></thead>
        <tbody>{tests.map((t) => (
          <tr key={t.id}>
            <td><b>{t.title}</b><div className="muted small">{t.kind}</div></td>
            <td className="num">{t.qids.length}</td><td className="num">{t.duration} min</td><td className="num">{inr(t.price)}</td>
            <td><span className="switch"><input type="checkbox" checked={t.published} onChange={(e) => upsertTest({ ...t, published: e.target.checked }).catch((er) => setToast(describeError(er, 'Could not change the publish state.')))} aria-label={`Publish ${t.title}`} /></span></td>
            <td><button className="btn sm" onClick={() => setEdit(t)}>Edit</button></td>
          </tr>
        ))}</tbody>
      </table></div></div>
      {edit && <TestForm initial={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function TestForm({ initial, onClose }) {
  const { questions, upsertTest, setToast } = useApp()
  const [t, setT] = useState(() => initial || { id: crypto.randomUUID(), title: '', kind: 'Custom', qids: [], duration: 10, price: UNLOCK_PRICE, published: false })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const pool = questions.filter((q) => q.status === 'published')
  const toggle = (id) => setT((x) => ({ ...x, qids: x.qids.includes(id) ? x.qids.filter((i) => i !== id) : [...x.qids, id] }))
  const move = (i, d) => setT((x) => { const a = [...x.qids]; const j = i + d; if (j < 0 || j >= a.length) return x; [a[i], a[j]] = [a[j], a[i]]; return { ...x, qids: a } })
  const save = async () => {
    if (!t.title.trim() || t.qids.length === 0) return setErr('Give the test a name and pick at least one question.')
    setBusy(true); setErr('')
    try { await upsertTest(t); setToast('Test saved.'); onClose() } catch (e) { setErr(describeError(e, 'Could not save the test.')); setBusy(false) }
  }
  return (
    <Modal wide title={initial ? 'Edit test' : 'Build a test'} onClose={onClose}>
      <div className="stack">
        <div className="grid c3">
          <div className="field"><label htmlFor="t-n">Name</label><input id="t-n" className="input" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} /></div>
          <div className="field"><label htmlFor="t-d">Duration (min)</label><input id="t-d" type="number" min="1" className="input" value={t.duration} onChange={(e) => setT({ ...t, duration: +e.target.value })} /></div>
          <div className="field"><label htmlFor="t-p">Unlock price (₹)</label><input id="t-p" type="number" min="0" className="input" value={t.price} onChange={(e) => setT({ ...t, price: +e.target.value })} /></div>
        </div>
        <div className="grid c2">
          <div className="stack">
            <h3>Question bank</h3>
            {pool.map((q) => (
              <label key={q.id} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={t.qids.includes(q.id)} onChange={() => toggle(q.id)} style={{ width: 18, height: 18, marginTop: 4, accentColor: 'var(--primary)' }} />
                <span className="small">{q.text}<br /><span className="muted">{q.subject}</span></span>
              </label>
            ))}
          </div>
          <div className="stack">
            <h3>In this test ({t.qids.length})</h3>
            {t.qids.map((id, i) => {
              const q = questions.find((x) => x.id === id)
              return (
                <div key={id} className="row" style={{ flexWrap: 'nowrap' }}>
                  <span className="num muted">{i + 1}</span><span className="small grow">{q?.text.slice(0, 70)}…</span>
                  <button className="icon-btn" style={{ width: 44, height: 44 }} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                  <button className="icon-btn" style={{ width: 44, height: 44 }} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                </div>
              )
            })}
          </div>
        </div>
        {err && <p role="alert" style={{ color: 'var(--bad)' }}>{err}</p>}
        <div className="row"><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save test'}</button><button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button></div>
      </div>
    </Modal>
  )
}

function Analytics() {
  const { adminApi, mock, user } = useApp()
  const isAdmin = mock || user?.role === 'admin'
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const load = () => { setErr(''); adminApi.analytics({ revenue: isAdmin }).then(setD).catch((e) => setErr(describeError(e, 'Could not load analytics.'))) }
  useEffect(load, []) // eslint-disable-line
  if (err) return <><h1>Analytics</h1><ErrorState message={err} onRetry={load} /></>
  if (!d) return <><h1>Analytics</h1><Loading label="Loading analytics…" /></>
  const hardest = d.questions.filter((q) => q.pctCorrect !== null && q.answered >= (mock ? 1 : 3)).slice(0, 10)
  const slowest = [...d.questions].sort((a, b) => b.avgSeconds - a.avgSeconds).slice(0, 10)
  const fmtSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const short = (t) => (t.length > 60 ? t.slice(0, 58) + '…' : t)
  return (
    <>
      <div className="row between"><h1>Analytics</h1><span className="pill">Based on {d.scope}</span></div>
      <div className="grid c2">
        <section className="card stack">
          <h3>Average score by test</h3>
          {d.tests.length === 0 ? <p className="muted small">No submitted attempts yet.</p>
            : <Bars rows={d.tests.map((t) => ({ label: t.title, value: Math.max(0, t.avgPct) / 100, text: `${t.avgScore}/${t.avgMax} · ${t.attempts} attempt${t.attempts === 1 ? '' : 's'}` }))} />}
          <p className="small muted">Score out of the maximum for the test (+4 / -1 marking), averaged over submitted attempts. Negative averages show as 0%.</p>
        </section>
        <section className="card stack">
          <h3>Hardest questions (share correct)</h3>
          {hardest.length === 0 ? <p className="muted small">Shown once a question has at least {mock ? 1 : 3} answers.</p>
            : <Bars rows={hardest.map((q) => ({ label: short(q.text), value: q.pctCorrect / 100, color: 'var(--accent)', text: `${Math.round(q.pctCorrect)}% · ${q.answered} answers` }))} />}
        </section>
      </div>
      <section className="card stack">
        <h3>Time per question</h3>
        {slowest.length === 0 ? <p className="muted small">No data yet.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Question</th><th>Chapter</th><th>Average time</th><th>Shown</th><th>Skipped</th></tr></thead>
            <tbody>{slowest.map((q) => <tr key={q.questionId}><td className="q">{short(q.text)}</td><td>{q.chapter}</td><td className="num">{fmtSec(q.avgSeconds)}</td><td className="num">{q.shown}</td><td className="num">{q.skipped}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
      {d.revenue && (
        <section className="card stack">
          <h3>Revenue from unlocks</h3>
          <div className="grid c4">
            <div className="stat"><b className="num">{inr((d.revenue.grossPaise - d.revenue.refundedPaise) / 100)}</b><span className="muted small">Net (after refunds)</span></div>
            <div className="stat"><b className="num">{d.revenue.paidCount}</b><span className="muted small">Paid unlocks</span></div>
            <div className="stat"><b className="num">{inr(d.revenue.refundedPaise / 100)}</b><span className="muted small">Refunded</span></div>
            <div className="stat"><b className="num">{d.revenue.refundFlagged}</b><span className="muted small">Flagged for refund</span></div>
          </div>
          {d.revenue.byMonth.length === 0 ? <p className="muted small">No payments yet.</p> : <Bars rows={d.revenue.byMonth.map((m) => ({ label: m.month, value: Math.min(1, m.netPaise / Math.max(...d.revenue.byMonth.map((x) => x.netPaise), 1)), text: `${inr(m.netPaise / 100)} · ${m.count}` }))} />}
        </section>
      )}
    </>
  )
}

function Users() {
  const { adminApi, mock, user, tests, setToast } = useApp()
  const [rows, setRows] = useState(undefined) // undefined = loading, null = demo sample
  const [err, setErr] = useState('')
  const [unlocking, setUnlocking] = useState(null)
  const [testId, setTestId] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => { setErr(''); adminApi.users().then(setRows).catch((e) => setErr(describeError(e, 'Could not load users.'))) }
  useEffect(load, []) // eslint-disable-line
  const act = async (fn, ok) => { setBusy(true); try { await fn(); setToast(ok); setUnlocking(null); load() } catch (e) { setToast(describeError(e, 'That did not work.')) } setBusy(false) }
  if (err) return <><h1>Users and plans</h1><ErrorState message={err} onRetry={load} /></>
  if (rows === undefined) return <><h1>Users and plans</h1><Loading /></>
  const sample = rows === null
  const list = sample ? sampleUsers.map((u) => ({ id: u.phone, name: u.name, phone: u.phone, role: 'student', unlocked_tests: u.unlocked, attempts: null })) : rows
  return (
    <>
      <div className="row between"><h1>Users and plans</h1>{sample && <span className="pill">Sample data</span>}</div>
      <div className="card"><div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Unlocked tests</th><th>Attempts</th><th /></tr></thead>
        <tbody>{list.map((u) => (
          <tr key={u.id}>
            <td>{u.name || <span className="muted">(no name)</span>}</td><td className="num">{u.phone}</td>
            <td>{sample || u.id === user?.id ? <span className="pill">{u.role}</span> : (
              <select className="input" style={{ minHeight: 36, width: 'auto' }} aria-label={`Role for ${u.name || u.phone}`} value={u.role} disabled={busy} onChange={(e) => act(() => adminApi.setRole(u.id, e.target.value), 'Role updated.')}>
                <option value="student">student</option><option value="teacher">teacher</option><option value="admin">admin</option>
              </select>)}</td>
            <td className="num">{u.unlocked_tests}</td><td className="num">{u.attempts ?? '-'}</td>
            <td><button className="btn sm" onClick={() => (sample ? setToast(`Manual unlock queued for ${u.name} (demo).`) : (setUnlocking(u), setTestId(tests[0]?.id || '')))}>Manual unlock</button></td>
          </tr>
        ))}</tbody>
      </table></div></div>
      {!sample && rows.length >= 500 && <p className="small muted">Showing the 500 most recent users.</p>}
      {unlocking && (
        <Modal title="Manual unlock" onClose={() => setUnlocking(null)}>
          <div className="stack">
            <p className="small">Give <b>{unlocking.name || unlocking.phone}</b> full solutions for one test without a payment (for support cases).</p>
            <div className="field"><label htmlFor="mu-test">Test</label><select id="mu-test" className="input" value={testId} onChange={(e) => setTestId(e.target.value)}>{tests.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></div>
            <div className="row"><button className="btn primary" disabled={busy || !testId} onClick={() => act(() => adminApi.grantUnlock(unlocking.id, testId), 'Test unlocked for the student.')}>{busy ? 'Saving…' : 'Unlock'}</button><button className="btn ghost" onClick={() => setUnlocking(null)}>Cancel</button></div>
          </div>
        </Modal>
      )}
    </>
  )
}

function PaymentsAdmin() {
  const { adminApi, setToast, tests } = useApp()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [flagging, setFlagging] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => { setErr(''); adminApi.listPayments().then(setRows).catch((e) => setErr(describeError(e, 'Could not load payments.'))) }
  useEffect(load, []) // eslint-disable-line
  const title = (id) => tests.find((t) => t.id === id)?.title ?? 'Test'
  const flag = async (id, on, text) => {
    setBusy(true)
    try { await adminApi.flagRefund(id, on, text); setFlagging(null); setNote(''); setToast(on ? 'Flagged for refund.' : 'Refund flag cleared.'); load() }
    catch (e) { setToast(describeError(e, 'Could not update the flag.')) }
    setBusy(false)
  }
  const paidTotal = (rows || []).filter((r) => r.status === 'paid').reduce((a, r) => a + r.amountPaise, 0) / 100
  return (
    <>
      <div className="row between"><h1>Payments</h1>{rows && <span className="pill">{rows.length} payments · {inr(paidTotal)} paid</span>}</div>
      <p className="small muted">Flagging a refund does not move money. Issue the refund in the Razorpay dashboard; when Razorpay confirms it, the payment shows as Refunded and that unlock is revoked automatically.</p>
      {err && <ErrorState message={err} onRetry={load} />}
      {!rows && !err && <Loading label="Loading payments…" />}
      {rows && rows.length === 0 && <div className="card"><p className="muted">No payments yet.</p></div>}
      {rows && rows.length > 0 && (
        <div className="card"><div className="table-wrap"><table>
          <thead><tr><th>Date</th><th>Student</th><th>Test</th><th>Amount</th><th>Method</th><th>Status</th><th>Refund</th></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}>
              <td>{new Date(p.at).toLocaleString()}</td>
              <td>{p.studentName}<div className="small muted num">{p.studentPhone}</div></td>
              <td>{title(p.testId)}</td>
              <td className="num">{inr(p.amountPaise / 100)}</td>
              <td>{p.method || '-'}</td>
              <td><StatusPill status={p.status} /></td>
              <td>
                {p.status === 'paid' && !p.refundFlag && <button className="btn sm" onClick={() => { setFlagging(p); setNote('') }}>Flag for refund</button>}
                {p.refundFlag && <div className="stack" style={{ gap: 4 }}><span className="pill accent"><Icon n="flag" s={14} />Refund flagged</span>{p.refundNote && <span className="small muted">{p.refundNote}</span>}{p.status === 'paid' && <button className="btn ghost sm" disabled={busy} onClick={() => flag(p.id, false)}>Clear flag</button>}</div>}
              </td>
            </tr>
          ))}</tbody>
        </table></div></div>
      )}
      {flagging && (
        <Modal title="Flag payment for refund" onClose={() => setFlagging(null)}>
          <div className="stack">
            <p className="small">{flagging.studentName} · {title(flagging.testId)} · {inr(flagging.amountPaise / 100)}</p>
            <div className="field"><label htmlFor="rf-note">Reason (visible to admins only)</label><textarea id="rf-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <div className="row"><button className="btn primary" disabled={busy} onClick={() => flag(flagging.id, true, note)}>{busy ? 'Saving…' : 'Flag for refund'}</button><button className="btn ghost" onClick={() => setFlagging(null)}>Cancel</button></div>
          </div>
        </Modal>
      )}
    </>
  )
}
