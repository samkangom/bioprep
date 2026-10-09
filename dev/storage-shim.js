// LOCAL DEV / TEST ONLY. In-memory stand-in for Supabase Storage: upload, remove, signed URLs, range reads.
// It mirrors the real bucket rules (private videos <= 200 MB mp4, public diagrams <= 5 MB images, staff-only writes).
import crypto from 'node:crypto'
import { signJwt, verifyJwt } from './supabase-shim.js'

const BUCKETS = {
  videos: { public: false, max: 209715200, types: ['video/mp4'] },
  diagrams: { public: true, max: 5242880, types: ['image/png', 'image/jpeg', 'image/webp'] },
}
const err = (status, message) => Object.assign(new Error(message), { status, code: 'storage_error' })

export function createMemoryStorage({ jwtSecret, baseUrl, isStaff }) {
  const objects = new Map()
  const key = (bucket, path) => `${bucket}/${path}`
  const sign = (bucket, path, seconds) =>
    `/object/sign/${bucket}/${path}?token=${signJwt({ url: key(bucket, path), exp: Math.floor(Date.now() / 1000) + seconds }, jwtSecret)}`

  function serve(req, k) {
    const o = objects.get(k)
    if (!o) throw err(404, 'Object not found')
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
    const base = { 'Content-Type': o.type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=0' }
    if (!range) return { raw: o.buf, headers: { ...base, 'Content-Length': o.buf.length } }
    const start = range[1] === '' ? Math.max(0, o.buf.length - Number(range[2])) : Number(range[1])
    const end = range[1] !== '' && range[2] !== '' ? Math.min(Number(range[2]), o.buf.length - 1) : o.buf.length - 1
    const slice = o.buf.subarray(start, end + 1)
    return { status: 206, raw: slice, headers: { ...base, 'Content-Length': slice.length, 'Content-Range': `bytes ${start}-${end}/${o.buf.length}` } }
  }

  return {
    objects,
    put: (bucket, path, buf, type = 'video/mp4') => objects.set(key(bucket, path), { buf, type }),
    sign,
    signedUrl: async (bucket, path, seconds) => baseUrl() + '/storage/v1' + sign(bucket, path, seconds),
    // Hook for createSupabaseShim's `extra`.
    async handle(req, url, raw, { claimsOf }) {
      if (!url.pathname.startsWith('/storage/v1/')) return null
      const parts = url.pathname.replace('/storage/v1/', '').split('/') // object, [sign|public], bucket, ...path
      if (parts[0] !== 'object') throw err(404, 'not found')
      const claims = claimsOf(req)
      const staff = claims ? await isStaff(claims.sub) : false
      const bucketOf = (name) => { const b = BUCKETS[name]; if (!b) throw err(404, 'Bucket not found'); return b }

      if (parts[1] === 'public') {
        const [, , bucket, ...p] = parts
        if (!bucketOf(bucket).public) throw err(400, 'Bucket is not public')
        return serve(req, key(bucket, decodeURI(p.join('/'))))
      }
      if (parts[1] === 'sign' && req.method === 'GET') {
        const [, , bucket, ...p] = parts
        const path = decodeURI(p.join('/'))
        const t = verifyJwt(url.searchParams.get('token'), jwtSecret)
        if (!t || t.url !== key(bucket, path)) throw err(401, 'Invalid or expired token')
        return serve(req, key(bucket, path))
      }
      if (parts[1] === 'sign' && req.method === 'POST') {
        const [, , bucket, ...p] = parts
        if (!staff) throw err(403, 'new row violates row-level security policy')
        const path = decodeURI(p.join('/'))
        if (!objects.has(key(bucket, path))) throw err(404, 'Object not found')
        const body = JSON.parse(raw.toString() || '{}')
        return { json: { signedURL: sign(bucket, path, Number(body.expiresIn) || 600) } }
      }
      if (req.method === 'DELETE' && parts.length === 2) {
        if (!staff) throw err(403, 'new row violates row-level security policy')
        const bucket = parts[1]
        const { prefixes = [] } = JSON.parse(raw.toString() || '{}')
        prefixes.forEach((p) => objects.delete(key(bucket, p)))
        return { json: prefixes.map((name) => ({ name, bucket_id: bucket })) }
      }
      if ((req.method === 'POST' || req.method === 'PUT') && parts.length >= 3) {
        const [, bucket, ...p] = parts
        const path = decodeURI(p.join('/'))
        const b = bucketOf(bucket)
        if (!staff) throw err(403, 'new row violates row-level security policy')
        const type = String(req.headers['content-type'] || '').split(';')[0]
        if (!b.types.includes(type)) throw err(415, `mime type ${type} is not supported`)
        if (raw.length > b.max) throw err(413, 'The object exceeded the maximum allowed size')
        if (objects.has(key(bucket, path)) && req.headers['x-upsert'] !== 'true') throw err(409, 'The resource already exists')
        objects.set(key(bucket, path), { buf: raw, type })
        return { json: { Key: key(bucket, path), Id: crypto.randomUUID() } }
      }
      throw err(404, 'not found')
    },
  }
}
