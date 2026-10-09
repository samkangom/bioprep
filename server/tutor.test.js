import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { bootDb, addUser } from '../dev/pg.js'
import { fromPglite } from './db.js'
import { createApp } from './app.js'

let pg, server, base
let claudeScript = null // set per test: async (prompt) => ({ json, usage, model, latencyMs })
const prompts = []
const fakeClaude = { json: async (prompt, o) => { prompts.push(prompt); return claudeScript(prompt, o) } }
let useClaude = false
let limits = {}

const q = async (sql, p) => (await pg.query(sql, p)).rows
const qid = async (frag) => (await q(`select id from public.questions where text like $1`, [`%${frag}%`]))[0].id

beforeAll(async () => {
  pg = await bootDb({ seed: true })
  const app = createApp({
    db: fromPglite(pg),
    verifyToken: async (t) => (/^[0-9a-f-]{36}$/.test(t) ? { id: t } : null),
    get claude() { return useClaude ? fakeClaude : null },
    get limits() { return limits },
  })
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r) })
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(async () => { await new Promise((r) => server.close(r)); await pg.close() })
beforeEach(() => { useClaude = false; claudeScript = null; limits = {}; prompts.length = 0 })

const call = async (token, method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  return { status: res.status, mode: res.headers.get('x-tutor-mode'), text, json: text ? JSON.parse(text) : null }
}

let n = 0
async function student({ attempted = true } = {}) {
  const id = await addUser(pg, '9197000' + String(10000 + n++))
  const test = (await q(`select id from public.tests where title = 'Botany Sprint'`))[0].id
  let attempt = null
  if (attempted) {
    // start/submit are covered in tests/db; here we seed a submitted attempt directly through the service connection
    const a = (await q(`insert into public.attempts (user_id, test_id) values ($1, $2) returning id`, [id, test]))[0].id
    await q(`insert into public.attempt_answers (attempt_id, question_id, selected, is_correct)
             select $1, question_id, null, null from public.test_questions where test_id = $2`, [a, test])
    await q(`update public.attempts set submitted_at = now(), correct = 0, wrong = 0, skipped = 5, score = 0, max_score = 20 where id = $1`, [a])
    attempt = a
  }
  return { id, token: id, attempt, test }
}
const turn = (s, questionId, text, kind = 'answer', msgs = []) =>
  call(s.token, 'POST', '/api/tutor/turn', { questionId, kind, hintLevel: 99, messages: [...msgs, { from: 'me', text }] })

describe('auth and gating', () => {
  it('rejects requests without a valid token', async () => {
    expect((await call(null, 'POST', '/api/tutor/turn', {})).status).toBe(401)
    expect((await call('not-a-token', 'GET', '/api/explain/x')).status).toBe(401)
    expect((await call(null, 'GET', '/health')).status).toBe(200)
  })
  it('needs a submitted attempt that contained the question', async () => {
    const s = await student({ attempted: false })
    const Q = await qid('reaction centre chlorophyll')
    const other = await student()
    expect((await call(s.token, 'POST', '/api/explain/open', { attemptId: other.attempt, questionId: Q })).status).toBe(404) // not their attempt
    const hz = await qid('pacemaker')
    expect((await call(other.token, 'POST', '/api/explain/open', { attemptId: other.attempt, questionId: hz })).status).toBe(404) // not in that attempt
    expect((await call(other.token, 'POST', '/api/explain/open', { attemptId: 'nope', questionId: Q })).status).toBe(400)
  })
})

