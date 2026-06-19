import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Step 1: Query exchange_rate table, get last_updated timestamp
    const { data: rows, error: fetchError } = await supabase
      .from('exchange_rate')
      .select('id, usd_to_brl, last_updated')
      .limit(1)

    if (fetchError) throw fetchError
    if (!rows || rows.length === 0) {
      throw new Error('No rows found in exchange_rate table')
    }

    const dbRow = rows[0]
    const rowId = dbRow.id
    const currentRate = dbRow.usd_to_brl
    const lastUpdated = new Date(dbRow.last_updated)
    const now = new Date()

    // Step 2: Calculate time difference: now - last_updated
    const diffMs = now.getTime() - lastUpdated.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)

    // Step 3: If time difference is less than 10 minutes (600 seconds)
    if (diffSeconds < 600) {
      const remainingMinutes = Math.max(1, 10 - diffMinutes)
      return new Response(
        JSON.stringify({
          rate: currentRate,
          last_updated: dbRow.last_updated,
          cached: true,
          message: `Taxa em cache. Proxima atualizacao em ${remainingMinutes} minutos.`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Step 4: If time difference is 10 minutes or more
    let newRate: number | null = null
    try {
      const openExchangeApiKey = Deno.env.get('OPENEXCHANGERATES_API_KEY')
      if (!openExchangeApiKey) {
        throw new Error('OPENEXCHANGERATES_API_KEY is missing')
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      const apiRes = await fetch(
        `https://openexchangerates.org/api/latest.json?app_id=${openExchangeApiKey}&symbols=BRL&base=USD`,
        {
          signal: controller.signal,
        },
      )
      clearTimeout(timeoutId)

      if (!apiRes.ok) {
        throw new Error(`Open Exchange Rates API returned status ${apiRes.status}`)
      }

      const data = await apiRes.json()
      if (!data?.rates?.BRL) {
        throw new Error('Invalid Open Exchange Rates API response structure')
      }

      const parsedRate = Number(parseFloat(data.rates.BRL).toFixed(4))
      if (isNaN(parsedRate)) {
        throw new Error('Parsed rate is NaN')
      }

      newRate = parsedRate
    } catch (error) {
      console.error('Open Exchange Rates API fetch error:', error)
    }

    // Error Handling: If API fails
    if (newRate === null) {
      return new Response(
        JSON.stringify({
          rate: currentRate,
          last_updated: dbRow.last_updated,
          cached: true,
          message: 'Taxa em cache. Falha ao buscar nova taxa.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Update database with new rate and timestamp
    const nowIso = now.toISOString()
    const { error: updateError } = await supabase
      .from('exchange_rate')
      .update({
        usd_to_brl: newRate,
        last_updated: nowIso,
      })
      .eq('id', rowId)

    if (updateError) {
      throw updateError
    }

    // Also update price_settings and pricing_settings for backward compatibility
    const { data: psRows } = await supabase.from('price_settings').select('id').limit(1)
    if (psRows && psRows.length > 0) {
      await supabase
        .from('price_settings')
        .update({ exchange_rate: newRate, updated_at: nowIso })
        .eq('id', psRows[0].id)
    }

    const { data: pricingRows } = await supabase.from('pricing_settings').select('id').limit(1)
    if (pricingRows && pricingRows.length > 0) {
      await supabase
        .from('pricing_settings')
        .update({ exchange_rate: newRate, updated_at: nowIso })
        .eq('id', pricingRows[0].id)
    }

    return new Response(
      JSON.stringify({
        rate: newRate,
        last_updated: nowIso,
        cached: false,
        message: 'Taxa atualizada com sucesso',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    // If database query fails
    console.error('Database query or unexpected error:', error)
    return new Response(
      JSON.stringify({
        error: 'Database error',
        message: 'Erro ao buscar taxa. Tente novamente.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
