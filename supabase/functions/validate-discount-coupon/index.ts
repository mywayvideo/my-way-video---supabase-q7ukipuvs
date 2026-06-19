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
    const { coupon_code, order_id, subtotal } = body

    if (!coupon_code || typeof subtotal !== 'number') {
      return new Response(JSON.stringify({ error: 'Dados invalidos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: coupon, error: fetchError } = await supabaseAdmin
      .from('discount_coupons')
      .select('*')
      .eq('code', coupon_code)
      .maybeSingle()

    if (fetchError || !coupon) {
      return new Response(JSON.stringify({ error: 'Cupom nao encontrado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (new Date(coupon.valid_until) < new Date()) {
      return new Response(JSON.stringify({ error: 'Cupom expirado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (coupon.is_used) {
      return new Response(JSON.stringify({ error: 'Cupom ja foi utilizado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (coupon.discount_amount > subtotal) {
      return new Response(JSON.stringify({ error: 'Desconto maior que subtotal.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        code: coupon.code,
        discount_amount: coupon.discount_amount,
        valid_until: coupon.valid_until,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Error in validate-discount-coupon:', error)
    return new Response(JSON.stringify({ error: 'Erro interno ao validar cupom.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
