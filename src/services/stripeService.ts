import { supabase } from '@/lib/supabase/client'

export const createPaymentIntent = async (
  amount: number,
  currency: string,
  customer_email: string,
  customer_name: string,
  order_id: string,
) => {
  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: { amount, currency, customer_email, customer_name, order_id },
  })
  if (error) throw error
  if (data.error) throw new Error(data.error)
  return data // { client_secret, payment_intent_id, status }
}

export const confirmCardPayment = async (
  stripe: any,
  clientSecret: string,
  cardElement: any,
  name: string,
  email: string,
) => {
  if (!stripe || !cardElement) {
    throw new Error('Stripe ou CardElement não inicializado')
  }
  const { paymentIntent, error } = await stripe.confirmCardPayment(clientSecret, {
    payment_method: {
      card: cardElement,
      billing_details: {
        name,
        email,
      },
    },
  })
  if (error) throw new Error(error.message)
  return paymentIntent
}

export const createOrderAfterPayment = async (
  paymentIntentId: string,
  orderTotal: number,
  items: any[],
  userEmail: string,
  userId: string,
  shippingAddressId: string | null,
  shippingMethod: string,
  shippingCost: number | null,
  discountAmount: number,
) => {
  // Get customer id from user_id
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', userId)
    .single()
  if (!customer) throw new Error('Cliente não encontrado')

  const orderNumber = `ORD-${Date.now().toString().slice(-6)}`

  // Calculate subtotal from items
  const subtotal = items.reduce((acc, item) => acc + item.unit_price * item.quantity, 0)

  // Insert order
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      customer_id: customer.id,
      order_number: orderNumber,
      status: 'paid', // Use 'paid' as requested
      shipping_address_id: shippingAddressId,
      payment_method_type: 'card',
      subtotal,
      discount_amount: discountAmount,
      shipping_cost: shippingCost,
      total: orderTotal,
      shipping_method: shippingMethod,
    })
    .select('id')
    .single()

  if (orderErr) throw new Error(`Erro ao criar pedido: ${orderErr.message}`)

  // Insert items
  const orderItems = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id || item.id, // handle case where item.product_id is missing
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.unit_price * item.quantity,
  }))

  const { error: itemsErr } = await supabase.from('order_items').insert(orderItems)
  if (itemsErr) throw new Error(`Erro ao salvar itens do pedido: ${itemsErr.message}`)

  // Insert status history
  const { error: historyErr } = await supabase.from('order_status_history').insert({
    order_id: order.id,
    new_status: 'paid',
    old_status: null,
    changed_by: customer.id,
  })

  if (historyErr) throw new Error(`Erro ao salvar histórico do pedido: ${historyErr.message}`)

  return order.id
}

export const clearCartFromLocalStorage = () => {
  localStorage.removeItem('cart')
}

export const clearCartFromSupabase = async (userId: string) => {
  // Find customer
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', userId)
    .single()
  if (!customer) return

  // Find cart
  const { data: cart } = await supabase
    .from('shopping_carts')
    .select('id')
    .eq('customer_id', customer.id)
    .single()
  if (!cart) return

  // Delete items
  await supabase.from('cart_items').delete().eq('cart_id', cart.id)
}
