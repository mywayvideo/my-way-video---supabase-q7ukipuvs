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

    let supabaseClient
    let isServiceRole = false

    if (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) {
      isServiceRole = true
      supabaseClient = createClient(supabaseUrl, serviceRoleKey)
    } else {
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: { Authorization: authHeader },
        },
      })

      const { data: isAdmin, error: adminError } = await supabaseClient.rpc('is_admin')

      if (adminError || !isAdmin) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Admin privileges required.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
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
