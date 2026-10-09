import en from './en'
import hi from './hi'
import mni from './mni'

// ready: show it as selectable. Meiteilon stays off until a translator has filled in mni.js.
export const LANGUAGES = [
  { code: 'en', label: 'English', ready: true },
  { code: 'hi', label: 'हिन्दी', ready: true },
  { code: 'mni', label: 'Meiteilon', ready: false },
]
const dicts = { en, hi, mni }
const KEY = 'bioprep-lang'

export const initialLang = () => {
  try {
    const saved = localStorage.getItem(KEY)
    if (LANGUAGES.some((l) => l.code === saved && l.ready)) return saved
  } catch { /* storage may be blocked */ }
  return 'en'
}
export const saveLang = (code) => { try { localStorage.setItem(KEY, code) } catch { /* ignore */ } }

/** t(key, { n: 3 }) -> translated string with {n} replaced. Falls back to English, then to the key. */
export function makeT(lang) {
  const d = dicts[lang] || {}
  return (key, vars) => {
    const s = d[key] ?? en[key] ?? key
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m)) : s
  }
}
export { en, hi, mni }
