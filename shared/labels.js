// Option labels. Each question picks one style; the stored answer is always the option's position (0-3).
export const LABEL_STYLES = {
  ABCD: { name: 'A, B, C, D', labels: ['A', 'B', 'C', 'D'] },
  abcd: { name: 'a, b, c, d', labels: ['a', 'b', 'c', 'd'] },
  '1234': { name: '1, 2, 3, 4', labels: ['1', '2', '3', '4'] },
  roman: { name: 'i, ii, iii, iv', labels: ['i', 'ii', 'iii', 'iv'] },
  ROMAN: { name: 'I, II, III, IV', labels: ['I', 'II', 'III', 'IV'] },
  hindi: { name: 'क, ख, ग, घ', labels: ['क', 'ख', 'ग', 'घ'] },
}
export const DEFAULT_LABEL_STYLE = 'ABCD'
export const optLabel = (style, i) => (LABEL_STYLES[style] || LABEL_STYLES[DEFAULT_LABEL_STYLE]).labels[i] ?? String(i + 1)
