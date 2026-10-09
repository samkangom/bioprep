import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import { Icon } from '../ui.jsx'
import { validateImage, validateVideo, mb } from '../media'
import { MAX_VIDEO_BYTES } from '../../shared/rules.js'
import { describeError } from '../errors'

const KINDS = {
  video: { accept: 'video/mp4', limit: `MP4, up to ${mb(MAX_VIDEO_BYTES)}`, validate: validateVideo },
  image: { accept: 'image/png,image/jpeg,image/webp', limit: 'PNG, JPEG or WebP, up to 5 MB', validate: validateImage },
}

/** File picker with validation, a real progress bar, cancel, preview and remove. `value` is a storage path (or an object URL in the demo). */
export default function UploadField({ kind, label, value, questionId, onChange, onUploaded }) {
  const { media } = useApp()
  const cfg = KINDS[kind]
  const [prog, setProg] = useState(null) // null = idle, 0..100 = uploading
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState(null)
  const ctl = useRef(null)
  const input = useRef(null)
  const id = `up-${kind}`

  useEffect(() => {
    if (!value) { setPreview(null); return }
    if (preview?.path === value) return
    let off = false
    const get = kind === 'video' ? media.previewUrl(value) : Promise.resolve(media.imageUrl(value))
    get.then((url) => { if (!off) setPreview({ path: value, url }) }).catch(() => { if (!off) setPreview(null) })
    return () => { off = true }
  }, [value]) // eslint-disable-line

  async function pick(file) {
    if (!file) return
    setErr('')
    const bad = await cfg.validate(file)
    if (bad) { setErr(bad); return }
    ctl.current = new AbortController()
    setProg(0)
    try {
      const upload = kind === 'video' ? media.uploadVideo : media.uploadImage
      const r = await upload(file, { questionId, onProgress: setProg, signal: ctl.current.signal })
      setPreview({ path: r.path, url: r.previewUrl })
      onUploaded?.(r.path)
      onChange(r.path)
    } catch (e) {
      if (e?.name === 'AbortError') setErr('Upload cancelled.')
      else if (e?.code === 'invalid_file') setErr(e.message)
      else if (e?.status === 413) setErr('That file is too large for the server.')
      else if (e?.status === 415) setErr('The server does not accept that file type.')
      else setErr(describeError(e, 'The upload failed. Check your connection and try again.'))
    }
    setProg(null)
    if (input.current) input.current.value = ''
  }

  const uploading = prog !== null
  return (
    <div className="stack" style={{ gap: 10 }}>
      <label htmlFor={id} className="small" style={{ fontWeight: 600 }}>{label}</label>
      <input ref={input} id={id} type="file" accept={cfg.accept} hidden onChange={(e) => pick(e.target.files[0])} />
      <div className="row">
        <button type="button" className="btn" disabled={uploading} onClick={() => input.current.click()}><Icon n="upload" s={16} />{value ? `Replace ${kind === 'video' ? 'MP4' : 'image'}` : `Upload ${kind === 'video' ? 'MP4' : 'image'}`}</button>
        {value && !uploading && <button type="button" className="btn ghost" onClick={() => onChange(null)}>Remove</button>}
        {uploading && <button type="button" className="btn ghost" onClick={() => ctl.current?.abort()}>Cancel upload</button>}
        <span className="small muted">{cfg.limit}</span>
      </div>
      {uploading && (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <div className="progress grow" role="progressbar" aria-label={`${label} upload`} aria-valuenow={prog} aria-valuemin={0} aria-valuemax={100}><i style={{ width: prog + '%' }} /></div>
          <span className="small num" style={{ minWidth: 40, textAlign: 'right' }}>{prog}%</span>
        </div>
      )}
      {err && <p role="alert" className="err-text"><Icon n="x" s={16} />{err}</p>}
      {!uploading && preview && (kind === 'video'
        ? <video src={preview.url} controls style={{ width: '100%', maxWidth: 420, borderRadius: 10 }} aria-label="Video preview" />
        : <img src={preview.url} alt="Diagram preview" style={{ maxWidth: 320, borderRadius: 10, border: '1px solid var(--line)' }} />)}
    </div>
  )
}
