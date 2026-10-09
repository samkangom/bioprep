// Minimal Claude proxy for the Socratic tutor. Keeps ANTHROPIC_API_KEY off the browser.
// Run: cd server && npm install && ANTHROPIC_API_KEY=sk-... npm start
// Frontend: set VITE_API_URL=http://localhost:8787 in .env.local, then npm run dev.
import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'

const app = express()
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '64kb' }))

const client = new Anthropic() // reads ANTHROPIC_API_KEY
const MODELS = {
  quick: process.env.CLAUDE_MODEL_QUICK || 'claude-haiku-5-5',
  default: process.env.CLAUDE_MODEL_DEFAULT || 'claude-sonnet-5-5',
}

// Naive per-IP limiter. Replace with real auth + per-user quotas before launch.
const hits = new Map()
const limited = (ip) => {
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000)
  recent.push(now); hits.set(ip, recent)
  return recent.length > 30
}

const parseJson = (text) => {
  try { return JSON.parse(text) } catch { /* fall through */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) { try { return JSON.parse(fence[1]) } catch { /* fall through */ } }
  const a = text.indexOf('{'), b = text.lastIndexOf('}')
  if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1))
  throw new Error('No JSON in reply')
}

app.post('/api/claude-json', async (req, res) => {
  if (limited(req.ip)) return res.status(429).json({ error: 'rate_limited' })
  const { prompt, tier } = req.body || {}
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 20_000) return res.status(400).json({ error: 'bad_prompt' })
  try {
    const msg = await client.messages.create({
      model: MODELS[tier] || MODELS.quick,
      max_tokens: 500,
      system: 'You reply with a single JSON object and nothing else.',
      messages: [{ role: 'user', content: prompt }],
    })
    const text = msg.content.filter((c) => c.type === 'text').map((c) => c.text).join('')
    res.json(parseJson(text))
  } catch (e) {
    console.error(e?.message || e)
    res.status(502).json({ error: 'upstream_error' })
  }
})

app.get('/health', (_, res) => res.json({ ok: true }))
const port = process.env.PORT || 8787
app.listen(port, () => console.log(`Tutor server on :${port}`))
