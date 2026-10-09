// One interface for the tutor, two implementations:
//   apiDriver  - real mode. Every call goes to the API; secrets stay on the server until the session is finished.
//   mockDriver - offline prototype. Same calls, answered from local data (no security, demo only).
import { api, apiRaw, ApiError } from './api'
import { CHOICES } from './data'
import { TUTOR_SECONDS, TUTOR_MAX_TURNS } from '../shared/rules.js'
import { scriptedTurn, scriptedWrapUp, shuffle, LETTERS } from '../shared/tutor-core.js'
import { getSample, claudeTurn, claudeWrapUp, errorCopy } from './tutor.js'

const wire = (msgs) => msgs.map(({ from, text }) => ({ from, text }))

export function apiDriver({ q, attemptId, onFreeUsed }) {
  return {
    kind: 'api',
    async open() {
      const s = await api('/api/explain/open', { method: 'POST', body: { attemptId, questionId: q.id } })
      if (s.access === 'free') onFreeUsed?.()
      return s
    },
    async turn({ messages, kind, hintLevel }) {
      const { json, mode } = await apiRaw('/api/tutor/turn', { method: 'POST', body: { questionId: q.id, messages: wire(messages), kind, hintLevel } })
      return { ...json, mode: mode || 'scripted', note: mode === 'limited' ? 'You have reached today\'s limit for Claude. The built-in guide is helping.' : mode === 'scripted' ? 'Claude did not respond, so the built-in guide answered this one.' : '' }
    },
    finish: (reason) => api('/api/tutor/finish', { method: 'POST', body: { questionId: q.id, reason } }),
    reveal: () => api(`/api/explain/${q.id}`),
    wrapup: (messages) => api('/api/tutor/wrapup', { method: 'POST', body: { questionId: q.id, messages: wire(messages) } }),
    videoUrl: async () => null, // signed URLs arrive with the video stage
  }
}

export function mockDriver({ q, testId, app }) {
  let scriptIdx = 0, count = 0, scripted = false
  const steps = q.socratic
  const choicesFor = (i) => shuffle(CHOICES[`${q.id}:${i}`] || [])
  return {
    kind: 'mock',
    sample: (step) => steps[Math.min(step, steps.length) - 1].sample,
    async open() {
      if (!(await app.openExplanation(testId, q.id))) throw new ApiError(402, 'paywall')
      return {
        access: app.isUnlocked(testId) ? 'paid' : 'free', finished: false, step: 1, steps: steps.length,
        secondsLeft: TUTOR_SECONDS, ask: steps[0].ask, choices: choicesFor(0),
      }
    },
    async turn({ messages, kind, hintLevel }) {
      count += 1
      const text = messages[messages.length - 1].text
      let res = null, mode = 'scripted', note = ''
      const sample = scripted ? null : await getSample()
      if (sample) {
        try { res = await claudeTurn(sample, { q, msgs: messages, kind, hintLevel, count }); mode = 'claude' }
        catch (e) { scripted = true; note = errorCopy(e?.code) }
      } else if (!scripted) { scripted = true; note = 'Claude is not available here, so the built-in guide is helping.' }
      if (!res) {
        const s = scriptedTurn(steps, scriptIdx, text, kind, hintLevel)
        if (s.advance) scriptIdx += 1
        res = s
      }
      const done = res.done || count >= TUTOR_MAX_TURNS
      const choices = done ? [] : shuffle(res.choices?.length ? res.choices : CHOICES[`${q.id}:${res.step - 1}`] || [])
      return { verdict: res.verdict, reply: res.reply, step: res.step, established: res.established, choices, done, mode, note }
    },
    async finish() {},
    async reveal() {
      return {
        answer: { index: q.correct, letter: LETTERS[q.correct], text: q.options[q.correct] },
        explanation: q.explanation, whyWrong: q.whyWrong, recap: q.recap, ncert: q.ncert, caption: q.caption, hasVideo: !!q.video,
      }
    },
    async wrapup(messages) {
      const sample = scripted ? null : await getSample()
      if (!sample) return null
      try { return await claudeWrapUp(sample, { q, msgs: messages }) } catch { return scriptedWrapUp(q, true) }
    },
    videoUrl: async () => q.video || null,
  }
}
