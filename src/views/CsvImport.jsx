import { useMemo, useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import { Icon, Modal } from '../ui.jsx'
import { parseCsv, validateImport, summarize, csvTemplate, questionKey, MAX_BYTES, MAX_ROWS } from '../csv.js'
import { describeError } from '../errors'

const short = (t, n = 70) => (t && t.length > n ? t.slice(0, n - 1) + '…' : t || '')

export default function CsvImport({ onClose }) {
  const { questions, importQuestions, setToast } = useApp()
  const [name, setName] = useState('')
  const [parsed, setParsed] = useState(null) // { problems, items }
  const [err, setErr] = useState('')
  const [prog, setProg] = useState(null) // { done, total }
  const [result, setResult] = useState(null)
  const input = useRef(null)
  const existing = useMemo(() => new Set(questions.map((q) => questionKey(q.text))), [questions])

  async function pick(file) {
    if (!file) return
    setErr(''); setResult(null); setParsed(null); setName(file.name)
    if (file.size > MAX_BYTES) return setErr('That file is larger than 1 MB. Split it into smaller files.')
    try { setParsed(validateImport(parseCsv(await file.text()), existing)) }
    catch { setErr('We could not read that file. Save it as CSV (UTF-8) and try again.') }
  }
  const sum = parsed ? summarize(parsed.items) : null
  const run = async () => {
    const qs = parsed.items.filter((i) => i.question).map((i) => ({ ...i.question, id: crypto.randomUUID() }))
    setProg({ done: 0, total: qs.length })
    try {
      const r = await importQuestions(qs, (done, total) => setProg({ done, total }))
      setResult(r)
      if (!r.failed.length) setToast(`${r.imported} draft question${r.imported === 1 ? '' : 's'} imported.`)
    } catch (e) { setErr(describeError(e, 'The import stopped unexpectedly.')) }
    setProg(null)
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([csvTemplate()], { type: 'text/csv' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'bioprep-questions-template.csv' })
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <Modal wide title="Import questions from CSV" onClose={prog ? () => {} : onClose}>
      <div className="stack">
        {!result && (
          <>
            <p className="small muted">Every imported row is saved as a <b>draft</b>. Review and publish each one in the question bank. Up to {MAX_ROWS} rows, 1 MB.</p>
            <div className="row">
              <input ref={input} type="file" accept=".csv,text/csv" hidden id="csv-file" aria-label="CSV file" onChange={(e) => { pick(e.target.files[0]); e.target.value = '' }} />
              <button className="btn" disabled={!!prog} onClick={() => input.current.click()}><Icon n="upload" s={16} />{name ? 'Choose another file' : 'Choose CSV file'}</button>
              <button className="btn ghost" onClick={download}>Download template</button>
              {name && <span className="small muted">{name}</span>}
            </div>
          </>
        )}
        {err && <p role="alert" className="err-text"><Icon n="x" s={16} />{err}</p>}
        {parsed?.problems.map((p) => <p key={p} role="alert" className="err-text"><Icon n="x" s={16} />{p}</p>)}

        {parsed && !parsed.problems.length && !result && (
          <>
            <div className="row" aria-label="Summary">
              <span className="pill">{sum.total} rows</span>
              <span className="pill good"><Icon n="check" s={14} />{sum.ready} ready</span>
              {sum.warnings > 0 && <span className="pill accent"><Icon n="bolt" s={14} />{sum.warnings} with warnings</span>}
              {sum.errors > 0 && <span className="pill bad"><Icon n="x" s={14} />{sum.errors} with errors (skipped)</span>}
            </div>
            <div className="table-wrap" style={{ maxHeight: 340, overflow: 'auto' }}><table>
              <thead><tr><th>Line</th><th>Status</th><th>Question</th><th>Notes</th></tr></thead>
              <tbody>{parsed.items.map((i) => (
                <tr key={i.line}>
                  <td className="num">{i.line}</td>
                  <td>{i.errors.length ? <span className="pill bad"><Icon n="x" s={14} />Error</span> : i.warnings.length ? <span className="pill accent"><Icon n="bolt" s={14} />Draft, incomplete</span> : <span className="pill good"><Icon n="check" s={14} />Ready as draft</span>}</td>
                  <td className="q">{short(i.question?.text || '')}{i.question && <div className="muted small">{i.question.subject} · {i.question.chapter}</div>}</td>
                  <td className="small">{i.errors.map((e) => <div key={e} className="err-text"><Icon n="x" s={14} />{e}</div>)}{i.warnings.map((w) => <div key={w} className="muted">{w}</div>)}</td>
                </tr>
              ))}</tbody>
            </table></div>
            {prog && (
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <div className="progress grow" role="progressbar" aria-label="Import progress" aria-valuenow={prog.done} aria-valuemin={0} aria-valuemax={prog.total}><i style={{ width: (prog.done / prog.total) * 100 + '%' }} /></div>
                <span className="small num">{prog.done} / {prog.total}</span>
              </div>
            )}
            <div className="row">
              <button className="btn primary" disabled={!!prog || sum.importable === 0} onClick={run}>{prog ? 'Importing…' : `Import ${sum.importable} as draft${sum.importable === 1 ? '' : 's'}`}</button>
              <button className="btn ghost" disabled={!!prog} onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {result && (
          <div className="stack" role="status">
            <span className="pill good" style={{ alignSelf: 'flex-start' }}><Icon n="check" s={14} />{result.imported} imported as drafts</span>
            {result.failed.length > 0 && (
              <>
                <p className="err-text"><Icon n="x" s={16} />{result.failed.length} could not be saved:</p>
                <ul className="small">{result.failed.map((f) => <li key={f.q.id}>{short(f.q.text, 60)}: {f.error}</li>)}</ul>
              </>
            )}
            <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </Modal>
  )
}
