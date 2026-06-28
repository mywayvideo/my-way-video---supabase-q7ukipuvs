import { supabase } from '@/lib/supabase/client'
import { createOrderRecord } from '@/services/orderCreation'

export async function createPaymentIntent(
  amount: number,
  currency: string,
  email: string,
  name: string,
  orderNumber: string,
): Promise<{ client_secret: string }> {
  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: { amount, currency, customer_email: email, customer_name: name, order_id: orderNumber },
  })
  if (error) throw error
  return { client_secret: data.client_secret }
}

export async function confirmCardPayment(
  stripe: any,
  clientSecret: string,
  cardElement: any,
  name: string,
  email: string,
): Promise<any> {
  const result = await stripe.confirmCardPayment(clientSecret, {
    payment_method: {
      card: cardElement,
      billing_details: { name, email },
    },
  })
  if (result.error) throw result.error
  return result.paymentIntent
}

export async function createOrderAfterPayment(
  paymentIntentId: string,
  total: number,
  cartItems: any[],
  email: string,
  userId: string,
  shippingAddressId: string | null,
  shippingMethod: string,
  freight: number | null,
  discountAmount: number,
): Promise<void> {
  const { data: customer, error: custError } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', userId)
    .single()
  if (custError) throw custError

  const subtotal = total + discountAmount - (freight || 0)

  await createOrderRecord({
    customerId: customer.id,
    cartItems,
    paymentMethodType: 'card',
    paymentData: { payment_intent_id: paymentIntentId, email },
    shippingMethod,
    total,
    subtotal,
    discountAmount,
    freight: freight || 0,
    shippingAddressId,
    orderNumber: `ORD-${paymentIntentId.slice(-8)}`,
    status: 'paid',
  })
}

export function clearCartFromLocalStorage(): void {
  const keys = [
    'cart',
    'myway_local_cart',
    'cartItems',
    'mw-video-cart',
    'shopping-cart',
    'cart-storage',
  ]
  keys.forEach((key) => localStorage.removeItem(key))
}

export async function clearCartFromSupabase(userId: string): Promise<void> {
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (customer) {
    const { data: cart } = await supabase
      .from('shopping_carts')
      .select('id')
      .eq('customer_id', customer.id)
      .maybeSingle()

    if (cart) {
      await supabase.from('cart_items').delete().eq('cart_id', cart.id)
    }
  }
}
