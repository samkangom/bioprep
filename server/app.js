import express from 'express'
import cors from 'cors'
import { requireUser } from './auth.js'
import { rateLimiter } from './ratelimit.js'
import { HttpError, openSession, runTurn, finishSession, revealExplanation, wrapUp } from './tutor.js'
import { videoUrl } from './video.js'
import { registerPayments, registerWebhook } from './payments.js'
import { TUTOR_DAILY_TURNS } from '../shared/rules.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (v) => typeof v === 'string' && UUID.test(v)
const must = (cond, code = 'bad_request') => { if (!cond) throw new HttpError(400, code) }

/**
 * Builds the API. Everything external is injected so tests and the local stack can swap it:
 *   db           { query, tx }                       (see db.js)
 *   verifyToken  async (token) -> { id } | null
 *   claude       { json(prompt, opts) } | null       (null = scripted tutor only)
 *   extra        (app, ctx) => void                  (later stages mount payments, video, admin routes here)
 */
export function createApp(opts = {}) {
  const { db, verifyToken, corsOrigins = [], extra } = opts
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  // claude and limits are read per request so tests (and a future hot-reload of config) can swap them.
  const ctx = {
    db, verifyToken, opts,
    get claude() { return opts.claude || null },
    get limits() { return { dailyTurns: TUTOR_DAILY_TURNS, ...(opts.limits || {}) } },
    get storage() { return opts.storage || null },
    get videoTtl() { return opts.videoTtl || 600 },
  }

  app.use(cors({ origin: corsOrigins === true ? true : corsOrigins.length ? corsOrigins : false, exposedHeaders: ['X-Tutor-Mode'] }))
  registerWebhook(app, ctx) // needs the raw body, so it is mounted before express.json
  extra?.pre?.(app, ctx)
  app.use(express.json({ limit: '32kb' }))

  const auth = requireUser(verifyToken)
  const burst = rateLimiter({ max: 60 })
  const limited = (req, res, next) => (burst(req.user.id) ? res.status(429).json({ error: 'rate_limited' }) : next())
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

  app.get('/health', (_, res) => res.json({ ok: true }))

  // Open an explanation: the entitlement gate (free plan / paid test) and tutor session start.
  app.post('/api/explain/open', auth, limited, wrap(async (req, res) => {
    const { attemptId, questionId } = req.body || {}
    must(isUuid(attemptId) && isUuid(questionId))
    res.json(await openSession(db, req.user.id, { attemptId, questionId }))
  }))

  app.post('/api/tutor/turn', auth, limited, wrap(async (req, res) => {
    must(isUuid(req.body?.questionId))
    const out = await runTurn(ctx, req.user.id, req.body)
    res.set('X-Tutor-Mode', out.mode).json(out.body)
  }))

  app.post('/api/tutor/finish', auth, limited, wrap(async (req, res) => {
    must(isUuid(req.body?.questionId))
    res.json(await finishSession(db, req.user.id, req.body))
  }))

  app.post('/api/tutor/wrapup', auth, limited, wrap(async (req, res) => {
    must(isUuid(req.body?.questionId))
    res.json(await wrapUp(ctx, req.user.id, req.body))
  }))

  // The answer and explanation: only once the server has marked the session finished.
  app.get('/api/explain/:questionId', auth, limited, wrap(async (req, res) => {
    must(isUuid(req.params.questionId))
    res.json(await revealExplanation(db, req.user.id, req.params.questionId))
  }))

  // Short-lived signed video URL. Entitlement and tutor-session checks happen in video.js.
  app.post('/api/video-url', auth, limited, wrap(async (req, res) => {
    must(isUuid(req.body?.questionId))
    res.set('Cache-Control', 'no-store').json(await videoUrl(ctx, req.user.id, req.body.questionId))
  }))

  registerPayments(app, ctx, { auth, limited, wrap, must, isUuid })

  extra?.routes?.(app, ctx, { auth, limited, wrap, must, isUuid })

  app.use((req, res) => res.status(404).json({ error: 'not_found' }))
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, ...err.extra })
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' })
    console.error('[api]', err)
    res.status(500).json({ error: 'server_error' })
  })
  return app
}
