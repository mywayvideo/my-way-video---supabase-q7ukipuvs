import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

function getStripeKey(): string | null {
  return Deno.env.get('STRIPE_RESTRICTED_KEY') || Deno.env.get('STRIPE_SECRET_KEY') || null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { paymentIntentId } = await req.json()

    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      return new Response(JSON.stringify({ error: 'paymentIntentId e obrigatorio.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const stripeKey = getStripeKey()
    if (!stripeKey) {
      console.error('Stripe key not found. Checked: STRIPE_RESTRICTED_KEY, STRIPE_SECRET_KEY')
      return new Response(
        JSON.stringify({
          error:
            'Chave Stripe nao configurada no servidor. (Missing: STRIPE_RESTRICTED_KEY or STRIPE_SECRET_KEY)',
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `payment_intent=${paymentIntentId}`,
    })

    if (!refundRes.ok) {
      const errorData = await refundRes.json().catch(() => ({}))
      console.error('Stripe refund error:', refundRes.status, errorData)
      return new Response(
        JSON.stringify({
          error: 'Erro ao processar reembolso com o provedor.',
          status: refundRes.status,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Server error processing refund:', error.message)
    return new Response(
      JSON.stringify({ error: 'Erro interno no servidor ao processar reembolso.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
