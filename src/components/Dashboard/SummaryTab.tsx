import { Order, DiscountRuleCustomer } from '@/types/customer'
import { Card, CardContent } from '@/components/ui/card'
import { Package, DollarSign, Tag, TrendingDown, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export function SummaryTab({
  orders,
  discounts,
}: {
  orders: Order[]
  discounts: DiscountRuleCustomer[]
}) {
  const totalOrders = orders.length
  const totalSpent = orders.reduce((sum, o) => sum + (o.total || 0), 0)
  const totalDiscounts = orders.reduce((sum, o) => sum + (o.discount_amount || 0), 0)
  const saved = totalDiscounts // Assuming discount_amount maps to saved

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">Total de Pedidos</p>
              <Package className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-3xl font-bold">{totalOrders}</h3>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">Gasto Total</p>
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-3xl font-bold">
              $
              {totalSpent.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </h3>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">Descontos Aplicados</p>
              <Tag className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-3xl font-bold">
              $
              {totalDiscounts.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </h3>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">Economizado</p>
              <TrendingDown className="w-5 h-5 text-green-500" />
            </div>
            <h3 className="text-3xl font-bold text-green-500">
              $
              {saved.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </h3>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-xl font-bold mb-4">Descontos Disponíveis</h3>
        {discounts.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
            Nenhum desconto ativo no momento.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {discounts.map((d) => {
              const rule = d.discount_rules
              if (!rule) return null
              return (
                <Card key={d.id} className="bg-secondary/30 border-border">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-lg">{rule.rule_name}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Desconto:{' '}
                        <span className="font-medium text-foreground">{rule.discount_value}%</span>{' '}
                        ({rule.discount_calculation_type})
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 capitalize">
                        Escopo: {rule.scope_type.replace(/_/g, ' ')}
                      </p>
                    </div>
                    {rule.is_active && (
                      <Badge className="bg-green-500/10 text-green-600 border-green-500 hover:bg-green-500/20">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Ativo
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
