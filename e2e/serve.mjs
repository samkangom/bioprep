// Test server for Playwright: local stack + Vite, on fixed ports.
import { createServer } from 'vite'
import { startStack } from '../dev/stack.js'

export const PORTS = { shim: 54399, api: 8799, web: 5180 }
const stack = await startStack({ shimPort: PORTS.shim, apiPort: PORTS.api })
const vite = await createServer({
  root: process.cwd(), logLevel: 'warn', server: { host: '127.0.0.1', port: PORTS.web, strictPort: true },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(stack.supabaseUrl),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(stack.anonKey),
    'import.meta.env.VITE_API_URL': JSON.stringify(stack.apiUrl),
  },
})
await vite.listen()
console.log(`e2e stack ready: web ${PORTS.web}, api ${stack.apiUrl}, auth/db ${stack.supabaseUrl}`)
const stop = async () => { await vite.close(); await stack.close(); process.exit(0) }
process.on('SIGTERM', stop); process.on('SIGINT', stop)
