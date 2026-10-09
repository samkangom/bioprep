// LOCAL DEV / TEST ONLY. A tiny stand-in for the slice of Supabase (GoTrue + PostgREST) that the app uses, backed by
// PGlite so the real migrations and row-level security run. Not a general PostgREST: unsupported query shapes fail
// loudly (HTTP 501) so we notice if the app starts using something this shim does not model.
//
// Auth: any phone number, the one-time code is DEV_OTP (default 123456).
import http from 'node:http'
import crypto from 'node:crypto'
import { asRole } from './pg.js'

const b64 = (b) => Buffer.from(b).toString('base64url')
export const signJwt = (payload, secret) => {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}
export const verifyJwt = (token, secret) => {
  const [h, p, s] = String(token || '').split('.')
  if (!h || !p || !s) return null
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')
  if (sig.length !== s.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(s))) return null
  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch { return null }
}

const IDENT = /^[a-z_][a-z0-9_]*$/
const ident = (s) => { if (!IDENT.test(s)) throw httpErr(400, 'bad identifier ' + s); return `"${s}"` }
const httpErr = (status, message, code = 'PGRST000') => Object.assign(new Error(message), { status, code })
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }

function parseFilters(params, skip = ['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']) {
  const where = [], args = []
  for (const [k, v] of params) {
    if (skip.includes(k)) continue
    const m = /^(not\.)?([a-z]+)\.(.*)$/s.exec(v)
    if (!m) throw httpErr(501, `unsupported filter ${k}=${v}`)
    const [, neg, op, val] = m
    const col = `${ident(k)}::text`
    let sql
    if (OPS[op]) { args.push(val); sql = `${col} ${OPS[op]} $${args.length}` }
    else if (op === 'in') {
      const list = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''))
      args.push(list); sql = `${col} = any($${args.length}::text[])`
    } else if (op === 'is') sql = `${ident(k)} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`
    else if (op === 'like' || op === 'ilike') { args.push(val.replace(/\*/g, '%')); sql = `${col} ${op} $${args.length}` }
    else throw httpErr(501, `unsupported operator ${op}`)
    where.push(neg ? `not (${sql})` : sql)
  }
  return { where: where.length ? 'where ' + where.join(' and ') : '', args }
}

const cols = (select) => {
  if (!select || select === '*') return '*'
  if (/[()!:]/.test(select)) throw httpErr(501, `embedded/aliased select is not supported by the dev shim: ${select}`)
  return select.split(',').map((c) => ident(c.trim())).join(', ')
}

const pgStatus = (e, authed) => {
  const c = e.code
  if (c === '42501') return authed ? 403 : 401
  if (c === '23505') return 409
  if (c === 'P0002') return 404
  return 400
}

