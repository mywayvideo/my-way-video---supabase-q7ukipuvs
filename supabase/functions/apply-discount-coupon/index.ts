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
    const { coupon_code, order_id, discount_amount } = body

    if (!coupon_code || !order_id || typeof discount_amount !== 'number') {
      return new Response(JSON.stringify({ error: 'Dados invalidos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('subtotal, shipping_cost')
      .eq('id', order_id)
      .single()

    if (!order) {
      return new Response(JSON.stringify({ error: 'Pedido nao encontrado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: coupon } = await supabaseAdmin
      .from('discount_coupons')
      .select('*')
      .eq('code', coupon_code)
      .single()

    if (!coupon) {
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
    if (coupon.discount_amount !== discount_amount) {
      return new Response(JSON.stringify({ error: 'Valor do desconto incompativel.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (coupon.discount_amount > order.subtotal) {
      return new Response(JSON.stringify({ error: 'Desconto maior que subtotal.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: updateCouponError } = await supabaseAdmin
      .from('discount_coupons')
      .update({ is_used: true, used_at: new Date().toISOString(), used_on_order_id: order_id })
      .eq('code', coupon_code)

    if (updateCouponError) throw updateCouponError

    const shipping_cost = order.shipping_cost || 0
    const final_total = order.subtotal - discount_amount + shipping_cost

    const { error: updateOrderError } = await supabaseAdmin
      .from('orders')
      .update({ discount_amount: discount_amount, total: final_total })
      .eq('id', order_id)

    if (updateOrderError) throw updateOrderError

    return new Response(
      JSON.stringify({
        message: `Cupom aplicado com sucesso. Desconto: USD ${discount_amount}`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Error in apply-discount-coupon:', error)
    return new Response(JSON.stringify({ error: 'Erro interno ao aplicar cupom.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
