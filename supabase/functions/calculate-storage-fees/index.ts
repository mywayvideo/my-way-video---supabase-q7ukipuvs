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

    const body = await req.json()
    const { storage_period, items, exchange_rate, freight_usd, insurance_usd, other_expenses_usd } =
      body

    if (typeof storage_period !== 'number' || !Array.isArray(items)) {
      return new Response(JSON.stringify({ error: 'Parametros invalidos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: fees, error: fetchErr } = await supabase.from('imp_sim_storage_fees').select('*')

    if (fetchErr || !fees) {
      return new Response(JSON.stringify({ error: 'Erro ao buscar taxas de armazenagem.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const tiers = fees
      .filter((f: any) => f.fee_type === 'storage_tier')
      .map((f: any) => ({
        minDays: f.min_days,
        maxDays: f.max_days,
        percentage: Number(f.percentage) || 0,
      }))
      .sort((a: any, b: any) => (a.maxDays || 0) - (b.maxDays || 0))

    const incremental = fees.find((f: any) => f.fee_type === 'storage_incremental')
    const capatazia = fees.find((f: any) => f.fee_type === 'capatazia')
    const highValueRanges = fees
      .filter((f: any) => f.fee_type === 'high_value')
      .map((f: any) => ({
        minValuePerKg: Number(f.min_value_per_kg) || 0,
        maxValuePerKg: Number(f.max_value_per_kg) || 0,
        percentage: Number(f.percentage) || 0,
      }))
      .sort((a: any, b: any) => a.minValuePerKg - b.minValuePerKg)

    const totalFobUsd = items.reduce(
      (acc: number, i: any) => acc + (Number(i.quantity) || 1) * (Number(i.unit_price_usd) || 0),
      0,
    )
    const totalCifUsd =
      totalFobUsd + (freight_usd || 0) + (insurance_usd || 0) + (other_expenses_usd || 0)
    const totalCifBrl = totalCifUsd * (exchange_rate || 1)
    const totalGrossWeight = items.reduce(
      (acc: number, i: any) =>
        acc + (Number(i.quantity) || 1) * (Number(i.unit_weight_kg) || 0) * 1.1,
      0,
    )
    const totalNetWeight = items.reduce(
      (acc: number, i: any) => acc + (Number(i.quantity) || 1) * (Number(i.unit_weight_kg) || 0),
      0,
    )

    let storageAmountBrl = 0
    let capataziaAmountBrl = 0
    let highValueAmountBrl = 0
    let isHighValue = false

    if (storage_period > 0 && totalCifBrl > 0) {
      const period = Math.floor(storage_period)
      let storagePercentage = 0

      if (period <= 2) {
        storagePercentage = tiers.find((t: any) => t.maxDays === 2)?.percentage ?? 0.55
      } else if (period <= 5) {
        storagePercentage =
          tiers.find((t: any) => t.minDays === 3 && t.maxDays === 5)?.percentage ?? 1.1
      } else if (period <= 10) {
        storagePercentage =
          tiers.find((t: any) => t.minDays === 6 && t.maxDays === 10)?.percentage ?? 1.65
      } else if (period <= 20) {
        storagePercentage =
          tiers.find((t: any) => t.minDays === 11 && t.maxDays === 20)?.percentage ?? 3.3
      } else {
        const basePct =
          tiers.find((t: any) => t.minDays === 11 && t.maxDays === 20)?.percentage ?? 3.3
        const incPct = Number(incremental?.percentage) || 1.65
        const incDays = incremental?.incremental_days || 10
        const additionalPeriods = Math.ceil((period - 20) / incDays)
        storagePercentage = basePct + incPct * additionalPeriods
      }

      storageAmountBrl = (totalCifBrl * storagePercentage) / 100

      const capataziaRaw = totalGrossWeight * (Number(capatazia?.rate_per_kg) || 0.0662)
      capataziaAmountBrl = Math.max(capataziaRaw, Number(capatazia?.minimum_charge) || 20.16)

      if (totalNetWeight > 0) {
        const cifPerKg = totalCifBrl / totalNetWeight
        for (const range of highValueRanges) {
          if (cifPerKg >= range.minValuePerKg && cifPerKg <= range.maxValuePerKg) {
            highValueAmountBrl = (totalCifBrl * range.percentage) / 100
            isHighValue = true
            break
          }
        }
      }
    }

    const totalStorageCapataziaBrl = storageAmountBrl + capataziaAmountBrl + highValueAmountBrl

    const itemShares = items.map((i: any) => {
      const fobUsd = (Number(i.quantity) || 1) * (Number(i.unit_price_usd) || 0)
      const share = totalFobUsd > 0 ? fobUsd / totalFobUsd : 0
      return {
        item_id: i.id,
        fob_usd: fobUsd,
        storage_capatazia_share_brl: totalStorageCapataziaBrl * share,
      }
    })

    return new Response(
      JSON.stringify({
        storage_amount_brl: storageAmountBrl,
        capatazia_amount_brl: capataziaAmountBrl,
        high_value_amount_brl: highValueAmountBrl,
        total_storage_capatazia_brl: totalStorageCapataziaBrl,
        is_high_value: isHighValue,
        item_shares: itemShares,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('calculate-storage-fees error:', error.stack || error.message)
    return new Response(JSON.stringify({ error: 'Erro interno no servidor.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
