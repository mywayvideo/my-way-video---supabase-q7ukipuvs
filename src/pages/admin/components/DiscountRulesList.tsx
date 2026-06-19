import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Discount } from '@/types/discount'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Edit, Trash, Tag, Plus } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface Props {
  loading: boolean
  discounts: Discount[]
  onEdit: (rule: Discount) => void
  onDelete: (id: string) => void
  onCreateNew: () => void
}

export default function DiscountRulesList({
  loading,
  discounts,
  onEdit,
  onDelete,
  onCreateNew,
}: Props) {
  const [productCounts, setProductCounts] = useState<Record<string, number | 'Calculando...'>>({})

  useEffect(() => {
    let isMounted = true

    const fetchCounts = async () => {
      const counts: Record<string, number | 'Calculando...'> = {}

      for (const rule of discounts) {
        counts[rule.id] = 'Calculando...'
      }
      if (isMounted) setProductCounts({ ...counts })

      for (const rule of discounts) {
        try {
          if (rule.target_type === 'specific') {
            counts[rule.id] = Array.isArray(rule.product_selection)
              ? rule.product_selection.length
              : 0
            continue
          }

          let query = supabase.from('products').select('id', { count: 'exact', head: true })

          if (rule.target_type === 'manufacturer') {
            const mIds =
              rule.manufacturer_ids || (rule.manufacturer_id ? [rule.manufacturer_id] : [])
            if (mIds.length > 0) query = query.in('manufacturer_id', mIds)
            else query = query.eq('id', '00000000-0000-0000-0000-000000000000')
          } else if (rule.target_type === 'category') {
            const cIds = rule.category_ids || (rule.category_id ? [rule.category_id] : [])
            if (cIds.length > 0) query = query.in('category_id', cIds)
            else query = query.eq('id', '00000000-0000-0000-0000-000000000000')
          } else if (rule.target_type === 'manufacturer_category') {
            const mIds =
              rule.manufacturer_ids || (rule.manufacturer_id ? [rule.manufacturer_id] : [])
            const cIds = rule.category_ids || (rule.category_id ? [rule.category_id] : [])
            if (mIds.length > 0 && cIds.length > 0) {
              query = query.in('manufacturer_id', mIds).in('category_id', cIds)
            } else {
              query = query.eq('id', '00000000-0000-0000-0000-000000000000')
            }
          }

          const excluded = rule.excluded_products || []
          if (excluded.length > 0) {
            query = query.not('id', 'in', `(${excluded.join(',')})`)
          }

          const { count, error } = await query
          if (error) throw error

          counts[rule.id] = count || 0
        } catch (err) {
          console.error('Error fetching count for rule', rule.id, err)
          counts[rule.id] = 0
        }
      }

      if (isMounted) setProductCounts(counts)
    }

    if (discounts.length > 0) {
      fetchCounts()
    } else {
      setProductCounts({})
    }

    return () => {
      isMounted = false
    }
  }, [discounts])

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
    )

  if (discounts.length === 0)
    return (
      <div className="text-center py-16 px-6 border rounded-lg bg-card shadow-sm">
        <Tag className="mx-auto h-16 w-16 text-muted-foreground mb-4 opacity-50" />
        <h3 className="text-lg font-semibold mb-2">Nenhuma regra de desconto criada</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Crie sua primeira regra de desconto para começar a oferecer preços especiais em seus
          produtos.
        </p>
        <Button
          onClick={onCreateNew}
          className="bg-yellow-500 text-black hover:bg-yellow-600 font-semibold shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" /> Criar Nova Regra
        </Button>
      </div>
    )

  return (
    <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="p-4 font-semibold whitespace-nowrap">Nome</th>
              <th className="p-4 font-semibold whitespace-nowrap">Tipo</th>
              <th className="p-4 font-semibold whitespace-nowrap">Valor</th>
              <th className="p-4 font-semibold whitespace-nowrap">Produtos</th>
              <th className="p-4 font-semibold whitespace-nowrap">Status</th>
              <th className="p-4 font-semibold whitespace-nowrap text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {discounts.map((discount) => (
              <tr key={discount.id} className="hover:bg-muted/30 transition-colors">
                <td className="p-4 font-medium">{discount.name}</td>
                <td className="p-4">
                  {discount.discount_type === 'margin_percentage' ? 'Margem %' : 'Price USA %'}
                </td>
                <td className="p-4">{discount.discount_value}%</td>
                <td className="p-4 text-muted-foreground">
                  {productCounts[discount.id] !== undefined
                    ? productCounts[discount.id]
                    : 'Calculando...'}{' '}
                  selecionados
                </td>
                <td className="p-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${discount.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'}`}
                  >
                    {discount.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(discount)}
                      className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Deletar regra de desconto?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja deletar a regra "{discount.name}"? Esta ação não
                            pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onDelete(discount.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Sim, deletar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
