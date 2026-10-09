import { useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import { Bars, Icon, Modal, inr } from '../ui.jsx'
import { sampleUsers, UNLOCK_PRICE } from '../data'
import { describeError } from '../errors'

const TABS = [
  ['dash', 'Dashboard', 'grid'],
  ['questions', 'Question bank', 'book'],
  ['tests', 'Tests', 'list'],
  ['analytics', 'Analytics', 'chart'],
  ['users', 'Users and plans', 'users'],
]

export default function Admin() {
  const [tab, setTab] = useState('dash')
  return (
    <div className="admin">
      <nav className="side" aria-label="Admin">
        {TABS.map(([k, label, icon]) => (
          <button key={k} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}><Icon n={icon} />{label}</button>
        ))}
      </nav>
      <div className="stack" style={{ gap: 20, minWidth: 0 }}>
        {tab === 'dash' && <Dash go={setTab} />}
        {tab === 'questions' && <Questions />}
        {tab === 'tests' && <Tests />}
        {tab === 'analytics' && <Analytics />}
        {tab === 'users' && <Users />}
      </div>
    </div>
  )
}

const Sample = () => <span className="pill">Sample data</span>

function Dash({ go }) {
  const { tests, questions, attempts, unlocked } = useApp()
  return (
    <>
      <h1>Admin dashboard</h1>
      <div className="grid c4">
        <div className="card stat"><b className="num">{tests.length}</b><span className="muted small">Tests</span></div>
        <div className="card stat"><b className="num">{questions.length}</b><span className="muted small">Questions</span></div>
        <div className="card stat"><b className="num">{attempts.length}</b><span className="muted small">Attempts (this browser)</span></div>
        <div className="card stat"><b className="num">{unlocked.length}</b><span className="muted small">Unlocks (this browser)</span></div>
      </div>
      <div className="card stack">
        <h3>Quick actions</h3>
        <div className="row">
          <button className="btn primary" onClick={() => go('questions')}><Icon n="plus" s={16} />Add question</button>
          <button className="btn" onClick={() => go('tests')}><Icon n="plus" s={16} />Build a test</button>
          <button className="btn" onClick={() => go('analytics')}>See analytics</button>
        </div>
      </div>
      <div className="card stack">
        <div className="row between"><h3>Recent activity</h3><Sample /></div>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Thoibi L. unlocked Biology Mock 1</li>
          <li>Rahul K. finished Zoology Sprint</li>
          <li>Memcha N. opened 4 explanations</li>
        </ul>
      </div>
    </>
  )
}

function Questions() {
  const { questions, setToast, getQuestionForEdit } = useApp()
  const [edit, setEdit] = useState(null)
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
        <div className="row"><button className="btn" onClick={() => setToast('CSV import is planned. See CLAUDE.md for the column format.')}>Import CSV</button><button className="btn primary" onClick={() => setEdit('new')}><Icon n="plus" s={16} />Add question</button></div>
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
    </>
  )
}

const blank = () => ({
  id: crypto.randomUUID(), subject: 'Botany', chapter: '', difficulty: 'Medium', text: '', options: ['', '', '', ''], correct: 0,
  ncert: '', explanation: '', whyWrong: ['', '', '', ''], recap: { concept: '', mistake: '' }, caption: '', video: null, status: 'draft',
  socratic: [{ ask: '', keys: [], hint: '', good: '', sample: '' }, { ask: '', keys: [], hint: '', good: '', sample: '' }],
})

