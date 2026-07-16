import { getActiveAgents } from './intelligence.ts'

export type Intent =
  | 'institutional'
  | 'catalog'
  | 'accessory'
  | 'comparison'
  | 'recommendation'
  | 'pricing'
  | 'compatibility'

export interface ClassifierResult {
  intent: Intent
  searchTerms: string[]
}

interface AgentConfig {
  id: string
  provider_name: string
  provider_type: string
  model_id: string
  api_key_secret_name: string
  custom_endpoint?: string
  priority?: number
}

let cachedAgents: AgentConfig[] | null = null
let cachedAgentsAt = 0
const AGENT_CACHE_TTL = 300_000

export async function getCachedAgents(supabase: any): Promise<AgentConfig[]> {
  const now = Date.now()
  if (cachedAgents && now - cachedAgentsAt < AGENT_CACHE_TTL) return cachedAgents
  cachedAgents = await getActiveAgents(supabase)
  cachedAgentsAt = now
  return cachedAgents
}

function sanitizeJSON(text: string): string {
  return text
    .trim()
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim()
}

function resolveApiKey(agent: AgentConfig): string | null {
  if (agent.api_key_secret_name) {
    const key = Deno.env.get(agent.api_key_secret_name)
    if (key) return key
  }
  const pt = (agent.provider_type || agent.provider_name || '').toLowerCase()
  if (pt.includes('openai') || pt.includes('gpt')) return Deno.env.get('OPENAI_API_KEY')
  if (pt.includes('anthropic') || pt.includes('claude')) return Deno.env.get('ANTHROPIC_API_KEY')
  if (pt.includes('google') || pt.includes('gemini')) return Deno.env.get('GOOGLE_API_KEY')
  return null
}

function buildPrompt(query: string, cp?: any): string {
  let p = `You are an intent classifier for a professional audiovisual equipment e-commerce.\nClassify the user's query into exactly ONE intent:\n- "institutional": store hours, warranty, shipping policies, contact, payment methods\n- "catalog": general product search or browsing\n- "accessory": looking for compatible accessories (tripods, batteries, cables, cards, cases)\n- "comparison": comparing two or more products\n- "recommendation": asking for recommendations or suitability\n- "pricing": asking about prices, costs, discounts, availability\n- "compatibility": asking if a product works with another product\n\nAlso extract up to 6 precise search terms (preferably in English).\n\nRespond ONLY with JSON: {"intent":"<intent>","searchTerms":["term1","term2",...]}\n`
  if (cp)
    p += `\nCurrent product - Name: ${cp.name || 'N/A'}, Manufacturer: ${cp.manufacturer || 'N/A'}, Category: ${cp.category || 'N/A'}\n`
  p += `\nUser query: "${query}"`
  return p
}

async function callWithTimeout(fn: () => Promise<Response>): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)
  try {
    const resp = await fn()
    if (!resp.ok) throw new Error(`API error ${resp.status}`)
    const data = await resp.json()
    return (
      data.choices?.[0]?.message?.content ||
      data.content?.[0]?.text ||
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      ''
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

const VALID_INTENTS: Intent[] = [
  'institutional',
  'catalog',
  'accessory',
  'comparison',
  'recommendation',
  'pricing',
  'compatibility',
]

function fallback(query: string): ClassifierResult {
  const terms = query
    .toLowerCase()
    .replace(/[?.,;:!]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 6)
  return { intent: 'catalog', searchTerms: terms.length > 0 ? terms : [query.slice(0, 50)] }
}

export async function classifyIntent(
  query: string,
  supabase: any,
  currentProduct?: { id?: string; name?: string; manufacturer?: string; category?: string },
): Promise<ClassifierResult> {
  const agents = await getCachedAgents(supabase)
  if (agents.length === 0) return fallback(query)

  const agent = agents[0]
  const apiKey = resolveApiKey(agent)
  if (!apiKey || !agent.model_id) return fallback(query)

  const prompt = buildPrompt(query, currentProduct)
  const pt = (agent.provider_type || agent.provider_name || '').toLowerCase()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)

  let raw = ''
  try {
    if (pt.includes('anthropic') || pt.includes('claude')) {
      const endpoint = agent.custom_endpoint || 'https://api.anthropic.com/v1/messages'
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: agent.model_id,
          max_tokens: 300,
          temperature: 0.1,
          system: 'You are a precise intent classifier. Respond only with valid JSON.',
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      })
      if (!resp.ok) throw new Error(`Anthropic ${resp.status}`)
      const d = await resp.json()
      raw = d.content?.[0]?.text || ''
    } else if (pt.includes('google') || pt.includes('gemini')) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${agent.model_id}:generateContent?key=${apiKey}`
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a precise intent classifier. Respond only with valid JSON.\n\n${prompt}`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
        }),
        signal: controller.signal,
      })
      if (!resp.ok) throw new Error(`Google ${resp.status}`)
      const d = await resp.json()
      raw = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
    } else {
      const endpoint = agent.custom_endpoint || 'https://api.openai.com/v1/chat/completions'
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: agent.model_id,
          temperature: 0.1,
          max_tokens: 300,
          messages: [
            {
              role: 'system',
              content: 'You are a precise intent classifier. Respond only with valid JSON.',
            },
            { role: 'user', content: prompt },
          ],
        }),
        signal: controller.signal,
      })
      if (!resp.ok) throw new Error(`OpenAI ${resp.status}`)
      const d = await resp.json()
      raw = d.choices?.[0]?.message?.content || ''
    }
  } catch (err: any) {
    console.error('[intention] AI call failed:', err.message)
    return fallback(query)
  } finally {
    clearTimeout(timeoutId)
  }

  if (!raw || raw.trim().length === 0) return fallback(query)

  let parsed: any
  try {
    parsed = JSON.parse(sanitizeJSON(raw))
  } catch {
    console.error('[intention] Invalid JSON:', sanitizeJSON(raw).slice(0, 200))
    return fallback(query)
  }

  const intent = VALID_INTENTS.includes(parsed.intent) ? parsed.intent : 'catalog'
  const searchTerms = Array.isArray(parsed.searchTerms)
    ? parsed.searchTerms
        .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
        .map((t: any) => t.trim())
        .slice(0, 6)
    : []

  return searchTerms.length > 0 ? { intent, searchTerms } : fallback(query)
}
