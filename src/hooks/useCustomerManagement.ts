import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { fetchAllCustomers } from '@/services/customerManagementService'
import { supabase } from '@/lib/supabase/client'

export function useCustomerManagement() {
  const [customers, setCustomers] = useState<any[]>([])
  const [totalCustomers, setTotalCustomers] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const { toast } = useToast()

  const loadCustomers = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await fetchAllCustomers(page, limit, searchTerm, statusFilter)
      setCustomers(result.customers)
      setTotalCustomers(result.total)
    } catch (error: any) {
      console.error('Error fetching customers:', error)
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao buscar clientes.',
        variant: 'destructive',
      })
      setCustomers([])
      setTotalCustomers(0)
    } finally {
      setIsLoading(false)
    }
  }, [page, limit, searchTerm, statusFilter, toast])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  const updateCustomerStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase.from('customers').update({ status }).eq('id', id)
      if (error) throw error
      toast({ title: 'Sucesso', description: 'Status do cliente atualizado.' })
      loadCustomers()
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const updateCustomerRole = async (id: string, role: string) => {
    try {
      const { error } = await supabase.from('customers').update({ role }).eq('id', id)
      if (error) throw error
      toast({ title: 'Sucesso', description: 'Função do cliente atualizada.' })
      loadCustomers()
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteCustomer = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.'))
      return
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) throw error
      toast({ title: 'Sucesso', description: 'Cliente excluído com sucesso.' })
      loadCustomers()
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const handleReset2FA = async (customer: any) => {
    if (!confirm('Tem certeza que deseja resetar o 2FA deste cliente?')) return
    try {
      const { error } = await supabase
        .from('customers')
        .update({ two_factor_enabled: false })
        .eq('id', customer.id)
      if (error) throw error
      toast({ title: 'Sucesso', description: '2FA resetado com sucesso.' })
      loadCustomers()
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  return {
    customers,
    total: totalCustomers,
    isLoading,
    loading: isLoading,
    page,
    setPage,
    limit,
    setLimit,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    refreshCustomers: loadCustomers,
    updateCustomerStatus,
    updateCustomerRole,
    handleDeleteCustomer,
    handleReset2FA,
  }
}
