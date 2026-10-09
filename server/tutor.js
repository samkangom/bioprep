// Tutor service. All secret material (correct answer, explanation, Socratic keys and hints) is loaded here from the
// database and never leaves the server until the session is marked finished.
import {
  sanitizeMessages, turnPrompt, wrapUpPrompt, validateTurn, validateWrapUp, leaksAnswer,
  scriptedTurn, scriptedWrapUp, shuffle, LETTERS,
} from '../shared/tutor-core.js'
import { MAX_HINTS, TUTOR_MAX_TURNS, TUTOR_SECONDS } from '../shared/rules.js'

export class HttpError extends Error {
  constructor(status, code, extra = {}) { super(code); this.status = status; this.code = code; this.extra = extra }
}

const KINDS = ['answer', 'hint', 'unsure']
const GRACE_SECONDS = 3

export async function loadQuestion(db, questionId) {
  const { rows } = await db.query(
    `select q.id, q.text, q.options, q.subject, q.chapter, s.correct, s.explanation, s.why_wrong, s.recap, s.ncert, s.caption, s.video_path
       from public.questions q join public.question_secrets s on s.question_id = q.id
      where q.id = $1 and q.status = 'published'`, [questionId])
  if (!rows[0]) throw new HttpError(404, 'question_not_found')
  const { rows: steps } = await db.query(
    `select position, ask, keys, hint, good, choices from public.socratic_steps where question_id = $1 order by position`, [questionId])
  if (steps.length < 1) throw new HttpError(404, 'question_not_found')
  const r = rows[0]
  return { ...r, whyWrong: r.why_wrong, socratic: steps }
}

/** Latest session for this student and question, with server-measured elapsed seconds. */
export async function latestSession(db, userId, questionId) {
  const { rows } = await db.query(
    `select *, extract(epoch from (now() - started_at))::float8 as elapsed
       from public.tutor_sessions where user_id = $1 and question_id = $2
      order by (status = 'active') desc, started_at desc limit 1`, [userId, questionId])
  return rows[0] || null
}

const secondsLeft = (s) => Math.max(0, Math.round(TUTOR_SECONDS - s.elapsed + s.paused_ms / 1000))

export async function openSession(db, userId, { attemptId, questionId }) {
  let r
  try {
    r = (await db.query('select private.open_explanation($1, $2, $3) as r', [userId, attemptId, questionId])).rows[0].r
  } catch (e) {
    if (e.message === 'paywall') throw new HttpError(402, 'paywall', { testId: e.detail })
    if (/attempt_not_found|question_not_in_attempt/.test(e.message)) throw new HttpError(404, e.message)
    throw e
  }
  const { rows: steps } = await db.query(
    `select position, ask, choices from public.socratic_steps where question_id = $1 order by position`, [questionId])
  if (!steps.length) throw new HttpError(404, 'question_not_found')
  const finished = r.status === 'finished'
  const cur = steps[Math.min(steps.length, r.step) - 1]
  return {
    sessionId: r.session_id, testId: r.test_id, access: r.access, finished, freeLeft: r.free_left,
    step: r.step, steps: steps.length, secondsLeft: finished ? 0 : r.seconds_left,
    ask: finished ? '' : cur.ask, choices: finished ? [] : shuffle(cur.choices || []),
  }
}

