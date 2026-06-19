import { useState, useEffect, useCallback } from 'react'
import { discountRuleService } from '@/services/discountRuleService'
import { useToast } from '@/hooks/use-toast'

export function useDiscountRule(ruleId?: string) {
  const [rule, setRule] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [manufacturers, setManufacturers] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])

  const { toast } = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [m, c, p, cust] = await Promise.all([
        discountRuleService.fetchManufacturers(),
        discountRuleService.fetchCategories(),
        discountRuleService.fetchProducts(),
        discountRuleService.fetchCustomers(),
      ])
      setManufacturers(m)
      setCategories(c)
      setProducts(p)
      setCustomers(cust)

      if (ruleId) {
        const r = await discountRuleService.fetchDiscountRule(ruleId)
        setRule(r)
      }
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [ruleId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const saveRule = async (data: any) => {
    try {
      await discountRuleService.saveDiscountRule(data)
      toast({
        title: 'Sucesso',
        description: data.id ? 'Regra atualizada com sucesso!' : 'Regra criada com sucesso!',
      })
      return true
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar regra de desconto.',
        variant: 'destructive',
      })
      return false
    }
  }

  const deleteRule = async (id: string) => {
    try {
      await discountRuleService.deleteDiscountRule(id)
      toast({
        title: 'Sucesso',
        description: 'Regra deletada com sucesso!',
      })
      return true
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro',
        description: 'Não foi possível deletar regra de desconto.',
        variant: 'destructive',
      })
      return false
    }
  }

  return {
    rule,
    loading,
    error,
    manufacturers,
    categories,
    products,
    customers,
    saveRule,
    deleteRule,
    retry: loadData,
  }
}
