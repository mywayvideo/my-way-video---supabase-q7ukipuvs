import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

    const body = await req.json().catch(() => ({}))
    const { token } = body

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token nao fornecido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: paymentToken, error: fetchError } = await supabaseAdmin
      .from('payment_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle()

    if (fetchError || !paymentToken) {
      return new Response(JSON.stringify({ error: 'Token invalido.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (new Date(paymentToken.valid_until) < new Date()) {
      return new Response(JSON.stringify({ error: 'Token expirado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (paymentToken.is_used) {
      return new Response(JSON.stringify({ error: 'Token ja foi utilizado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', paymentToken.order_id)
      .single()

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: 'Pedido nao encontrado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        order_id: paymentToken.order_id,
        user_id: paymentToken.user_id,
        order: order,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Error in validate-payment-token:', error)
    return new Response(JSON.stringify({ error: 'Erro interno ao validar token.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
