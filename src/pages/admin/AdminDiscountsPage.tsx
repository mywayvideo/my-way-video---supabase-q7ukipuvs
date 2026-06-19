import { useState } from 'react'
import { useDiscountRules } from '@/hooks/useDiscountRules'
import { Discount } from '@/types/discount'
import DiscountRuleForm from './components/DiscountRuleForm'
import DiscountRulesList from './components/DiscountRulesList'
import { Button } from '@/components/ui/button'
import { Plus, AlertCircle, RefreshCw, Tag } from 'lucide-react'
import { AdminLayout } from '@/components/admin/AdminLayout'

export default function AdminDiscountsPage() {
  const {
    discounts,
    products,
    loading,
    error,
    loadData,
    createDiscount,
    updateDiscount,
    deleteDiscount,
  } = useDiscountRules()
  const [editingRule, setEditingRule] = useState<Discount | 'new' | null>(null)

  return (
    <AdminLayout breadcrumb="Regras de Desconto">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-secondary/50 rounded-lg">
              <Tag className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Regras de Desconto</h1>
              <p className="text-sm text-muted-foreground">
                Gerencie as regras de descontos e promoções do catálogo.
              </p>
            </div>
          </div>
          {!editingRule && (
            <Button
              onClick={() => setEditingRule('new')}
              className="bg-yellow-500 text-black hover:bg-yellow-600 font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" /> Criar Nova Regra
            </Button>
          )}
        </div>

        {error && !editingRule && (
          <div className="text-center py-12 px-6 border rounded-lg bg-card shadow-sm">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">Não foi possível carregar as regras</h3>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button onClick={loadData} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" /> Tentar Novamente
            </Button>
          </div>
        )}

        {!error && !editingRule && (
          <DiscountRulesList
            loading={loading}
            discounts={discounts}
            onEdit={(rule) => setEditingRule(rule)}
            onDelete={deleteDiscount}
            onCreateNew={() => setEditingRule('new')}
          />
        )}

        {editingRule && (
          <DiscountRuleForm
            rule={typeof editingRule === 'string' ? undefined : editingRule}
            products={products}
            onClose={() => setEditingRule(null)}
            onSave={async (payload) => {
              const success =
                typeof editingRule === 'string'
                  ? await createDiscount(payload)
                  : await updateDiscount(editingRule.id, payload)
              if (success) {
                setEditingRule(null)
                return true
              }
              return false
            }}
          />
        )}
      </div>
    </AdminLayout>
  )
}
