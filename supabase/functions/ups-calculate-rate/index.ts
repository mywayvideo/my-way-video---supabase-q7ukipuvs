import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, transId, transactionSrc',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('[ups-calculate-rate] Request body:', JSON.stringify(body))

    const {
      origin_zip,
      destination_zip,
      destination_country,
      weight_lbs,
      length_in,
      width_in,
      height_in,
    } = body

    if (
      !origin_zip ||
      !destination_zip ||
      !destination_country ||
      weight_lbs === undefined ||
      !length_in ||
      !width_in ||
      !height_in
    ) {
      console.error('[ups-calculate-rate] Invalid parameters:', JSON.stringify(body))
      return new Response(
        JSON.stringify({
          error: 'Parâmetros inválidos para cálculo de frete',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    console.log('[ups-calculate-rate] Invoking ups-get-token...')
    const tokenResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/ups-get-token`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
    )

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error(
        '[ups-calculate-rate] Failed to authenticate with UPS:',
        errorText,
        'Status:',
        tokenResponse.status,
      )
      return new Response(
        JSON.stringify({
          error: 'Não foi possível autenticar com UPS',
          details: errorText,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token
    console.log('[ups-calculate-rate] Token obtained successfully.')

    // UPS v2 REST API payload format
    const ratePayload = {
      RateRequest: {
        Request: {
          TransactionReference: {
            CustomerContext: 'Verify rate',
          },
        },
        Shipment: {
          Shipper: {
            Name: 'Shipper',
            Address: {
              AddressLine: ['123 Origin St'],
              City: 'Miami',
              StateProvinceCode: 'FL',
              PostalCode: origin_zip,
              CountryCode: 'US',
            },
          },
          ShipTo: {
            Name: 'Customer',
            Address: {
              AddressLine: ['456 Dest St'],
              PostalCode: destination_zip,
              CountryCode: destination_country,
            },
          },
          Package: {
            PackagingType: {
              Code: '02',
              Description: 'Packaging',
            },
            Dimensions: {
              UnitOfMeasurement: {
                Code: 'IN',
                Description: 'Inches',
              },
              Length: length_in.toString(),
              Width: width_in.toString(),
              Height: height_in.toString(),
            },
            PackageWeight: {
              UnitOfMeasurement: {
                Code: 'LBS',
                Description: 'Pounds',
              },
              Weight: weight_lbs.toString(),
            },
          },
        },
      },
    }

    const environment = Deno.env.get('UPS_ENVIRONMENT') || 'sandbox'
    // Point to UPS REST API
    const rateEndpoint =
      environment === 'sandbox'
        ? 'https://wwwcie.ups.com/api/rating/v2403/Shop'
        : 'https://onlinetools.ups.com/api/rating/v2403/Shop'

    console.log('[ups-calculate-rate] Calling UPS Rate API endpoint:', rateEndpoint)
    console.log('[ups-calculate-rate] Rate payload:', JSON.stringify(ratePayload))

    const transId = crypto.randomUUID()

    const rateResponse = await fetch(rateEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        transId: transId,
        transactionSrc: 'testing',
        'User-Agent': 'MyWayVideo/1.0',
      },
      body: JSON.stringify(ratePayload),
    })

    if (!rateResponse.ok) {
      const errorText = await rateResponse.text()
      console.error(
        '[ups-calculate-rate] UPS Rate API Error:',
        errorText,
        'Status:',
        rateResponse.status,
      )
      return new Response(
        JSON.stringify({
          error: 'Não foi possível calcular frete UPS',
          details: errorText,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const rateData = await rateResponse.json()
    console.log('[ups-calculate-rate] UPS Rate API Response received.')

    let ratedShipments = rateData.RateResponse?.RatedShipment
    if (!Array.isArray(ratedShipments)) {
      if (ratedShipments) {
        ratedShipments = [ratedShipments]
      } else {
        ratedShipments = []
      }
    }

    const services =
      ratedShipments.map((shipment: any) => ({
        code: shipment.Service?.Code,
        name: shipment.Service?.Description || shipment.Service?.Code,
        charge_usd: parseFloat(shipment.TotalCharges?.MonetaryValue || '0'),
      })) || []

    console.log('[ups-calculate-rate] Extracted services:', JSON.stringify(services))
    return new Response(JSON.stringify({ services }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (error: any) {
    console.error('[ups-calculate-rate] Unhandled error:', error)
    return new Response(
      JSON.stringify({
        error: 'Erro ao calcular frete UPS',
        message: error.message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
})
