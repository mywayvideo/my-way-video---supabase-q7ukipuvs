import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

// Headers CORS inline para garantir deploy autônomo sem dependências externas de ../_shared
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

interface FirecrawlCreditUsageResponse {
  success?: boolean
  error?: string
  data?: {
    remainingCredits?: number
    planCredits?: number
    billingPeriodStart?: string
    billingPeriodEnd?: string
    [key: string]: unknown
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido. Use GET ou POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY') || ''

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          error: 'Configuração interna do servidor indisponível.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 1. Verificação de autenticação: cabeçalho Authorization obrigatório
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({
          error: 'Acesso não autorizado. Sessão admin necessária.',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return new Response(
        JSON.stringify({
          error: 'Token de autenticação não fornecido.',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // Se a chamada foi feita diretamente com a service_role (chamadas server-to-server)
    let isAdmin = token === serviceRoleKey

    if (!isAdmin) {
      // Validar JWT do usuário
      const supabaseUserClient = createClient(supabaseUrl, anonKey || serviceRoleKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      })

      const {
        data: { user },
        error: userError,
      } = await supabaseUserClient.auth.getUser(token)

      if (userError || !user) {
        return new Response(
          JSON.stringify({
            error: 'Sessão inválida ou expirada. Faça login novamente.',
          }),
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      // Validar role admin na tabela customers
      const { data: customerData, error: customerErr } = await supabaseAdmin
        .from('customers')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()

      if (customerErr || !customerData || customerData.role !== 'admin') {
        return new Response(
          JSON.stringify({
            error: 'Permissão negada. Apenas administradores podem consultar créditos Firecrawl.',
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }
      isAdmin = true
    }

    // 2. Validação da chave do Firecrawl
    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({
          error: 'Chave da API Firecrawl não configurada no backend (FIRECRAWL_API_KEY ausente).',
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 3. Chamada à API Firecrawl v2 para credit-usage
    const firecrawlEndpoint = 'https://api.firecrawl.dev/v2/team/credit-usage'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    let firecrawlRes: Response
    try {
      firecrawlRes = await fetch(firecrawlEndpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      })
    } catch (fetchErr: unknown) {
      clearTimeout(timeout)
      const err = fetchErr as Error
      const isAbort = err?.name === 'AbortError'
      console.error('[firecrawl-credits] Erro de rede ao consultar Firecrawl:', err?.message)
      return new Response(
        JSON.stringify({
          error: isAbort
            ? 'Tempo de resposta da API Firecrawl esgotado.'
            : 'Falha na conexão com a API Firecrawl. Tente novamente em instantes.',
        }),
        {
          status: 504,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    } finally {
      clearTimeout(timeout)
    }

    if (firecrawlRes.status === 401 || firecrawlRes.status === 403) {
      console.error('[firecrawl-credits] Firecrawl respondeu com 401/403 (chave inválida/expirada)')
      return new Response(
        JSON.stringify({
          error: 'Chave Firecrawl inválida, desativada ou sem autorização.',
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (!firecrawlRes.ok) {
      const errBody = await firecrawlRes.text().catch(() => '')
      console.error(
        `[firecrawl-credits] Firecrawl HTTP error ${firecrawlRes.status}: ${errBody.slice(0, 300)}`,
      )
      return new Response(
        JSON.stringify({
          error: `A API Firecrawl retornou status de erro (${firecrawlRes.status}). Tente mais tarde.`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const payload = (await firecrawlRes.json()) as FirecrawlCreditUsageResponse

    if (!payload || payload.success === false || !payload.data) {
      const safeErrMsg =
        typeof payload?.error === 'string'
          ? payload.error
          : 'Não foi possível recuperar os dados de consumo de créditos.'
      return new Response(
        JSON.stringify({
          error: safeErrMsg,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const {
      remainingCredits = 0,
      planCredits = 0,
      billingPeriodStart,
      billingPeriodEnd,
    } = payload.data

    const total = typeof planCredits === 'number' ? planCredits : 0
    const remaining = typeof remainingCredits === 'number' ? remainingCredits : 0
    const used = total > 0 ? Math.max(0, total - remaining) : 0
    const percentUsed = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0
    const percentRemaining = total > 0 ? Math.min(100, Math.max(0, (remaining / total) * 100)) : 0

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          remainingCredits: remaining,
          planCredits: total,
          usedCredits: used,
          percentUsed: Number(percentUsed.toFixed(1)),
          percentRemaining: Number(percentRemaining.toFixed(1)),
          billingPeriodStart: billingPeriodStart || null,
          billingPeriodEnd: billingPeriodEnd || null,
          fetchedAt: new Date().toISOString(),
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err: unknown) {
    const error = err as Error
    console.error('[firecrawl-credits] Erro inesperado:', error?.message)
    return new Response(
      JSON.stringify({
        error: 'Erro interno ao consultar créditos Firecrawl.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
