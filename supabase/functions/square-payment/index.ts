import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

async function getSquareConfig() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_key, setting_value')
    .in('setting_key', ['square_access_token', 'square_location_id', 'square_application_id'])

  if (error) throw new Error('Failed to fetch Square configuration from database')

  const settings: Record<string, string> = {}
  data?.forEach((s) => {
    if (s.setting_value) settings[s.setting_key] = s.setting_value
  })

  const accessToken = settings['square_access_token']
  const locationId = settings['square_location_id']
  const applicationId = settings['square_application_id']

  if (!accessToken || !locationId) {
    throw new Error('Square configuration missing in database')
  }

  const isSandboxToken = accessToken.startsWith('EAAAl')
  const isSandboxAppId = applicationId ? applicationId.startsWith('sandbox-') : false

  if (applicationId && isSandboxToken !== isSandboxAppId) {
    throw new Error(
      'Square environment mismatch: application_id and access_token must be from the same environment (both Sandbox or both Production). Please verify app_settings.',
    )
  }

  return { accessToken, locationId }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { sourceId, amount, orderId } = await req.json()

    if (!sourceId || !amount) {
      return new Response(JSON.stringify({ error: 'Dados de pagamento incompletos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { accessToken, locationId } = await getSquareConfig()

    const idempotencyKey = crypto.randomUUID()

    const endpoint = 'https://connect.squareup.com/v2/payments'

    const squareRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Square-Version': '2024-01-18',
      },
      body: JSON.stringify({
        source_id: sourceId,
        idempotency_key: idempotencyKey,
        amount_money: {
          amount: Math.round(amount * 100),
          currency: 'USD',
        },
        location_id: locationId,
        reference_id: orderId,
      }),
    })

    const squareData = await squareRes.json()

    if (!squareRes.ok) {
      console.error('Square API Error:', JSON.stringify(squareData))
      let errorMessage = 'Pagamento recusado pelo provedor.'

      if (squareData?.errors && Array.isArray(squareData.errors) && squareData.errors.length > 0) {
        const firstError = squareData.errors[0]
        const parts: string[] = []
        if (firstError.code) parts.push(firstError.code)
        if (firstError.detail) parts.push(firstError.detail)
        if (firstError.field) parts.push(`Field: ${firstError.field}`)

        if (parts.length > 0) {
          errorMessage = parts.join(' — ')
        }

        if (firstError.code === 'PAN_FAILURE') {
          errorMessage = `Authorization error: 'PAN_FAILURE' — ${firstError.detail || 'O número do cartão é inválido ou não foi aceito.'}`
        }
      }

      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, transactionId: squareData.payment.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Square Payment Exception:', error)

    const isConfigError =
      error.message?.includes('Square configuration') ||
      error.message?.includes('Square environment mismatch')

    return new Response(
      JSON.stringify({
        error: error.message || 'Erro interno ao processar pagamento. Tente novamente.',
        is_config_error: isConfigError,
      }),
      {
        status: isConfigError ? 500 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
