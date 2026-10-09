import { LABEL_STYLES, optLabel } from '../shared/labels.js'

// CSV import for the question bank. Pure functions so they are easy to test.
// Columns: subject, chapter, difficulty, question, optA..optD, correct, ncert, explanation,
//          ask1, keys1, hint1, ask2, keys2, hint2   (optional: ask3, keys3, hint3)
export const COLUMNS = ['subject', 'chapter', 'difficulty', 'question', 'optA', 'optB', 'optC', 'optD', 'correct', 'ncert', 'explanation', 'ask1', 'keys1', 'hint1', 'ask2', 'keys2', 'hint2']
export const OPTIONAL_COLUMNS = ['ask3', 'keys3', 'hint3', 'optstyle']
export const MAX_ROWS = 500
export const MAX_BYTES = 1024 * 1024
const REQUIRED_HEADER = ['subject', 'chapter', 'question', 'optA', 'optB', 'optC', 'optD', 'correct']

/** RFC 4180 parser: quoted fields, escaped quotes, commas and newlines inside quotes, CRLF, BOM. */
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '')
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"' && field === '') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const SUBJECTS = { botany: 'Botany', zoology: 'Zoology' }
const LEVELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const splitKeys = (s) => String(s ?? '').split(/[|;,]/).map((k) => k.trim()).filter(Boolean)
export const questionKey = (t) => norm(t).toLowerCase()

/**
 * Validate parsed rows. existingTexts: Set of questionKey() of questions already in the bank.
 * Returns { problems: [header-level errors], items: [{ line, errors, warnings, question | null }] }.
 * Every importable row becomes a DRAFT; warnings say what is missing before it can be published.
 */
export function validateImport(rows, existingTexts = new Set()) {
  const problems = []
  if (!rows.length) return { problems: ['The file is empty.'], items: [] }
  const header = rows[0].map((h) => norm(h))
  const idx = {}
  header.forEach((h, i) => { const k = [...COLUMNS, ...OPTIONAL_COLUMNS].find((c) => c.toLowerCase() === h.toLowerCase()); if (k && idx[k] === undefined) idx[k] = i })
  const missing = REQUIRED_HEADER.filter((c) => idx[c] === undefined)
  if (missing.length) problems.push(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the template to see the expected header.`)
  if (rows.length - 1 > MAX_ROWS) problems.push(`The file has ${rows.length - 1} rows. The limit is ${MAX_ROWS} per import.`)
  if (problems.length) return { problems, items: [] }

  const get = (r, c) => (idx[c] === undefined ? '' : norm(r[idx[c]]))
  const seen = new Set()
  const items = rows.slice(1).map((r, n) => {
    const line = n + 2
    const errors = [], warnings = []
    const subject = SUBJECTS[get(r, 'subject').toLowerCase()]
    if (!subject) errors.push(/physics|chemistry/i.test(get(r, 'subject')) ? 'Physics and Chemistry are not live yet. Use Botany or Zoology.' : 'Subject must be Botany or Zoology.')
    const chapter = get(r, 'chapter')
    if (!chapter) errors.push('Chapter is required.')
    else if (chapter.length > 200) errors.push('Chapter is longer than 200 characters.')
    const dRaw = get(r, 'difficulty')
    const difficulty = dRaw ? LEVELS[dRaw.toLowerCase()] : 'Medium'
    if (!difficulty) errors.push('Difficulty must be Easy, Medium or Hard (or left blank for Medium).')
    const text = get(r, 'question')
    if (!text) errors.push('Question text is required.')
    else if (text.length > 2000) errors.push('Question text is longer than 2000 characters.')
    const options = ['optA', 'optB', 'optC', 'optD'].map((c) => get(r, c))
    options.forEach((o, i) => { if (!o) errors.push(`Option ${optLabel('ABCD', i)} is empty.`) })
    const styleRaw = get(r, 'optstyle')
    const optionStyle = !styleRaw ? 'ABCD' : Object.keys(LABEL_STYLES).find((k) => k.toLowerCase() === styleRaw.toLowerCase().replace(/\s+/g, ''))
    if (!optionStyle) errors.push(`Option style must be one of: ${Object.keys(LABEL_STYLES).join(', ')}.`)
    const cRaw = get(r, 'correct')
    let correct = -1
    if (/^[A-Da-d]$/.test(cRaw)) correct = 'ABCD'.indexOf(cRaw.toUpperCase())
    else if (/^[1-4]$/.test(cRaw)) correct = Number(cRaw) - 1
    else if (cRaw) { const m = options.findIndex((o) => o && o.toLowerCase() === cRaw.toLowerCase()); if (m >= 0) correct = m }
    if (correct < 0) errors.push('Correct must be A, B, C or D (or 1 to 4, or the exact text of one option).')
    if (text) {
      const k = questionKey(text)
      if (existingTexts.has(k)) errors.push('A question with this text is already in the bank.')
      else if (seen.has(k)) errors.push('This question appears twice in the file.')
      seen.add(k)
    }

    const explanation = get(r, 'explanation')
    if (!explanation) warnings.push('No explanation yet. Add one before publishing.')
    const socratic = []
    for (const i of [1, 2, 3]) {
      const ask = get(r, `ask${i}`)
      if (!ask) { if (i < 3) warnings.push(`No guiding question ${i}. Two are needed to publish.`); continue }
      const keys = splitKeys(r[idx[`keys${i}`]])
      if (!keys.length) warnings.push(`Guiding question ${i} has no keywords, so the offline tutor cannot judge answers.`)
      socratic.push({ ask, keys, hint: get(r, `hint${i}`) || 'Think about the basics.', good: 'Right.', sample: keys[0] || '', choices: [] })
    }
    if (socratic.length === 1 && get(r, 'ask2') === '') { /* warning already added */ }

    if (errors.length) warnings.length = 0 // fix the errors first; warnings would only add noise
    const question = errors.length ? null : {
      subject, chapter, difficulty, text, options, optionStyle, correct, ncert: get(r, 'ncert'), explanation,
      whyWrong: ['', '', '', ''], recap: { concept: '', mistake: '' }, caption: '', video: null, imagePath: null, status: 'draft', socratic,
    }
    return { line, errors, warnings, question }
  })
  return { problems, items }
}

export const summarize = (items) => ({
  total: items.length,
  errors: items.filter((i) => i.errors.length).length,
  warnings: items.filter((i) => !i.errors.length && i.warnings.length).length,
  ready: items.filter((i) => !i.errors.length && !i.warnings.length).length,
  importable: items.filter((i) => !i.errors.length).length,
})

const cell = (v) => (/[",\n\r]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v)
export const csvTemplate = () =>
  [COLUMNS, [
    'Botany', 'Plant Growth and Development', 'Easy', 'Bolting in rosette plants is induced by:', 'Auxin', 'Gibberellin', 'Cytokinin', 'Abscisic acid', 'B',
    'Class 11 · Plant Growth and Development', 'Gibberellins promote internode elongation, so spraying them induces bolting.',
    'Bolting is the rapid elongation of which plant part?', 'stem|internode|stalk', 'Rosette plants have very short internodes.',
    'Which hormone promotes stem elongation in dwarf plants?', 'gibberellin|ga3', 'It was first found in a fungus that made rice seedlings grow too tall.',
  ]].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
