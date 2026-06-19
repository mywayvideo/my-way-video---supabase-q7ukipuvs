import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useEffect, useState } from 'react'
import { Order } from '@/types/order'
import { orderService } from '@/services/orderService'
import { supabase } from '@/lib/supabase/client'
import { Link } from 'react-router-dom'
import { formatCurrency } from '@/utils/formatters'

interface Props {
  orderId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onReorder: (id: string) => void
  onDownload: (order: Order) => void
  onCancel: () => void
}

export function OrderDetailsModal({
  orderId,
  open,
  onOpenChange,
  onReorder,
  onDownload,
  onCancel,
}: Props) {
  const [order, setOrder] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [extraAddresses, setExtraAddresses] = useState<any>({ shipping: null, billing: null })

  useEffect(() => {
    if (open && orderId) {
      setLoading(true)
      orderService
        .fetchOrderDetails(orderId)
        .then(async (data) => {
          let shipping = Array.isArray(data.shipping_address)
            ? data.shipping_address[0]
            : data.shipping_address
          let billing = Array.isArray(data.billing_address)
            ? data.billing_address[0]
            : data.billing_address

          if (!shipping && data.shipping_address_id) {
            const { data: sData } = await supabase
              .from('customer_addresses')
              .select('*')
              .eq('id', data.shipping_address_id)
              .maybeSingle()
            if (sData) shipping = sData
          }
          if (!billing && data.billing_address_id) {
            const { data: bData } = await supabase
              .from('customer_addresses')
              .select('*')
              .eq('id', data.billing_address_id)
              .maybeSingle()
            if (bData) billing = bData
          }

          setExtraAddresses({ shipping, billing })
          setOrder(data)
        })
        .finally(() => setLoading(false))
    } else {
      setOrder(null)
      setExtraAddresses({ shipping: null, billing: null })
    }
  }, [orderId, open])

  const safeFormatCurrency = (value: any, currentOrder: any = order) => {
    const paymentDataCurrency = (currentOrder?.payment_data as any)?.currency
    let isBRL = false

    if (paymentDataCurrency) {
      isBRL = paymentDataCurrency.toUpperCase() === 'BRL'
    } else {
      isBRL =
        currentOrder?.shipping_method === 'brazil_delivery' ||
        currentOrder?.payment_method_type === 'pix' ||
        currentOrder?.payment_method_type === 'transferencia_brasil' ||
        currentOrder?.payment_method_type === 'boleto'
    }

    const currencySymbol = isBRL ? 'R$' : 'US$'
    const locale = isBRL ? 'pt-BR' : 'en-US'

    try {
      return `${currencySymbol} ${Number(value).toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    } catch {
      return `${currencySymbol} ${value}`
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      const pad = (n: number) => n.toString().padStart(2, '0')
      return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    } catch {
      return dateStr
    }
  }

  const customerName = order?.customers?.full_name || order?.customer?.full_name || 'N/A'
  const customerEmail = order?.customers?.email || order?.customer?.email || 'N/A'
  const customerPhone = order?.customers?.phone || order?.customer?.phone || 'N/A'

  const getDeliveryAddress = (ord: any, fetchedShipping: any) => {
    try {
      const addr = fetchedShipping || ord.payment_data?.shipping_address
      if (!addr && !ord.delivery_address_street) return null

      return {
        street: ord.delivery_address_street ?? addr?.street ?? 'N/A',
        number: ord.delivery_address_number ?? addr?.number ?? 'N/A',
        complement: ord.delivery_address_complement ?? addr?.complement ?? '',
        city: ord.delivery_address_city ?? addr?.city ?? 'N/A',
        state: ord.delivery_address_state ?? addr?.state ?? 'N/A',
        zip_code: ord.delivery_address_zip_code ?? addr?.zip_code ?? 'N/A',
        country: ord.delivery_address_country ?? addr?.country ?? 'N/A',
      }
    } catch {
      return null
    }
  }

  const renderAddress = (addr: any) => {
    if (!addr) {
      return <p className="text-sm text-muted-foreground">N/A (Endereco não fornecido)</p>
    }
    const complementStr =
      addr.complement && addr.complement !== 'N/A' ? ` | ${addr.complement}` : ''
    return (
      <p className="text-sm">
        {addr.street}, {addr.number}
        {complementStr} | {addr.city}, {addr.state} {addr.zip_code} | {addr.country}
      </p>
    )
  }

  const deliveryAddress = order ? getDeliveryAddress(order, extraAddresses.shipping) : null

  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase() || ''
    if (s === 'pending_payment') {
      return (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 animate-pulse uppercase">
          {status}
        </Badge>
      )
    }
    if (s === 'cancelled') {
      return (
        <Badge variant="destructive" className="uppercase">
          {status}
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="uppercase">
        {status}
      </Badge>
    )
  }

  const handleSupport = () => {
    const msg = encodeURIComponent(
      `Olá! Gostaria de solicitar suporte para o meu pedido.\n\n*Número do Pedido:* ${order?.order_number}\n*Cliente:* ${customerName}\n\n*Como podemos ajudar?* (Descreva sua necessidade abaixo):\n`,
    )
    window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] w-[90vw] p-0 overflow-hidden bg-background">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Detalhes do Pedido</DialogTitle>
          <DialogDescription>Pedido {order?.order_number}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] px-6 pb-6">
          {loading || !order ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-3 border-b pb-2">Cabecalho do Pedido</h4>
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="font-medium">Numero:</span> {order.order_number}
                    </p>
                    <p>
                      <span className="font-medium">Cliente:</span> {customerName}
                    </p>
                    <p>
                      <span className="font-medium">Email:</span> {customerEmail}
                    </p>
                    <p>
                      <span className="font-medium">Telefone:</span> {customerPhone}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3 border-b pb-2">Resumo do Pedido</h4>
                  <div className="text-sm space-y-2">
                    <p>
                      <span className="font-medium">Data:</span> {formatDate(order.created_at)}
                    </p>
                    <p>
                      <span className="font-medium">Total:</span>{' '}
                      {safeFormatCurrency(order.total_amount ?? order.total, order)}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Status:</span>
                      {getStatusBadge(order.status)}
                    </div>
                    <p>
                      <span className="font-medium">Metodo de Pagamento:</span>{' '}
                      {order.payment_method_type || 'N/A'}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3 border-b pb-2">Endereco de Entrega</h4>
                  {renderAddress(deliveryAddress)}
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-3 border-b pb-2">Itens do Pedido</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium">Produto</th>
                          <th className="text-center py-2 font-medium">Qtd</th>
                          <th className="text-right py-2 font-medium">Preco</th>
                          <th className="text-right py-2 font-medium">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.order_items?.map((item: any) => {
                          const productName = item.products?.name || item.product_id || 'Produto'
                          const productId = item.product_id

                          return (
                            <tr key={item.id} className="border-b last:border-0">
                              <td className="py-2 pr-2">
                                {productId && item.products?.name ? (
                                  <Link
                                    to={`/product/${productId}`}
                                    className="hover:underline text-emerald-600"
                                  >
                                    {productName}
                                  </Link>
                                ) : (
                                  <span>{productName}</span>
                                )}
                              </td>
                              <td className="text-center py-2 px-1">{item.quantity}</td>
                              <td className="text-right py-2 px-1 whitespace-nowrap">
                                {safeFormatCurrency(item.unit_price, order)}
                              </td>
                              <td className="text-right py-2 pl-2 whitespace-nowrap font-medium">
                                {safeFormatCurrency(
                                  item.subtotal ??
                                    item.total_price ??
                                    item.unit_price * item.quantity,
                                  order,
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3 border-b pb-2">Observacoes</h4>
                  <p className="text-sm whitespace-pre-wrap">{order.notes || 'Sem observacoes'}</p>
                </div>

                <div className="flex flex-col gap-2 pt-4">
                  <Button
                    className="min-h-11 bg-white text-black border border-input hover:bg-orange-500 hover:text-white hover:border-transparent transition-colors"
                    onClick={() => onDownload(order)}
                  >
                    Imprimir Pedido
                  </Button>
                  <Button
                    className="min-h-11 bg-blue-600 text-white border-none hover:bg-orange-500 hover:text-white transition-colors"
                    onClick={() => onReorder(order.id)}
                  >
                    Recomprar Itens
                  </Button>
                  {order.status?.toLowerCase() === 'pending_payment' && (
                    <Button
                      className="min-h-11 bg-white text-black border border-input hover:bg-orange-500 hover:text-white hover:border-transparent transition-colors"
                      onClick={onCancel}
                    >
                      Cancelar Pedido
                    </Button>
                  )}
                  {order.status?.toLowerCase() === 'paid' && (
                    <Button
                      className="min-h-11 bg-green-600 text-white border-none hover:bg-orange-500 hover:text-white transition-colors"
                      onClick={handleSupport}
                    >
                      Solicitar Suporte
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
