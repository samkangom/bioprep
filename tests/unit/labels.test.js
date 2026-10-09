import { describe, it, expect } from 'vitest'
import { LABEL_STYLES, optLabel } from '../../shared/labels.js'
import { parseCsv, validateImport } from '../../src/csv.js'
import { turnPrompt } from '../../shared/tutor-core.js'

describe('option labels', () => {
  it('gives four labels per style and falls back to A-D', () => {
    for (const s of Object.values(LABEL_STYLES)) expect(s.labels).toHaveLength(4)
    expect([0, 1, 2, 3].map((i) => optLabel('1234', i))).toEqual(['1', '2', '3', '4'])
    expect([0, 1, 2, 3].map((i) => optLabel('roman', i))).toEqual(['i', 'ii', 'iii', 'iv'])
    expect([0, 1, 2, 3].map((i) => optLabel('ROMAN', i))).toEqual(['I', 'II', 'III', 'IV'])
    expect(optLabel(undefined, 2)).toBe('C')
    expect(optLabel('nonsense', 0)).toBe('A')
  })
  it('the tutor prompt uses the question\'s labels', () => {
    const q = { text: 'Q?', options: ['a', 'b', 'c', 'd'], correct: 2, explanation: 'e', optionStyle: 'roman', socratic: [{ ask: 'x', hint: 'h' }] }
    const p = turnPrompt({ q, msgs: [{ from: 'me', text: 'hi' }], kind: 'answer', count: 1 })
    expect(p).toContain('iii. c')
    expect(p).not.toContain('C. c')
  })
  it('CSV accepts an optional optstyle column', () => {
    const h = 'subject,chapter,question,optA,optB,optC,optD,correct,optstyle'
    const { items } = validateImport(parseCsv(`${h}\nBotany,c,Q1?,a,b,c,d,A,roman\nBotany,c,Q2?,a,b,c,d,A,\nBotany,c,Q3?,a,b,c,d,A,bogus`))
    expect(items[0].question.optionStyle).toBe('roman')
    expect(items[1].question.optionStyle).toBe('ABCD')
    expect(items[2].errors[0]).toMatch(/Option style must be one of/)
  })
})
