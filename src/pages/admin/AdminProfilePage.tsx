import { AdminLayout } from '@/components/admin/AdminLayout'
import { DashboardAdminProfile } from './DashboardAdminProfile'

export default function AdminProfilePage() {
  return (
    <AdminLayout breadcrumb="Meu Perfil">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
        <DashboardAdminProfile />
      </div>
    </AdminLayout>
  )
}
