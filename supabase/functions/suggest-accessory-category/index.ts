import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

// Sugere a categoria-mãe de produtos hoje em "Accessories".
// Apenas SUGERE: quem aplica é o admin, produto a produto, no front.

interface ProductIn {
  id: string
  name: string
  sku?: string | null
  description?: string | null
}

interface CategoryIn {
  id: string
  name: string
}

interface SuggestionItem {
  productId?: string
  categoryId?: string | null
  justification?: string
}

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders })
}

async function callProvider(
  providerType: string,
  customEndpoint: string | null,
  modelId: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  let url = ''
  let body: Record<string, unknown> = { model: modelId, messages }

  if (providerType === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions'
    body = { ...body, response_format: { type: 'json_object' } }
  } else if (providerType === 'deepseek') {
    url = 'https://api.deepseek.com/chat/completions'
    body = { ...body, response_format: { type: 'json_object' } }
  } else if (providerType === 'custom' && customEndpoint) {
    url = customEndpoint
  } else {
    throw new Error(`Provedor não suportado: ${providerType}`)
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Provedor respondeu ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

function parseSuggestions(raw: string): SuggestionItem[] {
  const cleaned = raw.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(cleaned)
  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed?.suggestions)) return parsed.suggestions
  return []
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAdmin = createClient(supabaseUrl, serviceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autorizado' }, 401)

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return json({ error: 'Não autorizado' }, 401)

    // Mesmo check de admin usado em create-customer
    const { data: adminCustomer } = await supabaseAdmin
      .from('customers')
      .select('role')
      .eq('user_id', user.id)
      .single()
    if (adminCustomer?.role !== 'admin') return json({ error: 'Acesso negado' }, 403)

    const body = await req.json()
    const products: ProductIn[] = Array.isArray(body?.products) ? body.products.slice(0, 20) : []
    const categories: CategoryIn[] = Array.isArray(body?.categories) ? body.categories : []
    if (products.length === 0 || categories.length === 0) return json({ suggestions: [] })

    // Reaproveita a cadeia de provedores ativos (ai_providers, por prioridade)
    const { data: providers, error: provError } = await supabaseAdmin
      .from('ai_providers')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: true })
    if (provError || !providers || providers.length === 0) {
      return json({ error: 'Nenhum provedor de IA ativo' }, 503)
    }

    const systemPrompt =
      'Você classifica acessórios de áudio e vídeo profissional para o e-commerce My Way Video. ' +
      'Para cada produto, escolha UMA categoria-mãe da lista, a categoria principal à qual o acessório serve ' +
      '(ex.: dolly é acessório de Tripods & Rigs; RCP é acessório de Cameras; adaptador P2→XLR é acessório de Audio). ' +
      'Se não houver destino claro, use categoryId null. Use somente ids da lista. ' +
      'Responda somente JSON no formato {"suggestions":[{"productId":"...","categoryId":"... ou null","justification":"justificativa curta em português"}]}.'

    const userPrompt =
      'Categorias-mãe:\n' +
      categories.map((c) => `- ${c.id} | ${c.name}`).join('\n') +
      '\n\nProdutos:\n' +
      products
        .map(
          (p) =>
            `- id: ${p.id} | nome: ${p.name} | SKU: ${p.sku || ''} | descrição: ${(p.description || '').slice(0, 400)}`,
        )
        .join('\n')

    let content = ''
    for (const provider of providers) {
      const pType = provider.provider_type || provider.provider_name
      const apiKey = Deno.env.get(provider.api_key_secret_name)
      if (!apiKey) continue
      try {
        content = await callProvider(
          pType,
          provider.custom_endpoint,
          provider.model_id,
          apiKey,
          systemPrompt,
          userPrompt,
        )
        if (content) break
      } catch (e) {
        console.error('suggest-accessory-category provider failed', pType, e)
      }
    }
    if (!content) return json({ error: 'A IA não respondeu. Tente novamente.' }, 502)

    let items: SuggestionItem[] = []
    try {
      items = parseSuggestions(content)
    } catch (e) {
      console.error('suggest-accessory-category parse failed', e)
      return json({ error: 'Resposta da IA inválida. Tente novamente.' }, 502)
    }

    const validCategoryIds = new Set(categories.map((c) => String(c.id)))
    const byProduct = new Map<string, SuggestionItem>()
    for (const item of items) {
      if (item && item.productId) byProduct.set(String(item.productId), item)
    }

    const suggestions = products.map((p) => {
      const item = byProduct.get(String(p.id))
      const cid = item?.categoryId ? String(item.categoryId) : null
      return {
        productId: String(p.id),
        categoryId: cid && validCategoryIds.has(cid) ? cid : null,
        justification: String(
          item?.justification ||
            (item ? 'Sem justificativa informada' : 'A IA não retornou sugestão para este produto'),
        ),
      }
    })

    return json({ suggestions })
  } catch (e) {
    console.error('suggest-accessory-category error', e)
    return json({ error: 'Erro interno ao sugerir categorias' }, 500)
  }
})
