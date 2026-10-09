import { createClient } from '@supabase/supabase-js'

/** Verifies a Supabase access token by asking Supabase Auth (works with both legacy and asymmetric JWT keys). */
export function supabaseVerifier({ url, serviceKey, ttlMs = 30_000 }) {
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const cache = new Map()
  return async (token) => {
    const hit = cache.get(token)
    if (hit && hit.exp > Date.now()) return hit.user
    const { data, error } = await sb.auth.getUser(token)
    if (error || !data?.user) return null
    const user = { id: data.user.id }
    cache.set(token, { user, exp: Date.now() + ttlMs })
    if (cache.size > 5000) for (const k of cache.keys()) { cache.delete(k); if (cache.size < 4000) break }
    return user
  }
}

export const requireUser = (verifyToken) => async (req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'not_authenticated' })
  try {
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'not_authenticated' })
    req.user = user
    next()
  } catch (e) {
    next(e)
  }
}

/** Deletes an auth user (cascades to all of their data via foreign keys). Service key, server only. */
export function supabaseUserDeleter({ url, serviceKey }) {
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  return async (userId) => {
    const { error } = await sb.auth.admin.deleteUser(userId)
    if (error) throw error
  }
}