describe('scripted tutor session', () => {
  it('never reveals the answer or explanation until the session is finished', async () => {
    const s = await student()
    const Q = await qid('reaction centre chlorophyll')
    const secret = (await q('select explanation from public.question_secrets where question_id = $1', [Q]))[0].explanation

    const open = await call(s.token, 'POST', '/api/explain/open', { attemptId: s.attempt, questionId: Q })
    expect(open.status).toBe(200)
    expect(open.json).toMatchObject({ access: 'free', finished: false, step: 1, steps: 2, freeLeft: 1 })
    expect(open.json.ask).toMatch(/P680 and P700/)
    expect(open.json.secondsLeft).toBeGreaterThan(110)
    expect(open.json.choices).toHaveLength(4)
    for (const forbidden of ['"correct"', 'explanation', '"keys"', '"hint"', '"good"', '"sample"', secret]) expect(open.text).not.toContain(forbidden)

    expect((await call(s.token, 'GET', `/api/explain/${Q}`)).status).toBe(403)
    expect((await call(s.token, 'POST', '/api/tutor/wrapup', { questionId: Q, messages: [] })).status).toBe(403)

    const t1 = await turn(s, Q, 'the wavelength of light it absorbs')
    expect(t1.status).toBe(200)
    expect(Object.keys(t1.json).sort()).toEqual(['choices', 'done', 'established', 'reply', 'step', 'verdict'])
    expect(t1.json).toMatchObject({ verdict: 'on_track', step: 2, done: false })
    expect(t1.mode).toBe('scripted')
    expect(t1.text).not.toContain(secret)
    expect((await call(s.token, 'GET', `/api/explain/${Q}`)).status).toBe(403)

    const t2 = await turn(s, Q, 'PS II')
    expect(t2.json).toMatchObject({ done: true, choices: [] })
    const reveal = await call(s.token, 'GET', `/api/explain/${Q}`)
    expect(reveal.status).toBe(200)
    expect(reveal.json).toMatchObject({ answer: { index: 1, letter: 'B', text: '680 nm' }, explanation: secret })
    expect((await call(s.token, 'POST', '/api/tutor/wrapup', { questionId: Q, messages: [{ from: 'me', text: 'x' }] })).json).toHaveProperty('tip')
    // finished sessions cannot take more turns
    expect((await turn(s, Q, 'again')).status).toBe(409)
    // reopening a finished session does not spend another free slot
    const again = await call(s.token, 'POST', '/api/explain/open', { attemptId: s.attempt, questionId: Q })
    expect(again.json).toMatchObject({ finished: true, freeLeft: 1 })
  })

  it('walks a 3-level hint ladder and caps at level 3', async () => {
    const s = await student()
    const Q = await qid('reaction centre chlorophyll')
    await call(s.token, 'POST', '/api/explain/open', { attemptId: s.attempt, questionId: Q })
    const replies = []
    for (let i = 0; i < 4; i++) replies.push((await turn(s, Q, 'hint', 'hint')).json.reply)
    expect(replies[0]).toContain('The number is a measurement of light.')
    expect(replies[1]).toMatch(/starts with "W"/)
    expect(replies[2]).toContain('Here is the idea')
    expect(replies[3]).toContain('Here is the idea') // capped
    expect((await q('select hints from public.tutor_sessions where user_id = $1', [s.id]))[0].hints).toBe(3)
  })

  it('applies the 2:00 timer on the server', async () => {
    const s = await student()
    const Q = await qid('reaction centre chlorophyll')
    await call(s.token, 'POST', '/api/explain/open', { attemptId: s.attempt, questionId: Q })
    expect((await call(s.token, 'POST', '/api/tutor/finish', { questionId: Q, reason: 'timeout' })).status).toBe(409) // too early
    await q(`update public.tutor_sessions set started_at = now() - interval '130 seconds' where user_id = $1`, [s.id])
    expect((await turn(s, Q, 'late answer')).status).toBe(409) // expired
    expect((await call(s.token, 'POST', '/api/tutor/finish', { questionId: Q, reason: 'timeout' })).status).toBe(200)
    expect((await call(s.token, 'GET', `/api/explain/${Q}`)).status).toBe(200)
  })

  it('lets the student skip to the answer at any time ("Show me the answer")', async () => {
    const s = await student()
    const Q = await qid('pacemaker')
    const s2 = { ...s }
    // attempt must contain the question: Zoology question needs the Zoology test
    const zt = (await q(`select id from public.tests where title = 'Zoology Sprint'`))[0].id
    const a = (await q(`insert into public.attempts (user_id, test_id, submitted_at) values ($1, $2, now()) returning id`, [s.id, zt]))[0].id
    await q(`insert into public.attempt_answers (attempt_id, question_id) select $1, question_id from public.test_questions where test_id = $2`, [a, zt])
    await call(s2.token, 'POST', '/api/explain/open', { attemptId: a, questionId: Q })
    expect((await call(s.token, 'POST', '/api/tutor/finish', { questionId: Q, reason: 'skip' })).status).toBe(200)
    expect((await call(s.token, 'GET', `/api/explain/${Q}`)).json.answer.text).toBe('SA node')
  })

  it('finishes after 5 student messages even if the script has not', async () => {
    const s = await student()
    const Q = await qid('reaction centre chlorophyll')
    await call(s.token, 'POST', '/api/explain/open', { attemptId: s.attempt, questionId: Q })
    let last
    for (let i = 0; i < 5; i++) last = await turn(s, Q, 'hmm', 'unsure')
    expect(last.json.done).toBe(true)
    expect((await call(s.token, 'GET', `/api/explain/${Q}`)).status).toBe(200)
  })
})

