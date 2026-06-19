import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [orderDetails, setOrderDetails] = useState<any>(null)

  useEffect(() => {
    const orderId = searchParams.get('order_id')
    const paymentMethod = searchParams.get('payment_method')
    const token = searchParams.get('token')

    if (!orderId) {
      navigate('/')
      return
    }

    const verifyPayment = async () => {
      try {
        if (paymentMethod === 'paypal') {
          const { error } = await supabase.functions.invoke('verify-paypal-payment', {
            body: { order_id: orderId, token },
          })
          if (error) throw error
        }

        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .select('*, shipping_address:customer_addresses(*)')
          .eq('id', orderId)
          .single()

        if (orderErr) throw orderErr
        setOrderDetails(order)
      } catch (err) {
        toast({
          description: 'Nao foi possivel verificar pagamento. Contate suporte.',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }

    verifyPayment()
  }, [searchParams, navigate, toast])

  if (loading) {
    return (
      <div className="container mx-auto py-24 flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="text-gray-600">Verificando pagamento...</p>
      </div>
    )
  }

  if (!orderDetails) {
    return (
      <div className="container mx-auto py-24 text-center">
        <h1 className="text-3xl font-bold mb-4">Erro ao carregar pedido</h1>
        <Button onClick={() => navigate('/')}>Voltar à Loja</Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-12 max-w-2xl text-center">
      <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-6" />
      <h1 className="text-3xl font-bold mb-4">Pedido Confirmado!</h1>
      <p className="text-gray-600 mb-8">
        Seu pagamento foi aprovado e seu pedido (<strong>{orderDetails.order_number}</strong>) foi
        recebido.
      </p>

      <div className="bg-gray-50 p-6 rounded-lg text-left mb-8 space-y-4">
        <div className="flex justify-between">
          <span className="text-gray-600">Total Pago:</span>
          <span className="font-bold">USD {orderDetails.total?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Método de Entrega:</span>
          <span className="font-medium">
            {orderDetails.shipping_method?.toUpperCase().replace('_', ' ')}
          </span>
        </div>
        {orderDetails.shipping_address && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-gray-600 mb-1">Endereço de Entrega:</p>
            <p className="font-medium">
              {orderDetails.shipping_address.street}, {orderDetails.shipping_address.number}
              {orderDetails.shipping_address.complement &&
                ` - ${orderDetails.shipping_address.complement}`}
            </p>
            <p className="font-medium">
              {orderDetails.shipping_address.city} - {orderDetails.shipping_address.state}
            </p>
            <p className="font-medium">{orderDetails.shipping_address.zip_code}</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="font-bold">Próximos Passos:</h3>
        <p className="text-sm text-gray-600">
          Você receberá um e-mail com os detalhes do pedido e atualizações sobre o envio.
        </p>
        <Button className="mt-4" onClick={() => navigate('/')}>
          Continuar Comprando
        </Button>
      </div>
    </div>
  )
}
