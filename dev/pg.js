// Boot an in-process Postgres (PGlite) with the Supabase stub, our migrations and optionally the seed.
// Shared by the vitest suites and the local dev stack. Never used in production.
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
export const migrationFiles = () =>
  fs.readdirSync(path.join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()

export async function bootDb({ seed = false } = {}) {
  const db = new PGlite()
  await db.exec(read('dev/supabase-stub.sql'))
  for (const f of migrationFiles()) await db.exec(read(`supabase/migrations/${f}`))
  if (seed) await db.exec(read('supabase/seed.sql'))
  return db
}

// Run fn(tx) inside a transaction as a Supabase role with the given JWT claims (what PostgREST does).
export async function asRole(db, claims, fn) {
  const role = claims?.sub ? 'authenticated' : 'anon'
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`)
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role, ...(claims || {}) })])
    return fn(tx)
  })
}

export const addUser = async (db, phone, role = 'student') => {
  const { rows } = await db.query(`insert into auth.users (phone) values ($1) returning id`, [phone])
  if (role !== 'student') await db.query(`update public.profiles set role = $2 where id = $1`, [rows[0].id, role])
  return rows[0].id
}
