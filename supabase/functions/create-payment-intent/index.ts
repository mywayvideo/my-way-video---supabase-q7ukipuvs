import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { getStripeKey, buildMissingKeyResponse } from '../_shared/stripe.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { amount, currency, customer_email, customer_name, order_id, metadata } = body

    if (
      typeof amount !== 'number' ||
      typeof currency !== 'string' ||
      typeof customer_email !== 'string' ||
      typeof customer_name !== 'string' ||
      typeof order_id !== 'string'
    ) {
      return new Response(
        JSON.stringify({
          error: 'Dados invalidos para pagamento.',
          code: 'INVALID_PAYLOAD',
          details:
            'Campos obrigatorios: amount (number), currency (string), customer_email (string), customer_name (string), order_id (string).',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (amount <= 0) {
      return new Response(
        JSON.stringify({
          error: 'O valor do pagamento deve ser maior que zero.',
          code: 'INVALID_AMOUNT',
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

    const params = new URLSearchParams()
    params.append('amount', amount.toString())
    params.append('currency', currency)
    params.append('payment_method_types[]', 'card')
    params.append('receipt_email', customer_email)
    params.append('description', `Order #${order_id}`)

    if (metadata && typeof metadata === 'object') {
      for (const [key, value] of Object.entries(metadata)) {
        if (value !== undefined && value !== null) {
          params.append(`metadata[${key}]`, String(value))
        }
      }
    }

    let stripeRes: Response
    try {
      stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      })
    } catch (fetchError: any) {
      console.error('Network error contacting Stripe:', fetchError?.message)
      return new Response(
        JSON.stringify({
          error: 'Erro de conexao com o provedor de pagamento. Tente novamente.',
          code: 'STRIPE_NETWORK_ERROR',
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (!stripeRes.ok) {
      const errorData = await stripeRes.json().catch(() => ({}))
      console.error('Stripe API Error:', stripeRes.status, errorData)

      if (stripeRes.status === 429) {
        return new Response(
          JSON.stringify({
            error: 'Limite de requisicoes. Tente novamente em alguns minutos.',
            code: 'STRIPE_RATE_LIMITED',
          }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      if (stripeRes.status === 401) {
        return new Response(
          JSON.stringify({
            error: 'Autenticacao Stripe falhou. Contate suporte.',
            code: 'STRIPE_AUTH_FAILED',
          }),
          {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      if (stripeRes.status === 400) {
        const stripeMsg =
          errorData?.error?.message || 'Dados do pagamento rejeitados pelo provedor.'
        return new Response(
          JSON.stringify({ error: stripeMsg, code: 'STRIPE_BAD_REQUEST' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      return new Response(
        JSON.stringify({
          error: 'Erro ao processar pagamento com o provedor.',
          code: 'STRIPE_ERROR',
          status: stripeRes.status,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const data = await stripeRes.json()

    return new Response(
      JSON.stringify({
        client_secret: data.client_secret,
        payment_intent_id: data.id,
        status: data.status,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    console.error('Server error processing payment intent:', error?.message)
    return new Response(
      JSON.stringify({
        error: 'Erro interno no servidor ao processar pagamento.',
        code: 'INTERNAL_ERROR',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
