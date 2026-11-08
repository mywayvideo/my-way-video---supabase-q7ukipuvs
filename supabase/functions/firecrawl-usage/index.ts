import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

/**
 * firecrawl-usage — consulta o consumo de créditos do Firecrawl.
 *
 * POR QUE ESTA FUNÇÃO EXISTE (criada em 08/11/2026):
 *   A `firecrawl-credits` já existe, mas exige role = 'admin'. O perfil
 *   `catalog_manager` (que opera o cadastro e consome créditos nas extrações)
 *   não conseguia consultar o próprio saldo — e sem isso não há como medir o
 *   custo de um lote antes/depois.
 *
 * ESCOPO DELIBERADAMENTE MÍNIMO:
 *   - SOMENTE LEITURA. Não altera nada, não dispara scrape, não expõe a chave.
 *   - Devolve apenas números de saldo/consumo e o período de faturamento.
 *   - Aceita staff (admin, reviewer, catalog_manager) e a service_role.
 *   - NÃO substitui nem altera a `firecrawl-credits` (que segue admin-only).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

const STAFF_ROLES = ['admin', 'reviewer', 'catalog_manager']

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
      return new Response(JSON.stringify({ error: 'Configuração interna indisponível.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Sessão necessária.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // service_role (server-to-server) passa direto
    let autorizado = token === serviceRoleKey

    if (!autorizado) {
      const userClient = createClient(supabaseUrl, anonKey || serviceRoleKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser(token)

      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Sessão inválida ou expirada.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: customer } = await supabaseAdmin
        .from('customers')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!customer?.role || !STAFF_ROLES.includes(customer.role)) {
        return new Response(
          JSON.stringify({ error: 'Perfil sem permissão para consultar o consumo.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      autorizado = true
    }

    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ error: 'Chave Firecrawl não configurada no backend.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    let res: Response
    try {
      res = await fetch('https://api.firecrawl.dev/v2/team/credit-usage', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      })
    } catch (_e) {
      return new Response(JSON.stringify({ error: 'Falha de rede ao consultar o Firecrawl.' }), {
        status: 504,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return new Response(
        JSON.stringify({
          error: `Firecrawl respondeu ${res.status}.`,
          detail: body.slice(0, 200),
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const payload = await res.json()
    const data = payload?.data
    if (!data) {
      return new Response(JSON.stringify({ error: 'Resposta do Firecrawl sem dados.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const remaining = typeof data.remainingCredits === 'number' ? data.remainingCredits : 0
    const plan = typeof data.planCredits === 'number' ? data.planCredits : 0
    const used = plan > 0 ? Math.max(0, plan - remaining) : 0

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          remainingCredits: remaining,
          planCredits: plan,
          usedCredits: used,
          percentUsed: plan > 0 ? Number(((used / plan) * 100).toFixed(1)) : 0,
          billingPeriodStart: data.billingPeriodStart || null,
          billingPeriodEnd: data.billingPeriodEnd || null,
          fetchedAt: new Date().toISOString(),
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Erro interno ao consultar consumo.',
        detail: String(err).slice(0, 200),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
