import { describe, it, expect } from 'vitest'
import { parseCsv, validateImport, summarize, csvTemplate, questionKey, COLUMNS } from '../../src/csv.js'

const header = COLUMNS.join(',')
const good = 'Botany,Photosynthesis,Easy,"What is 1+1, really?",1,2,3,4,B,NCERT 11,Because 2.,Ask one?,a|b,Hint one,Ask two?,c;d,Hint two'

describe('parseCsv', () => {
  it('handles quotes, embedded commas and newlines, CRLF, BOM and blank lines', () => {
    const rows = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n\r\n,,\r\nlast,,')
    expect(rows).toEqual([['a', 'b', 'c'], ['x, y', 'say "hi"', 'line1\nline2'], ['last', '', '']])
  })
})

describe('validateImport', () => {
  it('accepts a complete row as a draft with parsed options, keywords and guiding questions', () => {
    const { problems, items } = validateImport(parseCsv(`${header}\n${good}`))
    expect(problems).toEqual([])
    expect(items[0].errors).toEqual([])
    expect(items[0].warnings).toEqual([])
    expect(items[0].question).toMatchObject({ subject: 'Botany', difficulty: 'Easy', text: 'What is 1+1, really?', correct: 1, status: 'draft', explanation: 'Because 2.' })
    expect(items[0].question.socratic.map((s) => s.keys)).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('reports header problems', () => {
    expect(validateImport(parseCsv('subject,chapter\nBotany,x')).problems[0]).toMatch(/Missing columns: question, optA, optB, optC, optD, correct/)
    expect(validateImport([]).problems).toEqual(['The file is empty.'])
  })

  it('reports every problem per row with its line number and never imports invalid rows', () => {
    const bad = 'Physics,,Impossible,,x,,z,w,E,,,,,,,,'
    const { items } = validateImport(parseCsv(`${header}\n${bad}\n${good}`))
    expect(items[0].line).toBe(2)
    expect(items[0].question).toBeNull()
    expect(items[0].errors.join(' ')).toMatch(/Physics and Chemistry are not live/)
    expect(items[0].errors.join(' ')).toMatch(/Chapter is required/)
    expect(items[0].errors.join(' ')).toMatch(/Difficulty must be/)
    expect(items[0].errors.join(' ')).toMatch(/Question text is required/)
    expect(items[0].errors.join(' ')).toMatch(/Option B is empty/)
    expect(items[0].errors.join(' ')).toMatch(/Correct must be/)
    expect(items[1].line).toBe(3)
    expect(summarize(items)).toEqual({ total: 2, errors: 1, warnings: 0, ready: 1, importable: 1 })
  })

  it('accepts the correct answer as a letter, a number or the option text, and defaults difficulty', () => {
    const mk = (c, d = '') => `Zoology,Heart,${d},Q ${c}?,Alpha,Beta,Gamma,Delta,${c},,,,,,,,`
    const { items } = validateImport(parseCsv([header, mk('c'), mk('3'), mk('Gamma'), mk('d', 'hard')].join('\n')))
    expect(items.map((i) => i.question.correct)).toEqual([2, 2, 2, 3])
    expect(items[0].question.difficulty).toBe('Medium')
    expect(items[3].question.difficulty).toBe('Hard')
  })

  it('warns (but still imports a draft) when explanation or guiding questions are missing', () => {
    const { items } = validateImport(parseCsv(`${header}\nBotany,Cell,Easy,Only question?,a,b,c,d,A,,,,,,,,`))
    expect(items[0].errors).toEqual([])
    expect(items[0].warnings.join(' ')).toMatch(/No explanation/)
    expect(items[0].warnings.join(' ')).toMatch(/No guiding question 1/)
    expect(items[0].question.status).toBe('draft')
  })

  it('rejects duplicates within the file and against the existing bank', () => {
    const existing = new Set([questionKey('What is 1+1, really?')])
    const dup = validateImport(parseCsv(`${header}\n${good}`), existing).items[0]
    expect(dup.errors).toEqual(['A question with this text is already in the bank.'])
    const twice = validateImport(parseCsv(`${header}\n${good}\n${good}`)).items
    expect(twice[1].errors).toEqual(['This question appears twice in the file.'])
  })

  it('the downloadable template is itself valid', () => {
    const { problems, items } = validateImport(parseCsv(csvTemplate()))
    expect(problems).toEqual([])
    expect(summarize(items)).toMatchObject({ total: 1, ready: 1 })
  })

  it('limits the number of rows', () => {
    const many = [header, ...Array.from({ length: 501 }, (_, i) => good.replace('1+1', 'n' + i))].join('\n')
    expect(validateImport(parseCsv(many)).problems[0]).toMatch(/limit is 500/)
  })
})
