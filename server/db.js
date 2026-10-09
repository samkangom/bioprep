// Database adapters. The API only needs { query(sql, params) -> {rows}, tx(fn) }.
export function fromPool(pool) {
  return {
    query: (sql, params) => pool.query(sql, params),
    async tx(fn) {
      const c = await pool.connect()
      try {
        await c.query('begin')
        const out = await fn({ query: (s, p) => c.query(s, p) })
        await c.query('commit')
        return out
      } catch (e) {
        await c.query('rollback').catch(() => {})
        throw e
      } finally {
        c.release()
      }
    },
  }
}
// PGlite (tests and the local dev stack only).
export const fromPglite = (pg) => ({ query: (s, p) => pg.query(s, p), tx: (fn) => pg.transaction(fn) })
