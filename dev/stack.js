// LOCAL DEV / TEST ONLY. Boots PGlite + the Supabase shim (+ the API once it exists) in one process.
//   npm run dev:stack   then   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run dev
import { bootDb, addUser } from './pg.js'
import { startShim, signJwt } from './supabase-shim.js'

export const DEV_JWT_SECRET = 'dev-only-jwt-secret-do-not-use-anywhere-else'
export const DEV_OTP = '123456'
export const DEV_ADMIN_PHONE = '9999999999'
export const DEV_TEACHER_PHONE = '9888888888'

export async function startStack({ shimPort = 54321, seed = true, extra, onDb } = {}) {
  const db = await bootDb({ seed })
  // Pre-created staff so you can sign in as them: +91 9999999999 (admin), +91 9888888888 (teacher), code 123456.
  for (const [phone, role, name] of [[DEV_ADMIN_PHONE, 'admin', 'Dev Admin'], [DEV_TEACHER_PHONE, 'teacher', 'Dev Teacher']]) {
    const id = await addUser(db, '91' + phone, role)
    await db.query(`update public.profiles set name = $2, onboarded = true where id = $1`, [id, name])
  }
  if (onDb) await onDb(db)
  const shim = await startShim({ db, jwtSecret: DEV_JWT_SECRET, port: shimPort, otp: DEV_OTP, extra })
  const anonKey = signJwt({ role: 'anon', iss: 'bioprep-dev' }, DEV_JWT_SECRET)
  return {
    db, shim, anonKey, supabaseUrl: `http://127.0.0.1:${shim.address().port}`,
    close: async () => { await new Promise((r) => shim.close(r)); await db.close() },
  }
}
