import { supabase } from '@/lib/supabase/client'

export interface CreateOrderParams {
  customerId: string
  cartItems: any[]
  paymentMethodType: string
  paymentData: any
  shippingMethod: string
  total: number
  subtotal: number
  discountAmount: number
  freight: number
  shippingAddressId: string | null
  orderNumber: string
  status?: string
}

export async function createOrderRecord(params: CreateOrderParams): Promise<{ order_id: string }> {
  const orderId = crypto.randomUUID()

  const { error } = await supabase.from('orders').insert({
    id: orderId,
    customer_id: params.customerId,
    order_number: params.orderNumber,
    status: params.status || 'pending',
    payment_method_type: params.paymentMethodType,
    payment_data: params.paymentData,
    shipping_method: params.shippingMethod,
    shipping_address_id: params.shippingAddressId,
    subtotal: params.subtotal,
    discount_amount: params.discountAmount,
    shipping_cost: params.freight,
    total: params.total,
  })

  if (error) throw error

  if (params.cartItems.length > 0) {
    const orderItems = params.cartItems.map((item) => ({
      id: crypto.randomUUID(),
      order_id: orderId,
      product_id: item.product_id || item.id,
      quantity: item.quantity,
      unit_price: item.unit_price || item.price || 0,
      total_price: (item.unit_price || item.price || 0) * item.quantity,
    }))

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
    if (itemsError) throw itemsError
  }

  return { order_id: orderId }
}
