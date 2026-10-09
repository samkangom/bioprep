// Small in-memory sliding-window limiter, per key (user id). Per-instance burst protection only;
// the per-student daily AI budget lives in the database so it holds across instances.
export function rateLimiter({ windowMs = 60_000, max = 40 } = {}) {
  const hits = new Map()
  return (key) => {
    const now = Date.now()
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs)
    recent.push(now)
    hits.set(key, recent)
    if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k)
    return recent.length > max
  }
}
