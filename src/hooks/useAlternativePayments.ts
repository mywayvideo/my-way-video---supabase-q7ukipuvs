import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { PaymentMethod, CustomerData } from '@/types/payment'
import {
  getAvailablePaymentMethods,
  initiatePayPalPayment,
  generateBankDepositDetailsUSA,
  generateZelleDetails,
  createPendingOrder,
  createTransferenciaBrasilOrder,
  createPIXOrder,
} from '@/services/paymentService'

export function useAlternativePayments() {
  const [isLoading, setIsLoading] = useState(false)

  const validateShippingMethod = useCallback((method: string): boolean => {
    return ['miami_pickup', 'usa_cargo', 'brazil_delivery'].includes(method)
  }, [])

  const handlePayPalFlow = useCallback(async (amount: number, email: string, orderId: string) => {
    const data = await initiatePayPalPayment(amount, email, orderId)
    if (data?.approval_url) {
      window.location.href = data.approval_url
    } else if (data?.paypal_approval_url) {
      window.location.href = data.paypal_approval_url
    } else if (data?.redirect_url) {
      window.location.href = data.redirect_url
    } else {
      throw new Error('Não foi possível iniciar o pagamento PayPal.')
    }
  }, [])

  return {
    isLoading,
    setIsLoading,
    validateShippingMethod,
    handlePayPalFlow,
    generateBankDepositDetailsUSA,
    generateZelleDetails,
    createPendingOrder,
    createTransferenciaBrasilOrder,
    createPIXOrder,
    getAvailablePaymentMethods,
  }
}