describe('Claude path', () => {
  const good = (over = {}) => ({ json: { verdict: 'on_track', reply: 'Nice. What does the number stand for?', step: 1, established: 'The number is a wavelength', choices: ['A wavelength', 'A count', 'A date'], done: false, ...over }, usage: { input_tokens: 400, output_tokens: 60 }, model: 'fake-model', latencyMs: 25 })

  it('builds the prompt on the server (with the secret), validates and logs token use', async () => {
    useClaude = true; claudeScript = async () => good()
    const s = await student()
    const Q = await qid('reaction centre chlorophyll')
    await call(s.token, 'POST', '/api/explain/open', { attemptId: s.attempt, questionId: Q })
    const t = await turn(s, Q, 'wavelength')
    expect(t.mode).toBe('claude')
    expect(t.json).toMatchObject({ reply: 'Nice. What does the number stand for?', choices: ['A wavelength', 'A count', 'A date'] })
    expect(Object.keys(t.json).sort()).toEqual(['choices', 'done', 'established', 'reply', 'step', 'verdict'])
    expect(prompts[0]).toContain('680 nm') // the correct answer reached the model, not the browser
    const [u] = await q(`select * from public.ai_usage where user_id = $1`, [s.id])
    expect(u).toMatchObject({ source: 'claude', model: 'fake-model', input_tokens: 400, output_tokens: 60, kind: 'turn' })
    expect((await q('select paused_ms from public.tutor_sessions where user_id = $1', [s.id]))[0].paused_ms).toBe(25)
  })

  it('falls back to the scripted tutor when the reply leaks the answer, is invalid, or the API fails', async () => {
    useClaude = true
    const s = await student()
    const Q = await qid('reaction centre chlorophyll')
    await call(s.token, 'POST', '/api/explain/open', { attemptId: s.attempt, questionId: Q })
    claudeScript = async () => good({ reply: 'The correct answer is B, 680 nm.' })
    expect((await turn(s, Q, 'a')).mode).toBe('scripted')
    claudeScript = async () => ({ json: null, usage: {}, model: 'x', latencyMs: 1 })
    expect((await turn(s, Q, 'b', 'unsure')).mode).toBe('scripted')
    claudeScript = async () => { throw new Error('upstream 529') }
    expect((await turn(s, Q, 'c', 'unsure')).mode).toBe('scripted')
    const rows = await q(`select source from public.ai_usage where user_id = $1`, [s.id])
    expect(rows.map((r) => r.source)).toEqual(['error', 'error', 'error'])
  })

  it('enforces the per-student daily limit', async () => {
    useClaude = true; limits = { dailyTurns: 1 }; claudeScript = async () => good()
    const s = await student()
    const Q = await qid('reaction centre chlorophyll')
    await call(s.token, 'POST', '/api/explain/open', { attemptId: s.attempt, questionId: Q })
    expect((await turn(s, Q, 'one')).mode).toBe('claude')
    const second = await turn(s, Q, 'two', 'unsure')
    expect(second.mode).toBe('limited')
    expect(second.status).toBe(200)
  })

  it('ends the session at student message 5 even if the model never says done', async () => {
    useClaude = true; claudeScript = async () => good()
    const s = await student()
    const Q = await qid('reaction centre chlorophyll')
    await call(s.token, 'POST', '/api/explain/open', { attemptId: s.attempt, questionId: Q })
    let last
    for (let i = 0; i < 5; i++) last = await turn(s, Q, 'x' + i)
    expect(last.json).toMatchObject({ done: true, choices: [] })
  })
})

describe('free plan and paywall', () => {
  it('allows two free explanations, then answers 402, and a paid unlock opens everything in that test', async () => {
    const s = await student()
    const [q1, q2, q3] = [await qid('reaction centre chlorophyll'), await qid('primary acceptor of CO2'), await qid('DNA replication')]
    for (const Q of [q1, q2]) expect((await call(s.token, 'POST', '/api/explain/open', { attemptId: s.attempt, questionId: Q })).status).toBe(200)
    const blocked = await call(s.token, 'POST', '/api/explain/open', { attemptId: s.attempt, questionId: q3 })
    expect(blocked.status).toBe(402)
    expect(blocked.json).toMatchObject({ error: 'paywall', testId: s.test })
    // revisiting a free one is still fine
    expect((await call(s.token, 'POST', '/api/explain/open', { attemptId: s.attempt, questionId: q1 })).status).toBe(200)
    await q('insert into public.unlocks (user_id, test_id) values ($1, $2)', [s.id, s.test])
    const paid = await call(s.token, 'POST', '/api/explain/open', { attemptId: s.attempt, questionId: q3 })
    expect(paid.json).toMatchObject({ access: 'paid' })
    expect((await q('select count(*)::int n from public.free_explanation_uses where user_id = $1', [s.id]))[0].n).toBe(2)
  })
})
