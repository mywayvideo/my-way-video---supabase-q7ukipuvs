import { createClient } from 'npm:@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

export interface AIProvider {
  id: string
  provider_name: string
  provider_type: string
  model_id: string
  api_key_secret_name: string
  custom_endpoint: string | null
  is_active: boolean
  priority: integer
}

export async function getActiveAgents(): Promise<AIProvider[]> {
  const client = getAdminClient()
  const { data, error } = await client
    .from('ai_providers')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true })

  if (error) {
    console.error('[intelligence] Error fetching active agents:', error)
    return []
  }

  return (data ?? []) as AIProvider[]
}

function resolveApiKey(secretName: string): string {
  const key = Deno.env.get(secretName)
  if (!key) {
    console.warn(`[intelligence] API key not found for secret: ${secretName}`)
    return ''
  }
  return key
}

function getProviderConfig(provider: AIProvider) {
  const apiKey = resolveApiKey(provider.api_key_secret_name)
  const model = provider.model_id || 'gpt-4o-mini'

  switch (provider.provider_type?.toLowerCase()) {
    case 'openai':
      return {
        endpoint: provider.custom_endpoint || 'https://api.openai.com/v1/chat/completions',
        apiKey,
        model,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    case 'deepseek':
      return {
        endpoint: provider.custom_endpoint || 'https://api.deepseek.com/v1/chat/completions',
        apiKey,
        model: model || 'deepseek-chat',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    case 'anthropic':
      return {
        endpoint: provider.custom_endpoint || 'https://api.anthropic.com/v1/messages',
        apiKey,
        model: model || 'claude-3-5-sonnet-20241022',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      }
    default:
      return {
        endpoint: provider.custom_endpoint || 'https://api.openai.com/v1/chat/completions',
        apiKey,
        model,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
  }
}

function buildRequestBody(
  provider: AIProvider,
  config: ReturnType<typeof getProviderConfig>,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
) {
  if (provider.provider_type?.toLowerCase() === 'anthropic') {
    const systemMsg = messages.find((m) => m.role === 'system')
    const userMsgs = messages.filter((m) => m.role !== 'system')
    return {
      model: config.model,
      max_tokens: 2000,
      temperature,
      system: systemMsg?.content ?? '',
      messages: userMsgs.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    }
  }
  return {
    model: config.model,
    messages,
    temperature,
    max_tokens: 2000,
  }
}

function extractContent(provider: AIProvider, data: any): string {
  if (provider.provider_type?.toLowerCase() === 'anthropic') {
    return data?.content?.map((c: any) => c.text).join('') ?? ''
  }
  return data?.choices?.[0]?.message?.content ?? ''
}

export async function generateResponse(
  messages: Array<{ role: string; content: string }>,
  options: { temperature?: number; provider?: AIProvider } = {},
): Promise<string> {
  const temperature = options.temperature ?? 0.3

  let providers: AIProvider[] = []
  if (options.provider) {
    providers = [options.provider]
  } else {
    providers = await getActiveAgents()
  }

  if (providers.length === 0) {
    console.warn('[intelligence] No active AI providers available')
    return 'Desculpe, não foi possível processar sua solicitação no momento.'
  }

  for (const provider of providers) {
    const config = getProviderConfig(provider)
    if (!config.apiKey) continue

    try {
      const body = buildRequestBody(provider, config, messages, temperature)
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error(
          `[intelligence] Provider ${provider.provider_name} returned ${response.status}: ${errText}`,
        )
        continue
      }

      const data = await response.json()
      const content = extractContent(provider, data)
      if (content) return content
    } catch (err) {
      console.error(`[intelligence] Error with provider ${provider.provider_name}:`, err)
      continue
    }
  }

  return 'Desculpe, não foi possível obter uma resposta dos provedores de IA no momento.'
}
