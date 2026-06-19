import { supabase } from '@/lib/supabase/client'
import { PaymentMethod, BankDetails, PIXData, ZelleData, CustomerData } from '@/types/payment'

export const getAvailablePaymentMethods = (shippingMethod: string): PaymentMethod[] => {
  const baseOptions: PaymentMethod[] = ['stripe', 'transferencia_miami', 'zelle', 'paypal']
  if (shippingMethod === 'brazil_delivery') {
    return [...baseOptions, 'pix', 'transferencia_brasil']
  }
  return baseOptions
}

export const initiatePayPalPayment = async (amount: number, email: string, orderId: string) => {
  const { data, error } = await supabase.functions.invoke('create-paypal-payment-intent', {
    body: { order_id: orderId, amount: Math.round(amount * 100) },
  })
  if (error || !data?.paypal_approval_url) {
    throw new Error('Erro ao conectar com PayPal. Tente novamente.')
  }
  return data.paypal_approval_url
}

export const generateBankDepositDetailsUSA = (orderId: string, amount: number): BankDetails => {
  return {
    bankName: 'Miami International Bank',
    accountNumber: '987654321',
    routingNumber: '123456789',
    accountHolder: 'My Way Business LLC',
    swiftCode: 'MIBKUS3M',
  }
}

export const generateZelleDetails = (orderId: string, amount: number): ZelleData => {
  return {
    email: 'payments@mywayvideo.com',
  }
}

export const createPendingOrder = async (
  customerId: string,
  items: any[],
  paymentMethod: PaymentMethod,
  paymentData: any,
  shippingMethod: string,
  total: number,
  subtotal: number,
  discountAmount: number,
  freight: number | null,
  shippingAddressId: string | null,
  orderNumber: string,
) => {
  let paymentMethodType = 'transfer'
  if (paymentMethod === 'stripe') paymentMethodType = 'card'
  if (paymentMethod === 'pix') paymentMethodType = 'pix'
  if (paymentMethod === 'paypal') paymentMethodType = 'paypal'
  if (paymentMethod === 'zelle') paymentMethodType = 'zelle'

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      customer_id: customerId,
      order_number: orderNumber,
      status: 'pending_payment',
      shipping_address_id: shippingAddressId,
      payment_method_type: paymentMethodType,
      subtotal,
      discount_amount: discountAmount,
      shipping_cost: freight,
      total,
      shipping_method: shippingMethod,
      payment_data: paymentData,
    } as any)
    .select('id, order_number')
    .single()

  if (orderErr) throw orderErr

  const itemsToInsert = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.unit_price * item.quantity,
  }))

  const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert)
  if (itemsErr) throw itemsErr

  return { order_id: order.id, order_number: order.order_number }
}

export const createTransferenciaBrasilOrder = async (
  customerId: string,
  items: any[],
  customerData: CustomerData,
  shippingMethod: string,
  total: number,
  subtotal: number,
  discountAmount: number,
  freight: number | null,
  shippingAddressId: string | null,
  orderNumber: string,
) => {
  return createPendingOrder(
    customerId,
    items,
    'transferencia_brasil',
    customerData,
    shippingMethod,
    total,
    subtotal,
    discountAmount,
    freight,
    shippingAddressId,
    orderNumber,
  )
}

export const createPIXOrder = async (
  customerId: string,
  items: any[],
  customerData: CustomerData,
  shippingMethod: string,
  total: number,
  subtotal: number,
  discountAmount: number,
  freight: number | null,
  shippingAddressId: string | null,
  orderNumber: string,
) => {
  return createPendingOrder(
    customerId,
    items,
    'pix',
    customerData,
    shippingMethod,
    total,
    subtotal,
    discountAmount,
    freight,
    shippingAddressId,
    orderNumber,
  )
}
