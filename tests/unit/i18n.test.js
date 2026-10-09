import { describe, it, expect } from 'vitest'
import { en, hi, mni, makeT, LANGUAGES } from '../../src/i18n'

const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',')

describe('i18n scaffolding', () => {
  it('translations only use keys that exist in English, and keep the same placeholders', () => {
    for (const [name, dict] of [['hi', hi], ['mni', mni]]) {
      for (const [k, v] of Object.entries(dict)) {
        expect(en[k], `${name}: unknown key ${k}`).toBeDefined()
        expect(placeholders(v), `${name}: placeholders differ in ${k}`).toBe(placeholders(en[k]))
      }
    }
  })
  it('falls back to English and then to the key, and fills placeholders', () => {
    const t = makeT('hi')
    expect(t('home.hello', { name: 'आशा' })).toBe('नमस्ते, आशा')
    expect(t('auth.dob')).toBe('जन्म तिथि')
    expect(makeT('mni')('home.hello', { name: 'Asha' })).toBe('Hello, Asha') // empty dictionary -> English
    expect(makeT('en')('no.such.key')).toBe('no.such.key')
    expect(makeT('en')('home.hello')).toBe('Hello, {name}') // missing var left visible, never crashes
  })
  it('only offers languages that are ready', () => {
    expect(LANGUAGES.filter((l) => l.ready).map((l) => l.code)).toEqual(['en', 'hi'])
    expect(Object.keys(mni)).toHaveLength(0)
  })
})
