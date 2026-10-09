// Client for the Node API (tutor, explanations, videos, payments). Sends the Supabase access token.
import { API_URL } from './config'
import { getSupabase } from './lib/supabase'

export class ApiError extends Error {
  constructor(status, code, data) { super(code); this.status = status; this.code = code; this.data = data }
}

export async function apiRaw(path, { method = 'GET', body, signal } = {}) {
  const { data } = await getSupabase().auth.getSession()
  const token = data.session?.access_token
  let res
  try {
    res = await fetch(API_URL + path, {
      method, signal,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    throw new ApiError(0, 'network')
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, json?.error || 'server_error', json)
  return { json, mode: res.headers.get('X-Tutor-Mode') }
}
export const api = async (path, opts) => (await apiRaw(path, opts)).json
