import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bootDb, addUser } from '../dev/pg.js'
import { fromPglite } from './db.js'
import { createApp } from './app.js'

let pg, server, base
const deleted = []
beforeAll(async () => {
  pg = await bootDb({ seed: true })
  const app = createApp({
    db: fromPglite(pg), verifyToken: async (t) => (/^[0-9a-f-]{36}$/.test(t) ? { id: t } : null),
    deleteUser: async (id) => { deleted.push(id); await pg.query('delete from auth.users where id = $1', [id]) },
  })
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r) })
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(async () => { await new Promise((r) => server.close(r)); await pg.close() })
const call = async (token, method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, json: await res.json() }
}

describe('my data', () => {
  it('exports only my own data', async () => {
    const a = await addUser(pg, '919800040001'), b = await addUser(pg, '919800040002')
    const tid = (await pg.query(`select id from public.tests limit 1`)).rows[0].id
    await pg.query(`insert into public.attempts (user_id, test_id, submitted_at, score, max_score) values ($1, $2, now(), 8, 20)`, [a, tid])
    await pg.query(`insert into public.attempts (user_id, test_id, submitted_at, score, max_score) values ($1, $2, now(), 99, 100)`, [b, tid])
    expect((await call(null, 'GET', '/api/me/export')).status).toBe(401)
    const r = await call(a, 'GET', '/api/me/export')
    expect(r.status).toBe(200)
    expect(r.json.profile.id).toBe(a)
    expect(r.json.attempts).toHaveLength(1)
    expect(r.json.attempts[0].score).toBe(8)
    expect(JSON.stringify(r.json)).not.toContain(b)
    expect(r.json.note).toMatch(/not stored/)
  })

  it('deletes the account only with an explicit confirmation, and a signed-in user can only delete themselves', async () => {
    const a = await addUser(pg, '919800040003')
    expect((await call(a, 'DELETE', '/api/me', {})).status).toBe(400)
    expect((await call(a, 'DELETE', '/api/me', { confirm: 'delete' })).status).toBe(400)
    expect((await call(null, 'DELETE', '/api/me', { confirm: 'DELETE' })).status).toBe(401)
    expect((await pg.query('select count(*)::int n from public.profiles where id = $1', [a])).rows[0].n).toBe(1)
    const r = await call(a, 'DELETE', '/api/me', { confirm: 'DELETE' })
    expect(r).toMatchObject({ status: 200, json: { deleted: true } })
    expect(deleted).toContain(a)
    expect((await pg.query('select count(*)::int n from public.profiles where id = $1', [a])).rows[0].n).toBe(0)
  })

  it('refuses to delete the last admin', async () => {
    const admin = await addUser(pg, '919800040004', 'admin')
    expect((await call(admin, 'DELETE', '/api/me', { confirm: 'DELETE' })).json.error).toBe('last_admin')
    const admin2 = await addUser(pg, '919800040005', 'admin')
    expect((await call(admin, 'DELETE', '/api/me', { confirm: 'DELETE' })).status).toBe(200)
    expect(admin2).toBeTruthy()
  })
})
