import { AdminOrder } from '@/types/admin-order'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import { formatCurrency } from '@/utils/formatters'

interface Props {
  orders: AdminOrder[]
  loading: boolean
  onViewDetails: (id: string) => void
  onApprove: (o: AdminOrder) => void
  onReject: (o: AdminOrder) => void
  onRefund: (o: AdminOrder) => void
}

const StatusBadge = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    pending_payment: 'bg-yellow-500 text-yellow-950 hover:bg-yellow-600',
    paid: 'bg-green-500 text-white hover:bg-green-600',
    cancelled: 'bg-red-500 text-white hover:bg-red-600',
    shipped: 'bg-blue-500 text-white hover:bg-blue-600',
    delivered: 'bg-gray-500 text-white hover:bg-gray-600',
  }
  const labels: Record<string, string> = {
    pending_payment: 'PENDENTE',
    paid: 'PAGO',
    cancelled: 'CANCELADO',
    shipped: 'ENVIADO',
    delivered: 'ENTREGUE',
  }
  return (
    <Badge className={colors[status] || 'bg-gray-500'}>
      {labels[status] || status.toUpperCase()}
    </Badge>
  )
}

export default function OrdersTable({
  orders,
  loading,
  onViewDetails,
  onApprove,
  onReject,
  onRefund,
}: Props) {
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  const renderActions = (order: AdminOrder) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onViewDetails(order.id)}>Ver Detalhes</DropdownMenuItem>
        {order.status === 'pending_payment' && (
          <>
            <DropdownMenuItem onClick={() => onApprove(order)}>Aprovar</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReject(order)} className="text-red-500">
              Rejeitar
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onClick={() => onRefund(order)}>Processar Devolução</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <>
      <div className="hidden md:block border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="hidden lg:table-cell">Pagamento</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">{order.order_number}</TableCell>
                <TableCell>{new Date(order.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{order.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{order.customer_email}</div>
                </TableCell>
                <TableCell className="hidden lg:table-cell capitalize">
                  {order.payment_method}
                </TableCell>
                <TableCell>{formatCurrency(order.total_amount, 'USD')}</TableCell>
                <TableCell>
                  <StatusBadge status={order.status} />
                </TableCell>
                <TableCell className="text-right">{renderActions(order)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-4">
        {orders.map((order) => (
          <Card key={order.id}>
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold">{order.order_number}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString()}
                  </div>
                </div>
                <StatusBadge status={order.status} />
              </div>
              <div className="text-sm">{order.customer_name}</div>
              <div className="flex justify-between items-center mt-2">
                <div className="font-medium">{formatCurrency(order.total_amount, 'USD')}</div>
                {renderActions(order)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
