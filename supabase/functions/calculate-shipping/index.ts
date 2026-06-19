import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const R = 6371 // Earth radius in km
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const bodyText = await req.text()
    let body
    try {
      body = JSON.parse(bodyText)
    } catch (e) {
      return new Response(
        JSON.stringify({
          error:
            'Dados invalidos. Verifique os campos obrigatorios: tipo_entrega, endereco, itens_carrinho.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    console.log('Received calculate-shipping payload:', JSON.stringify(body, null, 2))

    const { delivery_type, address, cart_items } = body

    if (!delivery_type || !address || !Array.isArray(cart_items)) {
      return new Response(
        JSON.stringify({
          error:
            'Dados invalidos. Verifique os campos obrigatorios: tipo_entrega, endereco, itens_carrinho.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (
      delivery_type !== 'coleta' &&
      (!address.street || !address.city || !address.state || !address.zip_code)
    ) {
      return new Response(
        JSON.stringify({ error: 'Endereco incompleto. Preencha: rua, cidade, estado, CEP/ZIP.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    if (delivery_type === 'coleta') {
      return new Response(
        JSON.stringify({
          shipping_cost: 0,
          message: 'Coleta em Miami. Sem custos.',
          delivery_type,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    } else if (delivery_type === 'miami') {
      const { data: settingsData } = await supabase
        .from('app_settings')
        .select('setting_key, setting_value')
        .in('setting_key', ['warehouse_location', 'shipping_miami_ranges'])

      const warehouseStr = settingsData?.find(
        (s) => s.setting_key === 'warehouse_location',
      )?.setting_value
      const rangesStr = settingsData?.find(
        (s) => s.setting_key === 'shipping_miami_ranges',
      )?.setting_value

      if (!warehouseStr || !rangesStr) {
        throw new Error('Configurações de frete não encontradas.')
      }

      const warehouse = JSON.parse(warehouseStr)
      const ranges = JSON.parse(rangesStr)

      let destLat = 0
      let destLng = 0

      const country = address.country?.toLowerCase() || ''
      try {
        if (country === 'brasil' || country === 'brazil') {
          const cleanZip = (address.zip_code || '').replace(/\D/g, '')
          const viaCepRes = await fetch(`https://viacep.com.br/ws/${cleanZip}/json/`)
          if (!viaCepRes.ok) throw new Error('ViaCEP API error')
          const viaCepData = await viaCepRes.json()

          if (viaCepData.erro) {
            throw new Error('ViaCEP not found')
          }

          if (viaCepData.lat && viaCepData.lon) {
            destLat = parseFloat(viaCepData.lat)
            destLng = parseFloat(viaCepData.lon)
          }
        }

        if (destLat === 0 && destLng === 0) {
          const apiKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY')
          if (!apiKey) throw new Error('Chave de geocodificação ausente.')

          const numberPart =
            address.number && address.number !== '0' && address.number.toLowerCase() !== 's/n'
              ? ` ${address.number}`
              : ''
          const addrStr = `${address.street}${numberPart}, ${address.city}, ${address.state} ${address.zip_code} ${address.country}`
          const geoRes = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addrStr)}&key=${apiKey}`,
          )

          if (!geoRes.ok) throw new Error('Google Geocoding API error')
          const geoData = await geoRes.json()

          if (geoData.status !== 'OK' || !geoData.results?.[0]?.geometry?.location) {
            throw new Error('Google Geocoding returned not OK')
          }

          destLat = geoData.results[0].geometry.location.lat
          destLng = geoData.results[0].geometry.location.lng
        }
      } catch (err: any) {
        console.error('Geocoding Error:', err.stack || err.message)
        return new Response(
          JSON.stringify({
            error: 'Endereco nao encontrado. Verifique o CEP/ZIP e tente novamente.',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      if (
        typeof destLat !== 'number' ||
        typeof destLng !== 'number' ||
        isNaN(destLat) ||
        isNaN(destLng) ||
        (destLat === 0 && destLng === 0)
      ) {
        return new Response(
          JSON.stringify({ error: 'Nao foi possivel calcular a distancia. Verifique o endereco.' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      const distanceKm = calculateHaversineDistance(
        warehouse.latitude,
        warehouse.longitude,
        destLat,
        destLng,
      )

      const sortedRanges = ranges.sort((a: any, b: any) => a.min_km - b.min_km)
      let matchedRange = null

      for (const r of sortedRanges) {
        if (distanceKm >= r.min_km && distanceKm <= r.max_km) {
          matchedRange = r
          break
        }
      }

      if (!matchedRange) {
        return new Response(
          JSON.stringify({
            error:
              "Distancia alem do perimetro maximo de Miami. Selecione 'Entrega EUA' para usar UPS.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      let cost = 0
      try {
        const baseCost = matchedRange.cost_usd
        cost = Math.ceil(baseCost * 10) / 10
      } catch (e) {
        return new Response(
          JSON.stringify({ error: 'Erro ao processar frete. Tente novamente.' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      return new Response(
        JSON.stringify({
          shipping_cost: cost,
          message: `Frete para Miami: USD ${cost.toFixed(1)}`,
          delivery_type,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    } else if (delivery_type === 'sao_paulo') {
      let price_per_kg: number | null = null
      let percentage_value: number | null = null
      let additional_weight_kg = 0.5

      try {
        const { data: settingsData } = await supabase
          .from('app_settings')
          .select('setting_key, setting_value, setting_value_numeric')
          .in('setting_key', [
            'shipping_sao_paulo_price_per_kg',
            'shipping_sao_paulo_percentage_value',
            'shipping_sao_paulo_additional_weight_kg',
          ])

        const priceData = settingsData?.find(
          (s) => s.setting_key === 'shipping_sao_paulo_price_per_kg',
        )
        if (priceData)
          price_per_kg = priceData.setting_value_numeric ?? Number(priceData.setting_value)

        const percData = settingsData?.find(
          (s) => s.setting_key === 'shipping_sao_paulo_percentage_value',
        )
        if (percData)
          percentage_value = percData.setting_value_numeric ?? Number(percData.setting_value)

        const addWeightData = settingsData?.find(
          (s) => s.setting_key === 'shipping_sao_paulo_additional_weight_kg',
        )
        if (addWeightData) {
          const val = addWeightData.setting_value_numeric ?? Number(addWeightData.setting_value)
          if (!isNaN(val)) additional_weight_kg = val
        }

        if (
          price_per_kg === null ||
          percentage_value === null ||
          isNaN(price_per_kg) ||
          isNaN(percentage_value)
        ) {
          return new Response(
            JSON.stringify({
              error:
                'Configuracao de frete incompleta. Verifique as configuracoes no painel admin.',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          )
        }
      } catch (e: any) {
        return new Response(
          JSON.stringify({
            error: 'Configuracao de frete incompleta. Verifique as configuracoes no painel admin.',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      let total_weight_kg = 0
      let total_order_value_usd = 0

      try {
        for (let i = 0; i < cart_items.length; i++) {
          const item = cart_items[i]
          const lb = Number(
            item.weight_lb !== undefined
              ? item.weight_lb
              : item.weight !== undefined
                ? item.weight
                : item.weight_kg,
          )
          const wKg = (isNaN(lb) ? 0 : lb) * 0.453592
          const qty = Number(item.quantity) || 1
          total_weight_kg += wKg * qty
          total_order_value_usd += (Number(item.price_usd) || 0) * qty
        }
      } catch (e) {
        return new Response(
          JSON.stringify({ error: 'Nao foi possivel calcular o frete. Tente novamente.' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      let final_freight = 0
      let percentage_charge = 0
      let weight_charge = 0
      let total_weight_with_additional = 0

      try {
        total_weight_with_additional = total_weight_kg + additional_weight_kg
        percentage_charge = (total_order_value_usd * percentage_value) / 100
        weight_charge = total_weight_with_additional * price_per_kg
        final_freight = percentage_charge + weight_charge
        final_freight = Math.round(final_freight * 100) / 100
      } catch (e) {
        return new Response(
          JSON.stringify({ error: 'Nao foi possivel calcular o frete. Tente novamente.' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      return new Response(
        JSON.stringify({
          freight_usd: final_freight,
          shipping_cost: final_freight,
          delivery_type,
          message: `Frete para Sao Paulo: USD ${final_freight.toFixed(2)}`,
          breakdown: {
            percentage_charge,
            weight_charge,
            additional_weight_kg,
            total_weight_kg,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    } else if (delivery_type === 'usa') {
      console.log('[calculate-shipping] USA delivery selected. Calculating totals...')
      let using_fallbacks = false
      let totalWeightLbs = 0
      let totalValue = 0

      for (const item of cart_items) {
        let lb = Number(
          item.weight_lb !== undefined
            ? item.weight_lb
            : item.weight !== undefined
              ? item.weight
              : item.weight_kg,
        )

        if (isNaN(lb) || lb <= 0) {
          lb = 2 // Fallback de 2 lbs
          using_fallbacks = true
        }

        if (!item.dimensions) {
          using_fallbacks = true
        }

        const qty = Number(item.quantity) || 1
        totalWeightLbs += lb * qty
        totalValue += (Number(item.price_usd) || 0) * qty
      }

      totalWeightLbs = Math.max(1, Math.ceil(totalWeightLbs))

      let cost = 0
      let upsSuccess = false

      try {
        // Obter configurações de zipcode origem
        const { data: settingsData } = await supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'warehouse_location')
          .maybeSingle()

        let originZip = '33122' // Default Miami zip
        if (settingsData?.setting_value) {
          const wh = JSON.parse(settingsData.setting_value)
          if (wh.zip_code) originZip = wh.zip_code
        }

        const destZip = (address.zip_code || '').replace(/\D/g, '')

        const upsPayload = {
          origin_zip: originZip,
          destination_zip: destZip,
          destination_country: 'US',
          weight_lbs: totalWeightLbs,
          weight_oz: 0,
          length_in: 10,
          width_in: 10,
          height_in: 5,
          service_type: '03', // UPS Ground default
        }
        console.log(
          '[calculate-shipping] Invoking ups-calculate-rate with payload:',
          JSON.stringify(upsPayload),
        )

        const { data: upsData, error: upsError } = await supabase.functions.invoke(
          'ups-calculate-rate',
          {
            body: upsPayload,
          },
        )

        console.log(
          '[calculate-shipping] ups-calculate-rate response:',
          JSON.stringify({ upsData, upsError }),
        )

        if (!upsError && upsData && upsData.services && upsData.services.length > 0) {
          const groundService = upsData.services.find((s: any) => s.code === '03')
          if (groundService) {
            cost = groundService.charge_usd
          } else {
            cost = upsData.services[0].charge_usd
          }
          upsSuccess = true
        }
      } catch (e) {
        console.error('Erro ao invocar ups-calculate-rate', e)
      }

      if (!upsSuccess) {
        console.log(
          '[calculate-shipping] UPS calculation failed or returned no services. Using fallback formula.',
        )
        // Fallback para fórmula manual
        try {
          const { data: formulaData } = await supabase
            .from('app_settings')
            .select('setting_value')
            .eq('setting_key', 'shipping_usa_formula')
            .single()

          if (formulaData?.setting_value) {
            const formula = JSON.parse(formulaData.setting_value)
            const totalWeightKg = totalWeightLbs * 0.453592
            const baseCost =
              (totalValue * (Number(formula.value_percentage) || 0)) / 100 +
              totalWeightKg * (Number(formula.weight_price_per_kg) || 0) +
              (Number(formula.base_cost) || 0)
            cost = Math.ceil(baseCost * 10) / 10
          } else {
            console.error(
              '[calculate-shipping] Fallback formula not configured in app_settings (shipping_usa_formula)',
            )
            throw new Error('Sem formula configurada')
          }
        } catch (e: any) {
          console.error('[calculate-shipping] Error using fallback formula:', e.message)
          return new Response(
            JSON.stringify({
              error:
                'Não foi possível calcular frete (UPS e fallback falharam). Verifique as configurações de frete.',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          )
        }
      }

      return new Response(
        JSON.stringify({
          shipping_cost: cost,
          message: `Frete para EUA: USD ${cost.toFixed(2)}`,
          delivery_type,
          using_fallbacks,
          ups_failed: !upsSuccess,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    } else {
      return new Response(JSON.stringify({ error: 'Tipo de entrega não suportado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  } catch (error: any) {
    console.error('Calculate shipping internal error:', error.stack || error.message)

    return new Response(
      JSON.stringify({ error: 'Erro interno no servidor ao processar o frete.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
