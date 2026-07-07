import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Metodo nao permitido.' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const bodyText = await req.text()
    let body: any = {}
    if (bodyText) {
      try {
        body = JSON.parse(bodyText)
      } catch (_e) {
        // Ignore parse error
      }
    }

    const { price_cost, weight } = body

    if (
      typeof price_cost !== 'number' ||
      typeof weight !== 'number' ||
      price_cost <= 0 ||
      weight <= 0
    ) {
      return new Response(
        JSON.stringify({ error: 'Valores invalidos. Preco e peso devem ser maiores que zero.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: priceSettings, error: psError } = await supabase
      .from('price_settings')
      .select('markup, freight_per_kg_usd, weight_margin')
      .limit(1)
      .maybeSingle()

    if (psError || !priceSettings) {
      return new Response(JSON.stringify({ error: 'Configuracoes de preco nao encontradas.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const markup = Number(priceSettings.markup) || 0
    const freightPerKgUsd = Number(priceSettings.freight_per_kg_usd) || 0
    const weightMargin = Number(priceSettings.weight_margin) || 0

    if (markup <= 0 || freightPerKgUsd <= 0) {
      return new Response(JSON.stringify({ error: 'Configuracoes de preco invalidas.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const weight_kg = (weight + weightMargin) / 2.20462
    const shipping_cost_usd = weight_kg * freightPerKgUsd
    const total_usd = (price_cost + shipping_cost_usd) / markup

    const { data: exchangeRateData } = await supabase
      .from('exchange_rate')
      .select('usd_to_brl, spread_percentage')
      .limit(1)
      .maybeSingle()

    let price_brl: number | null = null
    if (exchangeRateData) {
      const usdToBrl = Number(exchangeRateData.usd_to_brl) || 0
      const spreadPercentage = Number(exchangeRateData.spread_percentage) || 0
      price_brl = Math.round(total_usd * (usdToBrl * (1 + spreadPercentage / 100)) * 100) / 100
    }

    return new Response(JSON.stringify({ price_brl, total_usd }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Error calculating price:', {
      error: error.message,
      stack: error.stack,
    })
    return new Response(JSON.stringify({ error: 'Erro interno ao calcular o preco.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
