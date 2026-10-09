// Offline (mock-mode) Socratic tutor helpers. In real mode none of this runs in the browser: the API builds the
// prompts from the database and the browser only sees {verdict, reply, step, established, choices, done}.
// Prompts, validation and the scripted fallback live in shared/tutor-core.js so both sides stay identical.
import { turnPrompt, wrapUpPrompt, validateTurn, validateWrapUp } from '../shared/tutor-core.js'

// In the published prototype Claude is reached through the artifact `sample` capability. Anything else: scripted.
export async function getSample() {
  try { return (await window.claude?.use?.('sample')) || null } catch { return null }
}

export async function claudeTurn(sample, args, signal) {
  const r = await sample.json(turnPrompt(args), { modelTier: 'quick', cache: false, signal })
  const v = validateTurn(r, { steps: args.q.socratic.length, prevStep: 1 })
  if (!v) throw { code: 'invalid_json', message: 'No reply' }
  return v
}

export async function claudeWrapUp(sample, { q, msgs }, signal) {
  const r = await sample.json(wrapUpPrompt({ q, msgs }), { modelTier: 'quick', cache: false, signal })
  return validateWrapUp(r) || { strength: '', gap: '', tip: '' }
}

export const errorCopy = (code) =>
  ({
    not_granted: 'Claude access was not allowed for this page, so the built-in guide is helping instead.',
    sampling_disabled: 'Claude is not available on this account, so the built-in guide is helping instead.',
    rate_limited: 'Claude is busy right now. The built-in guide answered this one. Try again in a moment.',
    session_expired: 'Sign in again to use Claude. The built-in guide answered this one.',
  }[code] || 'Claude did not respond, so the built-in guide answered this one.')
