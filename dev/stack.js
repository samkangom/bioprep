// LOCAL DEV / TEST ONLY. Boots PGlite + the Supabase shim (+ the API once it exists) in one process.
//   npm run dev:stack   then   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run dev
import { bootDb, addUser } from './pg.js'
import http from 'node:http'
import { startShim, signJwt, verifyJwt } from './supabase-shim.js'
import { createApp } from '../server/app.js'
import { fromPglite } from '../server/db.js'
import { createClaude } from '../server/claude.js'
import { createMemoryStorage } from './storage-shim.js'

export const DEV_JWT_SECRET = 'dev-only-jwt-secret-do-not-use-anywhere-else'
export const DEV_OTP = '123456'
export const DEV_WEBHOOK_SECRET = 'dev-webhook-secret'
export const DEV_ADMIN_PHONE = '9999999999'
export const DEV_TEACHER_PHONE = '9888888888'

export async function startStack({ shimPort = 54321, apiPort = 8787, seed = true, extra, onDb, apiOptions = {} } = {}) {
  const db = await bootDb({ seed })
  // Pre-created staff so you can sign in as them: +91 9999999999 (admin), +91 9888888888 (teacher), code 123456.
  for (const [phone, role, name] of [[DEV_ADMIN_PHONE, 'admin', 'Dev Admin'], [DEV_TEACHER_PHONE, 'teacher', 'Dev Teacher']]) {
    const id = await addUser(db, '91' + phone, role)
    await db.query(`update public.profiles set name = $2, onboarded = true where id = $1`, [id, name])
  }
  if (onDb) await onDb(db)
  let shimUrl = ''
  let orderSeq = 0
  const storage = createMemoryStorage({
    jwtSecret: DEV_JWT_SECRET, baseUrl: () => shimUrl,
    isStaff: async (uid) => (await db.query(`select role in ('teacher','admin') as s from public.profiles where id = $1`, [uid])).rows[0]?.s === true,
  })
  const shim = await startShim({ db, jwtSecret: DEV_JWT_SECRET, port: shimPort, otp: DEV_OTP, extra: extra || storage.handle })
  shimUrl = `http://127.0.0.1:${shim.address().port}`
  const anonKey = signJwt({ role: 'anon', iss: 'bioprep-dev' }, DEV_JWT_SECRET)

  // The API, wired to the same in-process database. Claude is used only if ANTHROPIC_API_KEY is set,
  // otherwise the scripted tutor answers (deterministic, which is what the e2e tests rely on).
  const claude = process.env.ANTHROPIC_API_KEY ? createClaude({ apiKey: process.env.ANTHROPIC_API_KEY }) : null
  const app = createApp({
    db: fromPglite(db), claude, corsOrigins: true, storage,
    // Fake Razorpay: creates order ids locally. Payments are completed by POSTing a signed webhook (see tests/e2e).
    razorpay: { keyId: 'rzp_test_devstack', createOrder: async ({ amountPaise }) => ({ id: `order_DEV${String(++orderSeq).padStart(5, '0')}`, amount: amountPaise, currency: 'INR', status: 'created' }) },
    razorpayWebhookSecret: DEV_WEBHOOK_SECRET,
    deleteUser: async (id) => { await db.query('delete from auth.users where id = $1', [id]) },
    verifyToken: async (t) => { const p = verifyJwt(t, DEV_JWT_SECRET); return p?.sub ? { id: p.sub } : null },
    ...apiOptions,
  })
  const api = http.createServer(app)
  await new Promise((r) => api.listen(apiPort, '127.0.0.1', r))
  return {
    db, shim, api, storage, anonKey, supabaseUrl: `http://127.0.0.1:${shim.address().port}`, apiUrl: `http://127.0.0.1:${api.address().port}`,
    close: async () => { await new Promise((r) => api.close(r)); await new Promise((r) => shim.close(r)); await db.close() },
  }
}