async function logUsage(db, userId, questionId, kind, source, u = {}) {
  await db.query(
    `insert into public.ai_usage (user_id, question_id, kind, source, model, input_tokens, output_tokens, latency_ms)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, questionId, kind, source, u.model || null, u.input_tokens || 0, u.output_tokens || 0, u.latencyMs || 0])
}

async function dailyClaudeCalls(db, userId) {
  const { rows } = await db.query(
    `select count(*)::int as n from public.ai_usage
      where user_id = $1 and source = 'claude' and created_at > now() - interval '24 hours'`, [userId])
  return rows[0].n
}

const stepChoices = (q, step) => shuffle(q.socratic[Math.min(q.socratic.length, step) - 1]?.choices || [])

export async function runTurn({ db, claude, limits }, userId, body) {
  const { questionId, kind, messages } = body || {}
  if (!KINDS.includes(kind)) throw new HttpError(400, 'bad_kind')
  const msgs = sanitizeMessages(messages)
  if (!msgs.length || msgs[msgs.length - 1].from !== 'me') throw new HttpError(400, 'bad_messages')

  const session = await latestSession(db, userId, questionId)
  if (!session) throw new HttpError(409, 'no_session')
  if (session.status === 'finished') throw new HttpError(409, 'finished')
  if (session.elapsed - session.paused_ms / 1000 > TUTOR_SECONDS + GRACE_SECONDS) throw new HttpError(409, 'expired')

  const q = await loadQuestion(db, questionId)
  const steps = q.socratic.length
  // Counters are the server's, not the browser's.
  const turns = session.turns + 1
  const hints = kind === 'hint' ? Math.min(MAX_HINTS, session.hints + 1) : session.hints
  const hintLevel = kind === 'hint' ? hints : 1
  const latest = msgs[msgs.length - 1].text

  let res = null, mode = 'scripted', usage = null, source = 'scripted'
  if (claude) {
    if ((await dailyClaudeCalls(db, userId)) >= limits.dailyTurns) {
      mode = 'limited'; source = 'limited'
    } else {
      try {
        const out = await claude.json(turnPrompt({ q, msgs, kind, hintLevel, count: turns }), { maxTokens: 500 })
        usage = out
        const v = validateTurn(out.json, { steps, prevStep: session.step })
        if (v && !leaksAnswer(v.reply, q)) { res = v; mode = 'claude'; source = 'claude' }
        else source = 'error'
      } catch (e) {
        console.error('[tutor] claude failed:', e?.status || '', e?.message || e)
        source = 'error'
      }
    }
  }

  let scriptIdx = session.script_idx
  if (!res) {
    const s = scriptedTurn(q.socratic, scriptIdx, latest, kind, hintLevel)
    if (s.advance) scriptIdx += 1
    const { advance, ...pub } = s
    res = { ...pub, step: Math.max(session.step, pub.step) }
  }

  const done = res.done || turns >= TUTOR_MAX_TURNS
  if (done && !res.done) {
    res = { ...res, done: true, step: steps, reply: `${res.reply} You have thought it through. Open the full explanation when you are ready.` }
  }
  const choices = done ? [] : res.choices.length >= 2 && mode === 'claude' ? res.choices : stepChoices(q, res.step)
  const pausedAdd = Math.round(usage?.latencyMs || 0)

  await db.query(
    `update public.tutor_sessions
        set turns = $2, hints = $3, step = $4, script_idx = $5, paused_ms = paused_ms + $6,
            status = case when $7 then 'finished' else status end,
            finish_reason = case when $7 then 'done' else finish_reason end,
            finished_at = case when $7 then now() else finished_at end
      where id = $1`,
    [session.id, turns, hints, res.step, scriptIdx, pausedAdd, done])
  await logUsage(db, userId, questionId, 'turn', source, usage ? { ...usage, ...usage.usage } : {})

  return {
    mode,
    body: { verdict: res.verdict, reply: res.reply, step: res.step, established: res.established, choices, done },
  }
}

export async function finishSession(db, userId, { questionId, reason }) {
  if (reason !== 'skip' && reason !== 'timeout') throw new HttpError(400, 'bad_reason')
  const s = await latestSession(db, userId, questionId)
  if (!s) throw new HttpError(409, 'no_session')
  if (s.status === 'finished') return { finished: true }
  if (reason === 'timeout' && s.elapsed - s.paused_ms / 1000 < TUTOR_SECONDS - GRACE_SECONDS) throw new HttpError(409, 'too_early')
  await db.query(
    `update public.tutor_sessions set status = 'finished', finish_reason = $2, finished_at = now() where id = $1 and status = 'active'`,
    [s.id, reason])
  return { finished: true }
}

/** The answer and explanation. Only after the server has marked the session finished. */
export async function revealExplanation(db, userId, questionId) {
  const s = await latestSession(db, userId, questionId)
  if (!s || s.status !== 'finished') throw new HttpError(403, 'not_finished')
  const q = await loadQuestion(db, questionId)
  return {
    answer: { index: q.correct, letter: LETTERS[q.correct], text: q.options[q.correct] },
    explanation: q.explanation, whyWrong: q.whyWrong, recap: q.recap, ncert: q.ncert, caption: q.caption,
    hasVideo: !!q.video_path,
  }
}

export async function wrapUp({ db, claude, limits }, userId, { questionId, messages }) {
  const s = await latestSession(db, userId, questionId)
  if (!s || s.status !== 'finished') throw new HttpError(403, 'not_finished')
  const q = await loadQuestion(db, questionId)
  const msgs = sanitizeMessages(messages)
  const spoke = msgs.some((m) => m.from === 'me')
  if (claude && spoke && (await dailyClaudeCalls(db, userId)) < limits.dailyTurns) {
    try {
      const out = await claude.json(wrapUpPrompt({ q, msgs }), { maxTokens: 300 })
      const v = validateWrapUp(out.json)
      await logUsage(db, userId, questionId, 'wrapup', v ? 'claude' : 'error', { ...out, ...out.usage })
      if (v) return v
    } catch (e) {
      console.error('[tutor] wrapup failed:', e?.status || '', e?.message || e)
      await logUsage(db, userId, questionId, 'wrapup', 'error')
    }
  }
  return scriptedWrapUp(q, spoke)
}
