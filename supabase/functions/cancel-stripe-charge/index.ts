import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getStripeKey, buildMissingKeyResponse } from '../_shared/stripe.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { paymentIntentId } = await req.json()

    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      return new Response(
        JSON.stringify({
          error: 'paymentIntentId e obrigatorio.',
          code: 'INVALID_PAYLOAD',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const stripeKey = getStripeKey()
    if (!stripeKey) {
      const errorResponse = buildMissingKeyResponse()
      return new Response(errorResponse.body, {
        status: errorResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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
          code: 'STRIPE_REFUND_ERROR',
          status: refundRes.status,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    console.error('Server error processing refund:', error?.message)
    return new Response(
      JSON.stringify({
        error: 'Erro interno no servidor ao processar reembolso.',
        code: 'INTERNAL_ERROR',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
