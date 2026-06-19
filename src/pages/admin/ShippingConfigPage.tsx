import { useShippingConfig } from '@/hooks/useShippingConfig'
import { WarehouseSection } from '@/components/admin/shipping/WarehouseSection'
import { MiamiRangesSection } from '@/components/admin/shipping/MiamiRangesSection'
import { SaoPauloFormulaSection } from '@/components/admin/shipping/SaoPauloFormulaSection'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Truck } from 'lucide-react'

export default function ShippingConfigPage() {
  const {
    warehouse,
    setWarehouse,
    miamiRanges,
    setMiamiRanges,
    spFormula,
    setSpFormula,
    isLoading,
    saveSetting,
  } = useShippingConfig()

  if (isLoading) {
    return (
      <AdminLayout breadcrumb="Fretes & Shipping">
        <div className="p-6 space-y-6 max-w-5xl mx-auto w-full">
          <Skeleton className="h-10 w-[300px]" />
          <Skeleton className="h-[300px] w-full" />
          <Skeleton className="h-[300px] w-full" />
          <Skeleton className="h-[300px] w-full" />
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout breadcrumb="Fretes & Shipping">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-secondary/50 rounded-lg">
            <Truck className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Configuração de Frete</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie as regras e valores de frete para diferentes regiões.
            </p>
          </div>
        </div>

        <WarehouseSection
          warehouse={warehouse}
          setWarehouse={setWarehouse}
          onSave={(val) => saveSetting('warehouse_location', val)}
        />
        <MiamiRangesSection
          ranges={miamiRanges}
          setRanges={setMiamiRanges}
          onSave={(val) => saveSetting('shipping_miami_ranges', val)}
        />

        <div className="space-y-6">
          <SaoPauloFormulaSection />

          <Card className="bg-zinc-950 text-white border-zinc-800 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="font-bold text-xl flex items-center gap-2">
                Exemplo de cálculo:
              </CardTitle>
              <p className="text-zinc-400">Produto US$ 199 com peso de 0.88 lb</p>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-300 font-mono">
              <p className="flex justify-between border-b border-zinc-800/50 pb-2">
                <span>Converter peso para kg:</span>
                <span className="text-white">0.88 / 2.204 = 0,399 kg</span>
              </p>
              <p className="flex justify-between border-b border-zinc-800/50 pb-2">
                <span>Peso considerado (kg + adicional):</span>
                <span className="text-white">0,399 + 0,5 = 0,899 kg</span>
              </p>
              <p className="flex justify-between border-b border-zinc-800/50 pb-2">
                <span>Calcular frete por peso:</span>
                <span className="text-white">0,899 kg * 120 USD = US$ 107,88</span>
              </p>
              <p className="flex justify-between border-b border-zinc-800/50 pb-2">
                <span>Calcular taxa percentual (10%):</span>
                <span className="text-white">199 * 10% = US$ 19,90</span>
              </p>
              <p className="flex justify-between border-b border-zinc-800/50 pb-2">
                <span>Somar Produto + Frete + Taxa:</span>
                <span className="text-white">199 + 107,88 + 19,90 = US$ 326,78</span>
              </p>

              <div className="mt-4 pt-4 bg-zinc-900/50 p-4 rounded-lg border border-zinc-800/50">
                <p className="text-xs text-zinc-400 mb-1">Câmbio + Spread (ex: 5,4655)</p>
                <p className="font-bold text-lg text-green-400">
                  Preço BRL final: 326,78 * 5,4655 = R$ 1.786,01
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  )
}
