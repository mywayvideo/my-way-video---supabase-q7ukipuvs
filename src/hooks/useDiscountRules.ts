import { useState, useEffect, useCallback } from 'react'
import { discountService } from '@/services/discountService'
import { useToast } from '@/hooks/use-toast'
import { Discount } from '@/types/discount'

export function useDiscountRules() {
  const [discounts, setDiscounts] = useState<Discount[]>([])
  const [products, setProducts] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [fetchedDiscounts, fetchedProducts] = await Promise.all([
        discountService.getDiscounts(),
        discountService.getProductsForSelection(),
      ])
      setDiscounts(fetchedDiscounts)
      setProducts(fetchedProducts)
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar regras de desconto')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const createDiscount = async (data: any) => {
    try {
      await discountService.createDiscount(data)
      toast({
        title: 'Sucesso',
        description: 'Regra salva com sucesso!',
      })
      await loadData()
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

  const updateDiscount = async (id: string, data: any) => {
    try {
      await discountService.updateDiscount(id, data)
      toast({
        title: 'Sucesso',
        description: 'Regra salva com sucesso!',
      })
      await loadData()
      return true
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar regra de desconto.',
        variant: 'destructive',
      })
      return false
    }
  }

  const deleteDiscount = async (id: string) => {
    try {
      await discountService.deleteDiscount(id)
      toast({
        title: 'Sucesso',
        description: 'Regra deletada com sucesso!',
      })
      await loadData()
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
    discounts,
    products,
    loading,
    error,
    loadData,
    createDiscount,
    updateDiscount,
    deleteDiscount,
  }
}