export function createSupabaseShim({ db, jwtSecret, otp = '123456', anonKey }) {
  const refresh = new Map()
  const issue = (user) => {
    const now = Math.floor(Date.now() / 1000)
    const claims = { sub: user.id, role: 'authenticated', aud: 'authenticated', phone: user.phone, iat: now, exp: now + 3600 }
    const rt = crypto.randomUUID()
    refresh.set(rt, user.id)
    return {
      access_token: signJwt(claims, jwtSecret), token_type: 'bearer', expires_in: 3600, expires_at: claims.exp,
      refresh_token: rt, user: { id: user.id, aud: 'authenticated', role: 'authenticated', phone: user.phone, app_metadata: {}, user_metadata: {}, created_at: user.created_at },
    }
  }
  const claimsOf = (req) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const p = verifyJwt(token, jwtSecret)
    return p && p.sub ? p : null
  }

  async function rest(req, url, body) {
    const claims = claimsOf(req)
    const authed = !!claims
    const run = (fn) => asRole(db, claims, fn).catch((e) => { throw Object.assign(e, { status: e.status || pgStatus(e, authed) }) })
    const parts = url.pathname.replace(/^\/rest\/v1\//, '').split('/')
    const params = [...url.searchParams]
    const prefer = String(req.headers.prefer || '')

    if (parts[0] === 'rpc') {
      const fn = ident(parts[1])
      const args = body && typeof body === 'object' ? Object.entries(body) : []
      const call = `public.${fn}(${args.map(([k], i) => `${ident(k)} := $${i + 1}`).join(', ')})`
      const rows = await run((tx) => tx.query(`select ${call} as r`, args.map(([, v]) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v))).then((r) => r.rows))
      const r = rows[0]?.r
      return r === null || r === undefined || r === '' ? { status: 204 } : { json: r }
    }

    const table = `public.${ident(parts[0])}`
    const method = req.method
    const single = String(req.headers.accept || '').includes('vnd.pgrst.object')
    const wrap = (sql) => `with res as (${sql}) select coalesce(jsonb_agg(to_jsonb(res)), '[]'::jsonb) as r from res`
    const finish = (rows, status = 200) => {
      if (single) {
        if (rows.length !== 1) throw httpErr(406, 'JSON object requested, multiple (or no) rows returned', 'PGRST116')
        return { json: rows[0], status }
      }
      return { json: rows, status }
    }

    if (method === 'GET' || method === 'HEAD') {
      const { where, args } = parseFilters(params)
      const order = params.find(([k]) => k === 'order')?.[1]
      const limit = params.find(([k]) => k === 'limit')?.[1]
      const offset = params.find(([k]) => k === 'offset')?.[1]
      const ob = order ? 'order by ' + order.split(',').map((o) => { const [c, d = 'asc'] = o.split('.'); return `${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}` }).join(', ') : ''
      const sql = wrap(`select ${cols(params.find(([k]) => k === 'select')?.[1])} from ${table} ${where} ${ob} ${limit ? `limit ${Number(limit) | 0}` : ''} ${offset ? `offset ${Number(offset) | 0}` : ''}`)
      const rows = await run((tx) => tx.query(sql, args).then((r) => r.rows[0].r))
      return finish(rows)
    }

    if (method === 'POST') {
      const rowsIn = Array.isArray(body) ? body : [body]
      const keys = [...new Set(rowsIn.flatMap((r) => Object.keys(r)))]
      const conflict = params.find(([k]) => k === 'on_conflict')?.[1]
      let onc = ''
      if (prefer.includes('resolution=merge-duplicates')) {
        const target = (conflict || '').split(',').filter(Boolean)
        const set = keys.filter((k) => !target.includes(k)).map((k) => `${ident(k)} = excluded.${ident(k)}`)
        onc = `on conflict (${target.map(ident).join(', ')}) do ${set.length ? 'update set ' + set.join(', ') : 'nothing'}`
      } else if (prefer.includes('resolution=ignore-duplicates')) onc = 'on conflict do nothing'
      const sql = `insert into ${table} (${keys.map(ident).join(', ')}) select ${keys.map(ident).join(', ')} from jsonb_populate_recordset(null::${table}, $1::jsonb) ${onc} returning *`
      const rows = await run((tx) => tx.query(wrap(sql), [JSON.stringify(rowsIn)]).then((r) => r.rows[0].r))
      return prefer.includes('return=representation') ? finish(rows, 201) : { status: 201 }
    }

    if (method === 'PATCH') {
      const keys = Object.keys(body || {})
      const { where, args } = parseFilters(params)
      const set = keys.map((k) => `${ident(k)} = (jsonb_populate_record(null::${table}, $${args.length + 1}::jsonb)).${ident(k)}`).join(', ')
      const sql = wrap(`update ${table} set ${set} ${where} returning *`)
      const rows = await run((tx) => tx.query(sql, [...args, JSON.stringify(body)]).then((r) => r.rows[0].r))
      return prefer.includes('return=representation') ? finish(rows) : { status: 204 }
    }

    if (method === 'DELETE') {
      const { where, args } = parseFilters(params)
      if (!where) throw httpErr(400, 'DELETE needs a filter', 'PGRST000')
      const rows = await run((tx) => tx.query(wrap(`delete from ${table} ${where} returning *`), args).then((r) => r.rows[0].r))
      return prefer.includes('return=representation') ? finish(rows) : { status: 204 }
    }
    throw httpErr(405, 'method not allowed')
  }

  async function auth(req, url, body) {
    const path = url.pathname.replace(/^\/auth\/v1/, '')
    if (path === '/otp' && req.method === 'POST') {
      if (!body?.phone) throw httpErr(400, 'phone required')
      return { json: {} }
    }
    if (path === '/verify' && req.method === 'POST') {
      if (body?.token !== otp) throw httpErr(403, 'Token has expired or is invalid', 'otp_expired')
      const phone = String(body.phone).replace(/^\+/, '')
      const { rows } = await db.query(
        `insert into auth.users (phone) values ($1) on conflict (phone) do update set phone = excluded.phone returning id, phone, created_at`, [phone])
      return { json: issue(rows[0]) }
    }
    if (path === '/token' && req.method === 'POST') {
      const uid = refresh.get(body?.refresh_token)
      if (!uid) throw httpErr(401, 'Invalid Refresh Token', 'refresh_token_not_found')
      const { rows } = await db.query('select id, phone, created_at from auth.users where id = $1', [uid])
      refresh.delete(body.refresh_token)
      return { json: issue(rows[0]) }
    }
    if (path === '/user') {
      const c = claimsOf(req)
      if (!c) throw httpErr(401, 'invalid JWT', 'bad_jwt')
      return { json: { id: c.sub, aud: 'authenticated', role: 'authenticated', phone: c.phone, app_metadata: {}, user_metadata: {} } }
    }
    if (path === '/logout') return { status: 204 }
    throw httpErr(404, 'unknown auth route ' + path)
  }

  return async function handle(req, res, extra) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD')
    res.setHeader('Access-Control-Expose-Headers', 'content-range')
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
    const url = new URL(req.url, 'http://localhost')
    try {
      let body
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const raw = await new Promise((resolve, reject) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => resolve(Buffer.concat(c))); req.on('error', reject) })
        if (url.pathname.startsWith('/storage/')) body = raw
        else if (raw.length) body = JSON.parse(raw.toString())
        if (url.pathname.startsWith('/storage/')) body = raw
      }
      let out
      if (url.pathname.startsWith('/auth/v1/')) out = await auth(req, url, body)
      else if (url.pathname.startsWith('/rest/v1/')) out = await rest(req, url, body)
      else if (extra) out = await extra(req, url, body ?? Buffer.alloc(0), { claimsOf })
      else throw httpErr(404, 'not found')
      if (!out) throw httpErr(404, 'not found')
      res.statusCode = out.status || 200
      if (out.raw) { Object.entries(out.headers || {}).forEach(([k, v]) => res.setHeader(k, v)); return res.end(out.raw) }
      if (out.json !== undefined && res.statusCode !== 204) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(out.json)) }
      res.end()
    } catch (e) {
      res.statusCode = e.status || 500
      res.setHeader('Content-Type', 'application/json')
      if (res.statusCode >= 500 && res.statusCode !== 501) console.error('[shim]', e)
      res.end(JSON.stringify({ code: e.code || 'PGRST000', message: e.message, details: null, hint: null, error: e.message, error_code: e.code, msg: e.message }))
    }
  }
}

export const startShim = ({ db, jwtSecret, port = 54321, otp, extra }) =>
  new Promise((resolve) => {
    const handler = createSupabaseShim({ db, jwtSecret, otp })
    const server = http.createServer((req, res) => handler(req, res, extra))
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
