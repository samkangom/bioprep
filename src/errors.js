// Turn database / API error codes into sentences a student can act on.
const COPY = {
  not_authenticated: 'Please sign in again.',
  forbidden: 'You do not have permission to do that.',
  attempt_expired: 'This attempt ran out of time too long ago to be submitted. Start the test again.',
  attempt_not_found: 'We could not find that attempt. Start the test again.',
  test_not_found: 'That test is not available.',
  free_limit_reached: 'You have used your free explanations.',
  paywall: 'This explanation needs the test to be unlocked.',
  rate_limited: 'Too many requests. Please wait a moment and try again.',
  network: 'No connection. Check your internet and try again.',
}
export function describeError(e, fallback = 'Something went wrong. Please try again.') {
  if (!e) return fallback
  const msg = String(e.code && COPY[e.code] ? e.code : e.message || '')
  for (const k of Object.keys(COPY)) if (msg.includes(k)) return COPY[k]
  if (/invalid_(question|test):/.test(msg)) return msg.replace(/^.*invalid_(question|test):\s*/, '').replace(/^./, (c) => c.toUpperCase()) + '.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return COPY.network
  if (/row-level security|permission denied/i.test(msg)) return COPY.forbidden
  return fallback
}
export class AppError extends Error {
  constructor(code, message) { super(message || code); this.code = code }
}
