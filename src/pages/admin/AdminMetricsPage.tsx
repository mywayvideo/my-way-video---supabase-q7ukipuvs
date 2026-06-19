import { AdminLayout } from '@/components/admin/AdminLayout'
import { DashboardAdminMetrics } from './DashboardAdminMetrics'
import { useAdminDashboard } from '@/hooks/useAdminDashboard'

export default function AdminMetricsPage() {
  const dashboardParams = useAdminDashboard()

  return (
    <AdminLayout breadcrumb="Métricas e Relatórios">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Métricas e Relatórios</h1>
          <p className="text-muted-foreground mt-2">
            Acompanhe o desempenho de vendas e acessos em tempo real.
          </p>
        </div>
        <DashboardAdminMetrics {...dashboardParams} />
      </div>
    </AdminLayout>
  )
}
