import { startStack, DEV_OTP, DEV_ADMIN_PHONE, DEV_TEACHER_PHONE } from './stack.js'

const s = await startStack()
console.log(`
Local BioPrep stack (PGlite + Supabase shim) is running. In-memory: data resets when you stop it.

  VITE_SUPABASE_URL=${s.supabaseUrl}
  VITE_SUPABASE_ANON_KEY=${s.anonKey}

Put those two lines in .env.local, then run: npm run dev
Sign in with any 10-digit mobile number starting 6-9. One-time code: ${DEV_OTP}
Staff: ${DEV_ADMIN_PHONE} (admin), ${DEV_TEACHER_PHONE} (teacher)
`)
