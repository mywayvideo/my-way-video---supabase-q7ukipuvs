import { Order } from '@/types/order'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Eye, Download, RefreshCw, X, Package } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useState } from 'react'
import { useOrderActions } from '@/hooks/useOrderActions'
import { orderService } from '@/services/orderService'
import { OrderDetailsModal } from './OrderDetailsModal'
import { OrderCancelModal } from './OrderCancelModal'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function OrderHistoryTab({
  orders,
  customerId,
  onRefresh,
}: {
  orders: Order[]
  customerId: string
  onRefresh: () => void
}) {
  const { actionLoading, handleDownloadInvoice, handleReorder, handleCancelOrder } =
    useOrderActions()
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const onDownloadClick = async (order: Order) => {
    setDownloadingId(order.id)
    try {
      const fullOrder = await orderService.fetchOrderDetails(order.id)
      await handleDownloadInvoice(fullOrder)
    } catch (e) {
      await handleDownloadInvoice(order)
    } finally {
      setDownloadingId(null)
    }
  }

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase()
    if (s.includes('pendente')) return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
    if (s.includes('processando')) return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
    if (s.includes('enviado') || s.includes('entregue') || s.includes('paid'))
      return 'bg-green-500/10 text-green-600 border-green-500/20'
    if (s.includes('cancelado')) return 'bg-red-500/10 text-red-600 border-red-500/20'
    return 'bg-secondary text-secondary-foreground'
  }

  const formatOrderCurrency = (order: Order) => {
    const paymentDataCurrency = (order.payment_data as any)?.currency
    let isBRL = false

    if (paymentDataCurrency) {
      isBRL = paymentDataCurrency.toUpperCase() === 'BRL'
    } else {
      isBRL =
        order.shipping_method === 'brazil_delivery' ||
        order.payment_method_type === 'pix' ||
        order.payment_method_type === 'transferencia_brasil' ||
        order.payment_method_type === 'boleto'
    }

    const currencySymbol = isBRL ? 'R$' : 'US$'
    const locale = isBRL ? 'pt-BR' : 'en-US'

    return `${currencySymbol} ${Number(order.total).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-lg animate-fade-in">
        <Package className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
        <h3 className="text-xl font-medium mb-2">Nenhum pedido encontrado</h3>
        <p className="text-muted-foreground mb-6 max-w-sm">
          Você ainda não fez nenhum pedido conosco. Explore nossos produtos e faça sua primeira
          compra!
        </p>
      </div>
    )
  }

  const renderActions = (order: Order) => (
    <div className="flex justify-end gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedOrder(order)}
            className="text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
          >
            <Eye className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Ver Detalhes</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={actionLoading === `invoice-${order.id}` || downloadingId === order.id}
            onClick={() => onDownloadClick(order)}
            className="text-muted-foreground"
          >
            {downloadingId === order.id ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Baixar Fatura</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={actionLoading === `reorder-${order.id}`}
            onClick={() => handleReorder(order.id)}
            className="text-green-500"
          >
            <RefreshCw
              className={`w-4 h-4 ${actionLoading === `reorder-${order.id}` ? 'animate-spin' : ''}`}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Recomprar</p>
        </TooltipContent>
      </Tooltip>

      {(order.status === 'pending' || order.status === 'pending_payment') && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCancelOrder(order)}
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
            >
              <X className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Cancelar Pedido</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )

  return (
    <div className="animate-fade-in">
      <div className="hidden md:block border border-border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader className="bg-secondary/50">
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{new Date(order.created_at).toLocaleDateString('pt-BR')}</TableCell>
                <TableCell className="font-semibold">{order.order_number}</TableCell>
                <TableCell className="text-right font-bold">{formatOrderCurrency(order)}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className={getStatusColor(order.status)}>
                    {order.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{renderActions(order)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-4">
        {orders.map((order) => (
          <Card key={order.id} className="bg-card">
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString('pt-BR')}
                  </p>
                  <p className="font-bold text-lg">{order.order_number}</p>
                </div>
                <Badge variant="outline" className={getStatusColor(order.status)}>
                  {order.status}
                </Badge>
              </div>
              <div className="flex justify-between font-bold py-2 border-y border-border">
                <span>Total</span>
                <span>{formatOrderCurrency(order)}</span>
              </div>
              <div className="flex justify-end gap-2 pt-1">{renderActions(order)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <OrderDetailsModal
        orderId={selectedOrder?.id || null}
        open={!!selectedOrder}
        onOpenChange={(v) => !v && setSelectedOrder(null)}
        onReorder={handleReorder}
        onDownload={handleDownloadInvoice}
        onCancel={() => {
          if (selectedOrder) {
            setCancelOrder(selectedOrder)
            setSelectedOrder(null)
          }
        }}
      />
      <OrderCancelModal
        order={cancelOrder}
        open={!!cancelOrder}
        onOpenChange={(v) => !v && setCancelOrder(null)}
        onConfirm={(reason) => {
          if (cancelOrder)
            handleCancelOrder(
              cancelOrder.id,
              reason,
              cancelOrder.payment_method_type || 'transfer',
              () => {
                setCancelOrder(null)
                onRefresh()
              },
            )
        }}
        loading={actionLoading === `cancel-${cancelOrder?.id}`}
      />
    </div>
  )
}
