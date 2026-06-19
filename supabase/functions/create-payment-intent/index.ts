import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
      return new Response(JSON.stringify({ error: 'Dados invalidos para pagamento.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const stripeKey = Deno.env.get('STRIPE_RESTRICTED_KEY')
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'Chave Stripe nao configurada.' }), {
        status: 500,
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

    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!stripeRes.ok) {
      const errorData = await stripeRes.json().catch(() => ({}))
      console.error('Stripe API Error:', stripeRes.status, errorData)

      if (stripeRes.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisicoes. Tente novamente em alguns minutos.' }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      if (stripeRes.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Autenticacao Stripe falhou. Contate suporte.' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      return new Response(
        JSON.stringify({ error: 'Erro ao processar pagamento com o provedor.' }),
        {
          status: 500,
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
    console.error('Server error processing payment intent:', error.message)
    return new Response(
      JSON.stringify({ error: 'Erro interno no servidor ao processar pagamento.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
