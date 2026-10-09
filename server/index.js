// Production entry point. All configuration comes from environment variables (see ../.env.example).
import pg from 'pg'
import { createApp } from './app.js'
import { fromPool } from './db.js'
import { supabaseVerifier } from './auth.js'
import { createClaude } from './claude.js'
import { supabaseStorage } from './storage.js'
import { TUTOR_DAILY_TURNS } from '../shared/rules.js'

const need = (k) => { if (!process.env[k]) { console.error(`Missing required env var ${k}. See .env.example.`); process.exit(1) } return process.env[k] }

const pool = new pg.Pool({
  connectionString: need('DATABASE_URL'),
  max: Number(process.env.PG_POOL_MAX || 10),
  ssl: process.env.PG_SSL === 'disable' ? false : { rejectUnauthorized: false },
})
const claude = process.env.ANTHROPIC_API_KEY
  ? createClaude({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.CLAUDE_MODEL || 'claude-haiku-5-5', effort: process.env.CLAUDE_EFFORT ?? 'low' })
  : null
if (!claude) console.warn('ANTHROPIC_API_KEY is not set: the tutor will use the built-in scripted guide.')

const app = createApp({
  db: fromPool(pool),
  storage: supabaseStorage({ url: need('SUPABASE_URL'), serviceKey: need('SUPABASE_SERVICE_ROLE_KEY') }),
  videoTtl: Number(process.env.VIDEO_URL_TTL_SECONDS || 600),
  verifyToken: supabaseVerifier({ url: need('SUPABASE_URL'), serviceKey: need('SUPABASE_SERVICE_ROLE_KEY') }),
  claude,
  limits: { dailyTurns: Number(process.env.TUTOR_DAILY_LIMIT || TUTOR_DAILY_TURNS) },
  corsOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
})

const port = Number(process.env.PORT || 8787)
app.listen(port, () => console.log(`BioPrep API on :${port}`))
