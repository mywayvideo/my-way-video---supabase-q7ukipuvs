import { useState } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { DashboardAdminCustomers } from './DashboardAdminCustomers'
import { useCustomerManagement } from '@/hooks/useCustomerManagement'
import { EditCustomerModal } from '@/components/admin/EditCustomerModal'
import { CreateCustomerModal } from '@/components/admin/CreateCustomerModal'
import { CustomerCSVImporter } from '@/components/admin/CustomerCSVImporter'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'

export default function AdminCustomersPage() {
  const customerParams = useCustomerManagement()
  const { toast } = useToast()

  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<any>(null)

  const handleEditCustomer = (customer: any) => {
    setEditingCustomer(customer)
    setIsEditModalOpen(true)
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCustomer) return
    try {
      const { error } = await supabase
        .from('customers')
        .update({
          full_name: editingCustomer.full_name,
          email: editingCustomer.email,
          role: editingCustomer.role,
          status: editingCustomer.status,
          phone: editingCustomer.phone,
          cpf: editingCustomer.cpf,
          billing_address: editingCustomer.billing_address,
          shipping_address: editingCustomer.shipping_address,
        })
        .eq('id', editingCustomer.id)

      if (error) throw error
      toast({ title: 'Sucesso', description: 'Cliente atualizado com sucesso.' })
      setIsEditModalOpen(false)
      customerParams.refreshCustomers()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isImporterOpen, setIsImporterOpen] = useState(false)
  const [newCustomer, setNewCustomer] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'customer',
  })

  const handleCreateCustomer = () => {
    setNewCustomer({ full_name: '', email: '', password: '', role: 'customer' })
    setIsCreateModalOpen(true)
  }

  const handleSaveCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { error } = await supabase.functions.invoke('create-customer', {
        body: {
          email: newCustomer.email,
          password: newCustomer.password,
          name: newCustomer.full_name,
          role: newCustomer.role,
        },
      })
      if (error) throw new Error(error.message || 'Erro ao criar cliente')
      toast({ title: 'Sucesso', description: 'Cliente criado com sucesso.' })
      setIsCreateModalOpen(false)
      customerParams.refreshCustomers()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  return (
    <AdminLayout breadcrumb="Gerenciar Clientes">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in-up">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Gerenciar Clientes</h1>
            <p className="text-muted-foreground mt-2">
              Administre a base de clientes, níveis de acesso, endereços e informações.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsImporterOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Importar CSV
            </Button>
          </div>
        </div>

        <DashboardAdminCustomers
          {...customerParams}
          handleEditCustomer={handleEditCustomer}
          handleCreateCustomer={handleCreateCustomer}
        />

        <EditCustomerModal
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          customer={editingCustomer}
          setCustomer={setEditingCustomer}
          onSave={handleSaveEdit}
        />

        <CreateCustomerModal
          open={isCreateModalOpen}
          onOpenChange={setIsCreateModalOpen}
          customer={newCustomer}
          setCustomer={setNewCustomer}
          onSave={handleSaveCreate}
        />

        <CustomerCSVImporter
          open={isImporterOpen}
          onOpenChange={setIsImporterOpen}
          onSuccess={customerParams.refreshCustomers}
        />
      </div>
    </AdminLayout>
  )
}
