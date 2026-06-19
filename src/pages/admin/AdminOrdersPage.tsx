import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { useAdminOrders } from '@/hooks/useAdminOrders'
import { Button } from '@/components/ui/button'
import { AdminOrder } from '@/types/admin-order'
import OrdersTable from './orders/OrdersTable'
import OrdersFilters from './orders/OrdersFilters'
import OrdersPagination from './orders/OrdersPagination'
import OrderDetailsDialog from './orders/OrderDetailsDialog'
import RefundDialog from './orders/RefundDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Download } from 'lucide-react'

export default function AdminOrdersPage() {
  const { currentUser: user, loading: authLoading } = useAuthContext()
  const navigate = useNavigate()
  const [isAdmin, setIsAdmin] = useState(false)

  const {
    orders,
    loading,
    error,
    totalCount,
    filters,
    setFilters,
    fetchOrders,
    approveOrder,
    rejectOrder,
    processRefund,
  } = useAdminOrders()

  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [refundOrder, setRefundOrder] = useState<AdminOrder | null>(null)
  const [approveConfirm, setApproveConfirm] = useState<AdminOrder | null>(null)
  const [rejectConfirm, setRejectConfirm] = useState<AdminOrder | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    if (!authLoading) {
      if (!user) navigate('/login')
      else {
        supabase
          .from('customers')
          .select('role')
          .eq('user_id', user.id)
          .single()
          .then(({ data }) => {
            if (data?.role === 'admin') setIsAdmin(true)
            else navigate('/login')
          })
      }
    }
  }, [user, authLoading, navigate])

  useEffect(() => {
    if (isAdmin) fetchOrders()
  }, [isAdmin, fetchOrders])

  const handleExport = () => {
    const headers = ['Pedido', 'Cliente', 'Email', 'Total', 'Status', 'Data']
    const rows = orders.map((o) => [
      o.order_number,
      o.customer_name,
      o.customer_email,
      o.total_amount,
      o.status,
      new Date(o.created_at).toLocaleDateString(),
    ])
    const csv =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const link = document.createElement('a')
    link.href = encodeURI(csv)
    link.download = 'pedidos.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleApprove = async () => {
    if (!approveConfirm) return
    setActionLoading(true)
    await approveOrder(approveConfirm)
    setActionLoading(false)
    setApproveConfirm(null)
  }

  const handleReject = async () => {
    if (!rejectConfirm) return
    setActionLoading(true)
    await rejectOrder(rejectConfirm)
    setActionLoading(false)
    setRejectConfirm(null)
  }

  if (authLoading || !isAdmin)
    return <div className="p-8 text-center text-muted-foreground">Carregando...</div>

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-3xl font-bold">Gerenciamento de Pedidos</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground">
            {totalCount} pedidos encontrados
          </span>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" /> Exportar CSV
          </Button>
        </div>
      </div>

      <OrdersFilters filters={filters} setFilters={setFilters} onApply={fetchOrders} />

      {error ? (
        <div className="text-center text-red-500 py-8 border rounded-lg bg-card">
          <p>Erro ao carregar pedidos. Tente novamente.</p>
          <Button variant="outline" onClick={fetchOrders} className="mt-4">
            Tentar Novamente
          </Button>
        </div>
      ) : orders.length === 0 && !loading ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg bg-card">
          <p className="mb-4">Nenhum pedido encontrado.</p>
          <Button
            variant="outline"
            onClick={() => {
              setFilters({ page: 1, limit: 10 })
              fetchOrders()
            }}
          >
            Limpar Filtros
          </Button>
        </div>
      ) : (
        <OrdersTable
          orders={orders}
          loading={loading}
          onViewDetails={(id) => setDetailsId(id)}
          onApprove={setApproveConfirm}
          onReject={setRejectConfirm}
          onRefund={setRefundOrder}
        />
      )}

      {!loading && totalCount > 0 && (
        <OrdersPagination filters={filters} setFilters={setFilters} total={totalCount} />
      )}

      <OrderDetailsDialog
        orderId={detailsId}
        open={!!detailsId}
        onOpenChange={(o) => !o && setDetailsId(null)}
      />
      <RefundDialog
        order={refundOrder}
        open={!!refundOrder}
        onOpenChange={(o: boolean) => !o && setRefundOrder(null)}
        onProcess={processRefund}
      />

      <AlertDialog open={!!approveConfirm} onOpenChange={(o) => !o && setApproveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar aprovação do pedido?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleApprove()
              }}
              disabled={actionLoading}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!rejectConfirm} onOpenChange={(o) => !o && setRejectConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar rejeição do pedido?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleReject()
              }}
              disabled={actionLoading}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