function QuestionForm({ initial, onClose }) {
  const { upsertQuestion, setToast } = useApp()
  const [q, setQ] = useState(() => structuredClone(initial || blank()))
  const [prog, setProg] = useState(initial?.video ? 100 : 0)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setQ((x) => ({ ...x, [k]: v }))
  const setOpt = (i, v) => set('options', q.options.map((o, n) => (n === i ? v : o)))
  const setStep = (i, k, v) => set('socratic', q.socratic.map((s, n) => (n === i ? { ...s, [k]: v } : s)))
  const file = useRef(null)

  const upload = (f) => {
    if (!f) return
    set('video', URL.createObjectURL(f)); setProg(0)
    let p = 0
    const id = setInterval(() => { p += 20; setProg(Math.min(100, p)); if (p >= 100) clearInterval(id) }, 150)
  }
  const save = async (status) => {
    if (!q.text.trim() || q.options.some((o) => !o.trim())) return setErr('Add the question text and all four options.')
    if (status === 'published' && q.socratic.some((s) => !s.ask.trim())) return setErr('Add the guiding questions before publishing.')
    const steps = q.socratic.filter((s) => s.ask.trim()).map((s) => ({
      ...s, keys: Array.isArray(s.keys) ? s.keys : String(s.keys).split(',').map((k) => k.trim()).filter(Boolean),
      sample: s.sample || (String(s.keys).split(',')[0] || '').trim(), good: s.good || 'Right.', hint: s.hint || 'Think about the basics.',
    }))
    setBusy(true); setErr('')
    try {
      await upsertQuestion({ ...q, socratic: steps, status, explanation: q.explanation || (status === 'draft' ? '' : 'Explanation to be added.'), caption: q.caption || '', recap: { concept: q.recap?.concept || '', mistake: q.recap?.mistake || '' } })
      setToast(status === 'published' ? 'Question published.' : 'Draft saved.')
      onClose()
    } catch (e) {
      setErr(describeError(e, 'Could not save the question.'))
      setBusy(false)
    }
  }
  const keysText = (s) => (Array.isArray(s.keys) ? s.keys.join(', ') : s.keys)

  return (
    <Modal wide title={initial ? 'Edit question' : 'Add question'} onClose={onClose}>
      <div className="stack">
        <div className="grid c3">
          <div className="field"><label htmlFor="f-sub">Subject</label><select id="f-sub" className="input" value={q.subject} onChange={(e) => set('subject', e.target.value)}><option>Botany</option><option>Zoology</option></select></div>
          <div className="field"><label htmlFor="f-ch">Chapter</label><input id="f-ch" className="input" value={q.chapter} onChange={(e) => set('chapter', e.target.value)} /></div>
          <div className="field"><label htmlFor="f-df">Difficulty</label><select id="f-df" className="input" value={q.difficulty} onChange={(e) => set('difficulty', e.target.value)}><option>Easy</option><option>Medium</option><option>Hard</option></select></div>
        </div>
        <div className="field"><label htmlFor="f-q">Question</label><textarea id="f-q" className="input" value={q.text} onChange={(e) => set('text', e.target.value)} /></div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
          <legend className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Options. Select the correct one.</legend>
          {q.options.map((o, i) => (
            <div className="row" style={{ flexWrap: 'nowrap' }} key={i}>
              <input type="radio" name="correct" id={`c${i}`} checked={q.correct === i} onChange={() => set('correct', i)} style={{ width: 20, height: 20, accentColor: 'var(--primary)' }} aria-label={`Option ${'ABCD'[i]} is correct`} />
              <span style={{ fontWeight: 600, width: 18 }}>{'ABCD'[i]}</span>
              <input className="input" value={o} onChange={(e) => setOpt(i, e.target.value)} aria-label={`Option ${'ABCD'[i]}`} />
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
          <input ref={file} type="file" accept="video/mp4,video/*" hidden id="f-vid" onChange={(e) => upload(e.target.files[0])} />
          <div className="row"><button className="btn" onClick={() => file.current.click()}><Icon n="upload" s={16} />{q.video ? 'Replace MP4' : 'Upload MP4'}</button>{q.video && <span className="small muted">Preview is kept for this session only.</span>}</div>
          {q.video && <div className="progress" role="progressbar" aria-valuenow={prog} aria-valuemin={0} aria-valuemax={100}><i style={{ width: prog + '%' }} /></div>}
          {q.video && <video src={q.video} controls style={{ width: '100%', maxWidth: 420, borderRadius: 10 }} />}
          <div className="field"><label htmlFor="f-cap">Caption text</label><input id="f-cap" className="input" value={q.caption} onChange={(e) => set('caption', e.target.value)} /></div>
        </div>

        {err && <p role="alert" style={{ color: 'var(--bad)' }}>{err}</p>}
        <div className="row"><button className="btn primary" disabled={busy} onClick={() => save('published')}>{busy ? 'Saving…' : 'Publish'}</button><button className="btn" disabled={busy} onClick={() => save('draft')}>Save draft</button><button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button></div>
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
                  <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                  <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
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
  const { attempts, tests } = useApp()
  const sampleAvg = [
    { label: 'Biology Mock 1', value: 0.52, text: '21/40' },
    { label: 'Botany Sprint', value: 0.6, text: '12/20' },
    { label: 'Zoology Sprint', value: 0.44, text: '9/20' },
  ]
  const hard = [
    { label: 'C4 primary CO2 acceptor', value: 0.31, color: 'var(--accent)' },
    { label: 'Henle loop water permeability', value: 0.38, color: 'var(--accent)' },
    { label: 'Ovulation trigger hormone', value: 0.42, color: 'var(--accent)' },
  ]
  return (
    <>
      <div className="row between"><h1>Analytics</h1><Sample /></div>
      <div className="grid c2">
        <section className="card stack"><h3>Average score by test</h3><Bars rows={sampleAvg} /></section>
        <section className="card stack"><h3>Hardest questions (share correct)</h3><Bars rows={hard} /></section>
      </div>
      <section className="card stack">
        <h3>Revenue from unlocks</h3>
        <div className="grid c3">
          <div className="stat"><b className="num">{inr(1400)}</b><span className="muted small">This month (sample)</span></div>
          <div className="stat"><b className="num">14</b><span className="muted small">Unlocks (sample)</span></div>
          <div className="stat"><b className="num">{attempts.length}</b><span className="muted small">Real attempts in this browser</span></div>
        </div>
        <p className="small muted">{tests.length} tests configured. Charts above are sample numbers until a backend records real attempts.</p>
      </section>
    </>
  )
}

function Users() {
  const { setToast } = useApp()
  return (
    <>
      <div className="row between"><h1>Users and plans</h1><Sample /></div>
      <div className="card"><div className="table-wrap"><table>
        <thead><tr><th>Student</th><th>Phone</th><th>Plan</th><th>Unlocked tests</th><th /></tr></thead>
        <tbody>{sampleUsers.map((u) => (
          <tr key={u.phone}><td>{u.name}</td><td className="num">{u.phone}</td><td><span className={'pill ' + (u.plan === 'Paid' ? 'primary' : '')}>{u.plan}</span></td><td className="num">{u.unlocked}</td>
            <td><button className="btn sm" onClick={() => setToast(`Manual unlock queued for ${u.name} (demo).`)}>Manual unlock</button></td></tr>
        ))}</tbody>
      </table></div></div>
    </>
  )
}
