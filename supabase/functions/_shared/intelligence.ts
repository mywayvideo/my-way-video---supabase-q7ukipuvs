interface GenContext {
  agentSettings?: any
  aiSettings?: any
  institutionalContext?: string
  history?: any[]
  products?: any[]
  manufacturerList?: string
  currentProductId?: string | null
  contextualProductData?: any
}

interface AIResult {
  content: string
  confidence_level: string
  referenced_internal_products: string[]
  should_show_whatsapp_button: boolean
}

const BLOCKED_DOMAINS = [
  'bhphotovideo.com',
  'amazon.com',
  'adorama.com',
  'ebay.com',
  'aliexpress.com',
  'walmart.com',
  'bestbuy.com',
  'mercadolivre.com',
]

const PARSE_ERROR_MESSAGE =
  'Desculpe, ocorreu um erro ao processar sua resposta. Tente reformular sua pergunta.'

export async function getActiveAgents(supabase: any) {
  const { data, error } = await supabase
    .from('ai_providers')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true })
  if (error || !data) return []
  return data
}

function isHallucinatedProductRef(ref: string): boolean {
  if (!ref || typeof ref !== 'string') return true
  const lower = ref.toLowerCase()
  if (BLOCKED_DOMAINS.some((d) => lower.includes(d))) return true
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(ref)) return true
  return false
}

function buildSystemPrompt(ctx: GenContext): string {
  const parts: string[] = []
  parts.push(
    ctx.agentSettings?.system_prompt ||
      ctx.aiSettings?.system_prompt_template ||
      'You are a helpful assistant for an audiovisual e-commerce. Responda em português. Sempre retorne JSON.',
  )
  if (ctx.institutionalContext)
    parts.push(`\n## Informações Institucionais\n${ctx.institutionalContext}`)
  if (ctx.manufacturerList) parts.push(`\n## Fabricantes Disponíveis\n${ctx.manufacturerList}`)
  if (ctx.aiSettings?.logistics_rules_prompt)
    parts.push(`\n## Regras de Logística\n${ctx.aiSettings.logistics_rules_prompt}`)

  parts.push(
    '\n## REGRA ANTI-ALUCINAÇÃO (NÃO NEGOCIÁVEL)\n' +
      'Se KNOWLEDGE_BASE/PRODUTOS estiver vazio, você está PROIBIDO de inventar, citar ou listar qualquer produto com ID, SKU, preço ou imagem. ' +
      'Responda apenas em texto descritivo genérico, sem estrutura de produto. ' +
      'NUNCA referencie produtos de terceiros ou domínios externos (ex: bhphotovideo.com, amazon.com). ' +
      'Os campos "referenced_internal_products" só devem conter UUIDs que foram fornecidos no contexto de produtos.',
  )

  parts.push(
    '\nResponda SEMPRE em JSON: {"content":"texto","confidence_level":"high|medium|low","referenced_internal_products":["uuid"],"should_show_whatsapp_button":boolean}',
  )
  return parts.join('\n')
}

function buildMessages(query: string, ctx: GenContext, systemPrompt: string): any[] {
  const msgs: any[] = [{ role: 'system', content: systemPrompt }]
  if (ctx.history?.length) {
    for (const m of ctx.history.slice(-10)) {
      if (m.role && m.content) msgs.push({ role: m.role, content: m.content })
    }
  }
  let user = query
  if (ctx.products?.length) user += `\n\n## Produtos do catálogo:\n${JSON.stringify(ctx.products)}`
  if (ctx.contextualProductData)
    user += `\n\n## Produto em visualização:\n${JSON.stringify(ctx.contextualProductData)}`
  msgs.push({ role: 'user', content: user })
  return msgs
}

