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
      } catch (e) {
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

    const { data: priceSettings } = await supabase
      .from('price_settings')
      .select('exchange_rate, exchange_spread')
      .limit(1)
      .maybeSingle()
    const { data: appSettings } = await supabase
      .from('app_settings')
      .select('setting_key, setting_value, setting_value_numeric')
      .in('setting_key', [
        'shipping_sao_paulo_price_per_kg',
        'shipping_sao_paulo_percentage_value',
        'shipping_sao_paulo_additional_weight_kg',
      ])

    let preco_por_kg = 0
    let percentual = 0
    let peso_adicional = 0.5

    appSettings?.forEach((setting: any) => {
      const val = setting.setting_value_numeric ?? Number(setting.setting_value)
      if (setting.setting_key === 'shipping_sao_paulo_price_per_kg')
        preco_por_kg = isNaN(val) ? 0 : val
      if (setting.setting_key === 'shipping_sao_paulo_percentage_value')
        percentual = isNaN(val) ? 0 : val
      if (setting.setting_key === 'shipping_sao_paulo_additional_weight_kg')
        peso_adicional = isNaN(val) ? 0.5 : val
    })

    const weight_kg = weight / 2.204
    const total_weight = weight_kg + peso_adicional
    const frete = total_weight * preco_por_kg
    const taxa = (price_cost * percentual) / 100

    const total_usd = price_cost + frete + taxa
    const price_brl = Math.round(total_usd * 100) / 100

    return new Response(JSON.stringify({ price_brl }), {
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
