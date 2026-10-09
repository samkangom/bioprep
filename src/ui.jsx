import { useEffect } from 'react'

const P = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  lock: 'M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z',
  clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  play: 'M8 5.5v13l11-6.5z',
  flag: 'M6 21V4h11l-2 4 2 4H6',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  book: 'M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h10',
  chart: 'M5 20V10M12 20V4M19 20v-7',
  users: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M16 5a3 3 0 010 6M18 20a6 6 0 00-3-5',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  logout: 'M10 5H5v14h5M15 8l4 4-4 4M19 12H9',
}
export const Icon = ({ n, s = 18, className = '' }) => (
  <svg className={className} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={P[n]} />
  </svg>
)

export const fmt = (sec) => {
  const s = Math.max(0, Math.round(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
export const inr = (n) => `₹${n}`

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="scrim" onClick={onClose}>
      <div className={'sheet' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon n="x" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---- Charts (plain SVG/CSS, tokens only) ----
export function Donut({ parts, size = 150, center }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1
  const r = 52, c = 2 * Math.PI * r
  let off = 0
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--line)" strokeWidth="16" />
      {parts.map((p) => {
        const len = (p.value / total) * c
        const el = <circle key={p.label} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)" />
        off += len
        return el
      })}
      <text x="70" y="68" textAnchor="middle" className="donut-n">{center?.[0]}</text>
      <text x="70" y="86" textAnchor="middle" className="donut-l">{center?.[1]}</text>
    </svg>
  )
}

export function Bars({ rows }) {
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <div className="bar-label">{r.label}</div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round(r.value * 100)}%`, background: r.color || 'var(--primary)' }} /></div>
          <div className="bar-val">{r.text ?? `${Math.round(r.value * 100)}%`}</div>
        </div>
      ))}
    </div>
  )
}
