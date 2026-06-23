import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing Authorization header')
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin')
    if (adminError || !isAdmin) {
      throw new Error('Forbidden: User is not an admin')
    }

    let payload: any = {}
    try {
      const clone = req.clone()
      const text = await clone.text()
      if (text) {
        payload = JSON.parse(text)
      }
    } catch {
      // Ignored if no body
    }

    let usd_to_brl = payload?.usd_to_brl
    const spread_percentage = payload?.spread_percentage

    if (!usd_to_brl) {
      const apiKey = Deno.env.get('OPENEXCHANGERATES_API_KEY')
      if (apiKey) {
        try {
          const response = await fetch(
            `https://openexchangerates.org/api/latest.json?app_id=${apiKey}`,
          )
          if (response.ok) {
            const data = await response.json()
            if (data?.rates?.BRL) {
              usd_to_brl = data.rates.BRL
            }
          }
        } catch (e) {
          console.error('Error fetching from OpenExchangeRates:', e)
        }
      }

      if (!usd_to_brl) {
        try {
          const fallbackRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
          if (fallbackRes.ok) {
            const data = await fallbackRes.json()
            if (data?.rates?.BRL) {
              usd_to_brl = data.rates.BRL
            }
          }
        } catch (e) {
          console.error('Error fetching from fallback API:', e)
        }
      }
    }

    if (!usd_to_brl) {
      throw new Error('Failed to fetch exchange rate')
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Update exchange_rate table
    const { data: existingRate } = await adminClient
      .from('exchange_rate')
      .select('id')
      .limit(1)
      .maybeSingle()

    const updateData: any = {
      usd_to_brl: Number(usd_to_brl),
      last_updated: new Date().toISOString(),
      updated_by: user.id,
    }

    if (spread_percentage !== undefined) {
      updateData.spread_percentage = Number(spread_percentage)
    }

    if (existingRate) {
      await adminClient.from('exchange_rate').update(updateData).eq('id', existingRate.id)
    } else {
      await adminClient.from('exchange_rate').insert({
        ...updateData,
        spread_percentage: spread_percentage !== undefined ? Number(spread_percentage) : 0,
      })
    }

    // Also update price_settings to ensure app consistency across different components
    const { data: priceSettings } = await adminClient
      .from('price_settings')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (priceSettings) {
      await adminClient
        .from('price_settings')
        .update({
          exchange_rate: Number(usd_to_brl),
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq('id', priceSettings.id)
    } else {
      await adminClient.from('price_settings').insert({
        exchange_rate: Number(usd_to_brl),
        updated_by: user.id,
      })
    }

    // Also update pricing_settings
    const { data: pricingSettings } = await adminClient
      .from('pricing_settings')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (pricingSettings) {
      await adminClient
        .from('pricing_settings')
        .update({
          exchange_rate: Number(usd_to_brl),
          updated_at: new Date().toISOString(),
        })
        .eq('id', pricingSettings.id)
    } else {
      await adminClient.from('pricing_settings').insert({
        exchange_rate: Number(usd_to_brl),
      })
    }

    return new Response(JSON.stringify({ success: true, usd_to_brl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('Exchange rate update error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
