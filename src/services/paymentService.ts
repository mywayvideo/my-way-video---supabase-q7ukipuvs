import { supabase } from '@/lib/supabase/client'
import { PaymentMethod, CustomerData } from '@/types/payment'
import { createOrderRecord } from '@/services/orderCreation'

export function getAvailablePaymentMethods(shippingMethod: string): PaymentMethod[] {
  if (shippingMethod === 'brazil_delivery') {
    return ['pix', 'transferencia_brasil', 'paypal', 'stripe']
  }
  return ['stripe', 'transferencia_miami', 'zelle', 'paypal']
}

export async function initiatePayPalPayment(
  amount: number,
  email: string,
  orderId: string,
): Promise<any> {
  const { data, error } = await supabase.functions.invoke('create-paypal-payment-intent', {
    body: {
      amount,
      email,
      order_id: orderId,
      return_url: `${window.location.origin}/checkout/success`,
      cancel_url: `${window.location.origin}/checkout?cancel=paypal`,
    },
  })
  if (error) throw error
  return data
}

export async function generateBankDepositDetailsUSA(): Promise<any> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'transfer_usa_bank_details')
    .maybeSingle()
  if (error) throw error
  return data?.setting_value ? JSON.parse(data.setting_value) : null
}

export async function generateZelleDetails(): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'zelle_email')
    .maybeSingle()
  if (error) throw error
  return data?.setting_value || null
}

export async function createPendingOrder(
  customerId: string,
  cartItems: any[],
  paymentMethod: PaymentMethod,
  paymentData: any,
  shippingMethod: string,
  total: number,
  subtotal: number,
  discountAmount: number,
  freight: number,
  shippingAddressId: string | null,
  orderNumber: string,
): Promise<{ order_id: string }> {
  return createOrderRecord({
    customerId,
    cartItems,
    paymentMethodType: paymentMethod,
    paymentData,
    shippingMethod,
    total,
    subtotal,
    discountAmount,
    freight,
    shippingAddressId,
    orderNumber,
    status: 'pending',
  })
}

export async function createTransferenciaBrasilOrder(
  customerId: string,
  cartItems: any[],
  customerData: CustomerData,
  shippingMethod: string,
  total: number,
  subtotal: number,
  discountAmount: number,
  freight: number,
  shippingAddressId: string | null,
  orderNumber: string,
): Promise<{ order_id: string }> {
  return createOrderRecord({
    customerId,
    cartItems,
    paymentMethodType: 'transferencia_brasil',
    paymentData: { customer: customerData },
    shippingMethod,
    total,
    subtotal,
    discountAmount,
    freight,
    shippingAddressId,
    orderNumber,
    status: 'pending',
  })
}

export async function createPIXOrder(
  customerId: string,
  cartItems: any[],
  customerData: CustomerData,
  shippingMethod: string,
  total: number,
  subtotal: number,
  discountAmount: number,
  freight: number,
  shippingAddressId: string | null,
  orderNumber: string,
): Promise<{ order_id: string }> {
  return createOrderRecord({
    customerId,
    cartItems,
    paymentMethodType: 'pix',
    paymentData: { customer: customerData },
    shippingMethod,
    total,
    subtotal,
    discountAmount,
    freight,
    shippingAddressId,
    orderNumber,
    status: 'pending',
  })
}
