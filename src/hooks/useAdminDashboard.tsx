import { useState, useCallback } from 'react'
import { adminService } from '@/services/adminService'

export function useAdminDashboard() {
  const [customers, setCustomers] = useState<any[]>([])
  const [customersTotal, setCustomersTotal] = useState(0)
  const [discounts, setDiscounts] = useState<any[]>([])
  const [discountsTotal, setDiscountsTotal] = useState(0)
  const [metrics, setMetrics] = useState<any>(null)

  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [loadingDiscounts, setLoadingDiscounts] = useState(true)
  const [loadingMetrics, setLoadingMetrics] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCustomers = useCallback(
    async (page = 1, limit = 20, searchTerm = '', roleFilter = '') => {
      try {
        setLoadingCustomers(true)
        setError(null)
        const { data, count } = await adminService.fetchAllCustomers(
          page,
          limit,
          searchTerm,
          roleFilter,
        )
        setCustomers(data)
        setCustomersTotal(count || 0)
      } catch (err) {
        console.error(err)
        setError('Não foi possível carregar clientes.')
      } finally {
        setLoadingCustomers(false)
      }
    },
    [],
  )

  const fetchDiscounts = useCallback(async (page = 1, limit = 10, searchTerm = '') => {
    try {
      setLoadingDiscounts(true)
      setError(null)
      const { data, count } = await adminService.fetchAllDiscounts(page, limit, searchTerm)
      setDiscounts(data)
      setDiscountsTotal(count || 0)
    } catch (err) {
      console.error(err)
      setError('Não foi possível carregar regras.')
    } finally {
      setLoadingDiscounts(false)
    }
  }, [])

  const fetchMetrics = useCallback(async () => {
    try {
      setLoadingMetrics(true)
      setError(null)
      const data = await adminService.fetchAdminMetrics()
      setMetrics(data)
    } catch (err) {
      console.error(err)
      setError('Não foi possível carregar métricas.')
    } finally {
      setLoadingMetrics(false)
    }
  }, [])

  const updateCustomerRole = async (customerId: string, newRole: string) => {
    await adminService.updateCustomerRole(customerId, newRole)
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, role: newRole } : c)))
  }

  const deleteDiscount = async (discountId: string) => {
    await adminService.deleteDiscountRule(discountId)
    setDiscounts((prev) => prev.filter((d) => d.id !== discountId))
  }

  const duplicateDiscount = async (discountId: string) => {
    await adminService.duplicateDiscountRule(discountId)
    await fetchDiscounts()
  }

  return {
    customers,
    customersTotal,
    discounts,
    discountsTotal,
    metrics,
    loadingCustomers,
    loadingDiscounts,
    loadingMetrics,
    error,
    fetchCustomers,
    fetchDiscounts,
    fetchMetrics,
    updateCustomerRole,
    deleteDiscount,
    duplicateDiscount,
    setError,
  }
}
