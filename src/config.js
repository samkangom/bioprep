// Runtime configuration (Vite env). With no Supabase env vars, or VITE_USE_MOCK=1, the app runs fully offline
// on the localStorage mock backend (the original clickable prototype).
const env = import.meta.env || {}
export const SUPABASE_URL = env.VITE_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || ''
export const API_URL = (env.VITE_API_URL || '').replace(/\/$/, '')
export const USE_MOCK = env.VITE_USE_MOCK === '1' || !SUPABASE_URL || !SUPABASE_ANON_KEY
export const RAZORPAY_KEY_ID = env.VITE_RAZORPAY_KEY_ID || ''
