// Socratic tutor.
// Primary path: Claude via the artifact `sample` capability (prototype) -> in production this becomes
// a server endpoint that calls the Claude API (see CLAUDE.md). Fallback: scripted keyword tutor.

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// In the published prototype Claude is reached through the artifact `sample` capability.
// In your own deployment set VITE_API_URL (e.g. http://localhost:8787) and the same calls go to server/index.js,
// which holds the API key. Anything else falls back to the scripted tutor.
const remote = (base) => {
  const f = async () => { throw { code: 'invalid_request', message: 'Use .json' } }
  f.json = async (prompt, opts = {}) => {
    const res = await fetch(`${base}/api/claude-json`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, tier: opts.modelTier || 'quick' }), signal: opts.signal,
    })
    if (!res.ok) throw { code: res.status === 429 ? 'rate_limited' : 'upstream_error', message: `HTTP ${res.status}` }
    return res.json()
  }
  return f
}

export async function getSample() {
  try {
    const base = import.meta.env?.VITE_API_URL
    if (base) return remote(base)
    const s = await window.claude?.use?.('sample')
    return s || null
  } catch {
    return null
  }
}

const letters = 'ABCD'
const transcript = (msgs) =>
  msgs.map((m) => `${m.from === 'me' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n')

function turnPrompt({ q, msgs, kind, hintLevel, count }) {
  const latest = msgs[msgs.length - 1].text
  const sig = kind === 'hint' ? `[The student asked for hint number ${hintLevel}]` : kind === 'unsure' ? '[The student said they are not sure]' : latest
  return `You are a warm, sharp Socratic biology tutor for an Indian NEET (UG) student. You teach by asking, never by lecturing.

QUESTION: ${q.text}
OPTIONS: ${q.options.map((o, i) => `${letters[i]}. ${o}`).join(' | ')}
CORRECT ANSWER (secret until the wrap-up): ${letters[q.correct]}. ${q.options[q.correct]}
TEACHER'S EXPLANATION (secret): ${q.explanation}
TEACHER'S GUIDING QUESTIONS (a skeleton, adapt it to what the student actually says):
${q.socratic.map((s, i) => `${i + 1}. ${s.ask}  [hint: ${s.hint}]`).join('\n')}

CONVERSATION SO FAR:
${transcript(msgs.slice(0, -1))}

STUDENT'S LATEST MESSAGE: ${sig}
(This is student message number ${count}.)

RULES
- Judge the latest message against the guiding question currently being asked.
- Reply in at most 55 words, plain language, one question at a time. No bullet points, no markdown.
- Correct: acknowledge the specific thing they got right in a few words, then ask the next guiding question in your own words.
- Partly right: confirm the right part, then ask a smaller question about the gap.
- Wrong or unsure: be kind, never say "wrong" harshly. Ask a smaller, easier question. If a hint was requested, give hint level ${hintLevel || 1} (1 = rephrase, 2 = a concrete clue, 3 = nearly give it away).
- NEVER state the correct option letter or text before done is true.
- Set done to true only when the student has shown the key ideas for all guiding questions, or when this is student message 5 or more. When done is true, reply with one short closing line that invites them to see the full explanation. Do not give the explanation yourself.

Reply with only this JSON:
{"verdict":"on_track|partial|off_track|unsure","reply":"...","step":<1-based number of the guiding question you are asking now (the last one when done)>,"established":"<12 words or fewer: one fact the student has now shown they know, or empty>","choices":["<3 or 4 short tap-to-answer options (6 words max each) for the question you are asking now, exactly one clearly correct, plausible wrong ones. Empty list when done>"],"done":false}`
}

export async function claudeTurn(sample, args, signal) {
  const r = await sample.json(turnPrompt(args), { modelTier: 'quick', cache: false, signal })
  if (!r || typeof r.reply !== 'string' || !r.reply.trim()) throw { code: 'invalid_json', message: 'No reply' }
  const verdict = ['on_track', 'partial', 'off_track', 'unsure'].includes(r.verdict) ? r.verdict : 'partial'
  return {
    verdict,
    reply: r.reply.trim(),
    step: Math.min(args.q.socratic.length, Math.max(1, Number(r.step) || 1)),
    established: typeof r.established === 'string' ? r.established.trim() : '',
    choices: Array.isArray(r.choices) ? r.choices.filter((c) => typeof c === 'string' && c.trim()).slice(0, 4) : [],
    done: !!r.done,
  }
}

export async function claudeWrapUp(sample, { q, msgs }, signal) {
  const prompt = `You are a Socratic biology tutor wrapping up a short conversation with a NEET student.

QUESTION: ${q.text}
CORRECT ANSWER: ${letters[q.correct]}. ${q.options[q.correct]}
CONVERSATION:
${transcript(msgs)}

Write feedback on the student's thinking, not on the topic. Be specific to what they actually said. If they said little or skipped, say so kindly and keep it short.
Reply with only this JSON, each value one sentence of at most 25 words:
{"strength":"what they reasoned well, or empty if nothing yet","gap":"the one idea to revisit, or empty","tip":"one exam tip for questions like this"}`
  const r = await sample.json(prompt, { modelTier: 'quick', cache: false, signal })
  return { strength: String(r?.strength || ''), gap: String(r?.gap || ''), tip: String(r?.tip || '') }
}

// ---- Scripted fallback (no model) ----
export function evaluate(step, text) {
  const t = text.toLowerCase().trim()
  const hit = step.keys.some((k) => {
    const key = k.toLowerCase()
    return key.length <= 3 ? new RegExp('\\b' + esc(key) + '\\b').test(t) : t.includes(key)
  })
  return hit ? 'good' : 'wrong'
}

export function scriptedTurn(q, idx, text, kind) {
  const steps = q.socratic
  const s = steps[Math.min(idx, steps.length - 1)]
  if (kind === 'hint' || kind === 'unsure') {
    return { verdict: 'unsure', reply: `${s.hint} Have another go: ${s.ask}`, step: idx + 1, established: '', done: false, advance: false }
  }
  const ok = evaluate(s, text) === 'good'
  const last = idx + 1 >= steps.length
  return {
    verdict: ok ? 'on_track' : 'off_track',
    reply: ok ? `Good. ${s.good}${last ? '' : ' ' + steps[idx + 1].ask}` : `Not quite. ${s.hint} ${s.good}${last ? '' : ' ' + steps[idx + 1].ask}`,
    step: Math.min(steps.length, idx + 2),
    established: ok ? s.good.replace(/\.$/, '') : '',
    done: last,
    advance: true,
  }
}

export const errorCopy = (code) =>
  ({
    not_granted: 'Claude access was not allowed for this page, so the built-in guide is helping instead.',
    sampling_disabled: 'Claude is not available on this account, so the built-in guide is helping instead.',
    rate_limited: 'Claude is busy right now. The built-in guide answered this one. Try again in a moment.',
    session_expired: 'Sign in again to use Claude. The built-in guide answered this one.',
  }[code] || 'Claude did not respond, so the built-in guide answered this one.')
