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
    const { order_id, user_id } = body

    if (!order_id || !user_id) {
      return new Response(JSON.stringify({ error: 'Campos obrigatorios ausentes.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = crypto.randomUUID()
    const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { error } = await supabaseAdmin.from('payment_tokens').insert({
      token,
      order_id,
      user_id,
      valid_until: validUntil,
      is_used: false,
    })

    if (error) throw error

    return new Response(
      JSON.stringify({
        payment_token: token,
        payment_link: `https://my-way-beta-ia.goskip.app/payment?token=${token}`,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Error in generate-payment-token:', error)
    return new Response(JSON.stringify({ error: 'Erro interno ao gerar token de pagamento.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
