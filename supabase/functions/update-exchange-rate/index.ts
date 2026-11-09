import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const authToken = authHeader.replace(/^Bearer\s+/i, '').trim()

    let supabaseClient
    let isServiceRole = false

    // --- CAMINHO 1: a chave bate exatamente com o env var da função ---------
    // Mantido como estava: é o caminho original e continua sendo o mais rápido.
    if (serviceRoleKey && authToken === serviceRoleKey) {
      isServiceRole = true
      supabaseClient = createClient(supabaseUrl, serviceRoleKey)
    } else {
      // --- CAMINHO 2: o token recebido é uma service_role DE VERDADE? ------
      // CORRIGIDO EM 09/11/2026. Antes, a função só comparava a STRING do
      // header com o env var. Se as duas chaves divergissem — env var vazia,
      // rotacionada ou de outro projeto — a chamada legítima do pg_cron caía
      // no caminho de admin, e `is_admin()` com token de service_role falha
      // porque esse JWT não tem a claim `sub`. Resultado: 403 e o câmbio parava
      // de atualizar SEM NINGUÉM SER AVISADO (o cron não reporta erro).
      //
      // A verificação agora é EMPÍRICA, não textual: tenta uma operação que só
      // service_role consegue fazer. Se funcionar, o token é service_role e
      // passa a ser usado como credencial. Isso NÃO abre brecha: um JWT
      // forjado não passa, porque /auth/v1/admin/* exige a chave real.
      const candidate = createClient(supabaseUrl, authToken, {
        auth: { persistSession: false, autoRefreshToken: false },
      })

      const { error: adminProbeError } = await candidate.auth.admin.listUsers({
        page: 1,
        perPage: 1,
      })

      if (!adminProbeError) {
        isServiceRole = true
        supabaseClient = candidate
      } else {
        // --- CAMINHO 3: usuário comum — exige perfil admin (botão da tela) --
        supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: { Authorization: authHeader },
          },
        })

        const { data: isAdmin, error: adminError } = await supabaseClient.rpc('is_admin')

        if (adminError || !isAdmin) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized: Admin privileges required.' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          )
        }
      }
    }

    const apiKey = Deno.env.get('OPENEXCHANGERATES_API_KEY')
    if (!apiKey) {
      throw new Error('Missing OPENEXCHANGERATES_API_KEY secret')
    }

    const response = await fetch(`https://openexchangerates.org/api/latest.json?app_id=${apiKey}`)
    if (!response.ok) {
      throw new Error(`OpenExchangeRates API error: ${response.statusText}`)
    }

    const data = await response.json()
    const brlRate = data.rates?.BRL
    const eurRate = data.rates?.EUR

    if (!brlRate) {
      throw new Error('BRL rate not found in API response')
    }

    // Calcula EUR-BRL a partir da mesma resposta (base USD: rates.BRL / rates.EUR)
    let eurToBrlRate: number | null = null
    if (eurRate && Number(eurRate) > 0) {
      eurToBrlRate = Number((Number(brlRate) / Number(eurRate)).toFixed(4))
    }

    let userId: string | null = null

    if (!isServiceRole) {
      const { data: userResponse } = await supabaseClient.auth.getUser()
      userId = userResponse.user?.id ?? null
    }

    const { data: priceSettings } = await supabaseClient
      .from('price_settings')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (priceSettings) {
      await supabaseClient
        .from('price_settings')
        .update({
          exchange_rate: brlRate,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        })
        .eq('id', priceSettings.id)
    }

    const { data: pricingSettings } = await supabaseClient
      .from('pricing_settings')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (pricingSettings) {
      await supabaseClient
        .from('pricing_settings')
        .update({
          exchange_rate: brlRate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pricingSettings.id)
    }

    const { data: exchangeRate } = await supabaseClient
      .from('exchange_rate')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (exchangeRate) {
      const updatePayload: Record<string, any> = {
        usd_to_brl: brlRate,
        last_updated: new Date().toISOString(),
        updated_by: userId,
      }
      if (eurToBrlRate !== null) {
        updatePayload.eur_to_brl = eurToBrlRate
      }

      await supabaseClient.from('exchange_rate').update(updatePayload).eq('id', exchangeRate.id)
    }

    return new Response(
      JSON.stringify({
        success: true,
        rate: brlRate,
        usd_to_brl: brlRate,
        eur_to_brl: eurToBrlRate,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
