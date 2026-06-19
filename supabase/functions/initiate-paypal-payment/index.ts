import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

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
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { amount, email, orderId } = body

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (
      typeof amount !== 'number' ||
      amount <= 0 ||
      typeof email !== 'string' ||
      !emailRegex.test(email) ||
      typeof orderId !== 'string' ||
      orderId.trim() === ''
    ) {
      return new Response(JSON.stringify({ error: 'Dados invalidos para pagamento.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const clientId = Deno.env.get('PAYPAL_CLIENT_ID')
    if (!clientId) {
      console.error('PAYPAL_CLIENT_ID not found in environment variables.')
      return new Response(JSON.stringify({ error: 'Configuracao PayPal nao encontrada.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const origin = req.headers.get('origin') || 'https://my-way-beta-ia.goskip.app'
    const redirectUri = `${origin}/checkout?paypal_success=true`

    const params = new URLSearchParams()
    params.append('client_id', clientId)
    params.append('response_type', 'code')
    params.append('scope', 'payment.capture')
    params.append('redirect_uri', redirectUri)
    params.append('state', orderId)

    const paypalAuthUrl = `https://www.paypal.com/signin/authorize?${params.toString()}`

    return new Response(JSON.stringify({ paypalAuthUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Error initiating PayPal payment:', error.message || error)
    return new Response(JSON.stringify({ error: 'Erro ao iniciar pagamento PayPal.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
