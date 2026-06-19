import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import {
  initiatePayPalPayment,
  createPendingOrder,
  createTransferenciaBrasilOrder,
  createPIXOrder,
  generateBankDepositDetailsUSA,
  generateZelleDetails,
  getAvailablePaymentMethods,
} from '@/services/paymentService'

export const useAlternativePayments = () => {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const validateShippingMethod = (shippingMethod: string) => {
    const valid = ['brazil_delivery', 'usa_cargo', 'miami_pickup']
    if (!valid.includes(shippingMethod)) {
      toast({ description: 'Método de entrega inválido.', variant: 'destructive' })
      return false
    }
    return true
  }

  const handlePayPalFlow = async (amount: number, email: string, orderId: string) => {
    setIsLoading(true)
    try {
      const url = await initiatePayPalPayment(amount, email, orderId)
      window.location.href = url
    } catch (err: any) {
      toast({ description: 'Pagamento PayPal falhou. Tente novamente.', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

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
