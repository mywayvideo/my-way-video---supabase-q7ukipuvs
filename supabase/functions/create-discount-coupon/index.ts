import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

const generateCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nao autorizado.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Nao autorizado.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: customerData } = await supabaseAdmin
      .from('customers')
      .select('role')
      .eq('user_id', user.id)
      .single()
    const role = customerData?.role

    let isAllowed = false
    if (role === 'admin') {
      isAllowed = true
    } else if (role === 'collaborator') {
      const { data: setting } = await supabaseAdmin
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'collaborators_can_assisted_checkout')
        .single()
      if (setting?.setting_value === 'true') {
        isAllowed = true
      }
    }

    if (!isAllowed) {
      return new Response(
        JSON.stringify({ error: 'Colaboradores nao tem permissao para gerar cupons.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json().catch(() => ({}))
    const { cartItems, user_id, discount_amount, order_id } = body

    if (!cartItems || !Array.isArray(cartItems) || typeof discount_amount !== 'number') {
      return new Response(JSON.stringify({ error: 'Dados invalidos ou incompletos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let total_profit_margin = 0

    for (const item of cartItems) {
      if (!item.product_id || typeof item.quantity !== 'number') continue

      const { data: product } = await supabaseAdmin
        .from('products')
        .select('price_usd, price_cost')
        .eq('id', item.product_id)
        .single()

      if (product && product.price_usd != null && product.price_cost != null) {
        const itemProfit = (product.price_usd - product.price_cost) * item.quantity
        if (itemProfit > 0) {
          total_profit_margin += itemProfit
        }
      }
    }

    if (discount_amount > total_profit_margin) {
      return new Response(
        JSON.stringify({
          error: `O valor do desconto ultrapassa a margem de lucro da empresa. O lucro total disponível para este pedido é de USD ${total_profit_margin.toFixed(2)}.`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const code = generateCode()
    const validUntil = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()

    const couponPayload = {
      code,
      discount_amount,
      max_profit_margin: total_profit_margin,
      order_id: order_id || null,
      created_by_user_id: user.id,
      valid_until: validUntil,
      is_used: false,
      status: 'active',
    }

    const { error: insertError } = await supabaseAdmin
      .from('discount_coupons')
      .insert(couponPayload)

    if (insertError) {
      throw insertError
    }

    return new Response(
      JSON.stringify({
        code,
        discount_amount,
        max_profit_margin: total_profit_margin,
        valid_until: validUntil,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Error in create-discount-coupon:', error)
    return new Response(JSON.stringify({ error: 'Erro interno ao criar cupom.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