function parseResult(content: string): AIResult {
  const userFriendlyError: AIResult = {
    content: PARSE_ERROR_MESSAGE,
    confidence_level: 'low',
    referenced_internal_products: [],
    should_show_whatsapp_button: false,
  }

  if (!content || content.trim().length === 0) {
    console.error('[intelligence] parseResult error: empty content, length=0')
    return userFriendlyError
  }

  try {
    const m = content.match(/\{[\s\S]*\}/)
    if (!m) {
      console.error(
        `[intelligence] parseResult error: no JSON structure found, contentLength=${content.length}`,
      )
      console.error(`[intelligence] raw response: ${content.slice(0, 500)}`)
      return userFriendlyError
    }

    const parsed = JSON.parse(m[0])

    return {
      content:
        typeof parsed.content === 'string' && parsed.content.trim().length > 0
          ? parsed.content
          : userFriendlyError.content,
      confidence_level: parsed.confidence_level || 'medium',
      referenced_internal_products: Array.isArray(parsed.referenced_internal_products)
        ? parsed.referenced_internal_products.filter((id: any) => typeof id === 'string')
        : [],
      should_show_whatsapp_button: Boolean(parsed.should_show_whatsapp_button),
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'unknown error'
    console.error(`[intelligence] parseResult error: ${errorMsg}, contentLength=${content.length}`)
    console.error(`[intelligence] raw response: ${content.slice(0, 500)}`)
    return userFriendlyError
  }
}

async function callProvider(provider: any, messages: any[]): Promise<AIResult | null> {
  const apiKey = Deno.env.get(provider.api_key_secret_name || '') || ''
  const model = provider.model_id || 'gpt-4o-mini'
  const ptype = (provider.provider_type || provider.provider_name || '').toLowerCase()
  let url = provider.custom_endpoint || 'https://api.openai.com/v1/chat/completions'
  let headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  let body: any = { model, messages, temperature: 0.3, max_tokens: 2000 }

  if (ptype.includes('anthropic') || ptype.includes('claude')) {
    url = 'https://api.anthropic.com/v1/messages'
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
    const sys = messages.find((m) => m.role === 'system')?.content || ''
    body = {
      model,
      system: sys,
      messages: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 2000,
    }
  } else if (ptype.includes('deepseek')) {
    url = 'https://api.deepseek.com/v1/chat/completions'
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.error(`[callProvider] ${provider.provider_name} returned ${res.status}`)
    return null
  }
  const data = await res.json()
  const content = ptype.includes('anthropic')
    ? data?.content?.[0]?.text
    : data?.choices?.[0]?.message?.content
  return parseResult(content || '')
}

export async function generateResponse(
  query: string,
  ctx: GenContext,
  _modelOverride: string | undefined,
  supabase: any,
): Promise<AIResult> {
  const providers = await getActiveAgents(supabase)
  if (providers.length === 0) throw new Error('No active AI providers')
  const messages = buildMessages(query, ctx, buildSystemPrompt(ctx))

  for (const p of providers) {
    try {
      const r = await callProvider(p, messages)
      if (r) {
        const hasContextProducts = ctx.products && ctx.products.length > 0

        if (!hasContextProducts && r.referenced_internal_products.length > 0) {
          console.log(
            `[intelligence] blocked hallucinated products count=${r.referenced_internal_products.length} sample=${JSON.stringify(r.referenced_internal_products.slice(0, 3))} reason=no_products_in_context`,
          )
          r.referenced_internal_products = []
        }

        if (hasContextProducts && r.referenced_internal_products.length > 0) {
          const blocked: string[] = []
          const valid: string[] = []
          for (const ref of r.referenced_internal_products) {
            if (isHallucinatedProductRef(ref)) {
              blocked.push(ref)
            } else {
              valid.push(ref)
            }
          }
          if (blocked.length > 0) {
            console.log(
              `[intelligence] blocked hallucinated products count=${blocked.length} sample=${JSON.stringify(blocked.slice(0, 3))} reason=invalid_uuid_or_domain_ref`,
            )
          }
          r.referenced_internal_products = valid
        }

        return r
      }
    } catch (e) {
      console.error(`[generateResponse] ${p.provider_name} failed:`, e)
    }
  }
  throw new Error('All AI providers failed')
}
