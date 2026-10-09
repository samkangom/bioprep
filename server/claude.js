import Anthropic from '@anthropic-ai/sdk'
import { parseJson } from '../shared/tutor-core.js'

const SYSTEM = 'You reply with a single JSON object and nothing else.'

/** Thin wrapper over the Claude Messages API: one prompt in, parsed JSON + token usage out. */
export function createClaude({ apiKey, model = 'claude-haiku-5-5', effort = 'low', timeoutMs = 20_000 }) {
  const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 })
  return {
    model,
    async json(prompt, { maxTokens = 500 } = {}) {
      const t0 = Date.now()
      const msg = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: SYSTEM,
        ...(effort ? { output_config: { effort } } : {}),
        messages: [{ role: 'user', content: prompt }],
      })
      const usage = { input_tokens: msg.usage?.input_tokens || 0, output_tokens: msg.usage?.output_tokens || 0 }
      if (msg.stop_reason === 'refusal') return { json: null, usage, model: msg.model || model, latencyMs: Date.now() - t0, refused: true }
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
      return { json: parseJson(text), usage, model: msg.model || model, latencyMs: Date.now() - t0 }
    },
  }
}
