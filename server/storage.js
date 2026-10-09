import { createClient } from '@supabase/supabase-js'

/** Signs short-lived URLs for private objects. Uses the service key, so it never reaches the browser. */
export function supabaseStorage({ url, serviceKey }) {
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  return {
    async signedUrl(bucket, path, seconds) {
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, seconds)
      if (error) throw error
      return data.signedUrl
    },
  }
}
