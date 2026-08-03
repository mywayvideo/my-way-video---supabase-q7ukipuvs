import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { Search, Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { calculateTotalUSDFromValues } from '@/utils/pricing-engine'
import type { PriceSettingsData } from '@/utils/pricing-engine'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

type TargetType = 'all' | 'manufacturer' | 'category' | 'manufacturer_category' | 'specific'

function getEffectivePrice(p: any): number {
  const priceUsd = Number(p.price_usd) || 0
  const rebate = Number(p.price_usa_rebate) || 0
  if (rebate > 0 && (!p.date_rebate || new Date(p.date_rebate) >= new Date())) return rebate
  return priceUsd
}

export function BatchPriceBrlModal({ isOpen, onClose, onSuccess }: Props) {
  const [targetType, setTargetType] = useState<TargetType>('all')
  const [manufacturers, setManufacturers] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [priceSettings, setPriceSettings] = useState<PriceSettingsData | null>(null)
  const [selectedMfrs, setSelectedMfrs] = useState<string[]>([])
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [selectedProds, setSelectedProds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [isRecalculating, setIsRecalculating] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setIsLoading(true)
    Promise.all([
      supabase.from('manufacturers').select('id, name').order('name'),
      supabase.from('categories').select('id, name').order('name'),
      supabase
        .from('products')
        .select(
          'id, name, sku, price_usd, price_brl, weight, manufacturer_id, category_id, category, price_usa_rebate, date_rebate',
        )
        .order('name'),
      supabase
        .from('price_settings')
        .select('markup, freight_per_kg_usd, weight_margin, exchange_rate, exchange_spread')
        .limit(1)
        .maybeSingle(),
    ]).then(([mRes, cRes, pRes, psRes]) => {
      if (mRes.data) setManufacturers(mRes.data)
      if (cRes.data) setCategories(cRes.data)
      if (pRes.data) setProducts(pRes.data)
      if (psRes.data)
        setPriceSettings({
          markup: Number(psRes.data.markup) || 0,
          freight_per_kg_usd: Number(psRes.data.freight_per_kg_usd) || 0,
          weight_margin: Number(psRes.data.weight_margin) || 0,
          exchange_rate: Number(psRes.data.exchange_rate) || 0,
          exchange_spread: Number(psRes.data.exchange_spread) || 0,
        })
      setIsLoading(false)
    })
  }, [isOpen])

  const availableProducts = useMemo(() => {
    const matchCat = (p: any) =>
      selectedCats.includes(p.category_id) ||
      selectedCats.some((cId) => categories.find((c) => c.id === cId)?.name === p.category)
    if (targetType === 'all') return products
    if (targetType === 'manufacturer')
      return products.filter((p) => selectedMfrs.includes(p.manufacturer_id))
    if (targetType === 'category') return products.filter(matchCat)
    if (targetType === 'manufacturer_category')
      return products.filter((p) => selectedMfrs.includes(p.manufacturer_id) && matchCat(p))
    if (targetType === 'specific') return products.filter((p) => selectedProds.includes(p.id))
    return []
  }, [products, targetType, selectedMfrs, selectedCats, selectedProds, categories])

  const searchResults = useMemo(() => {
    if (!search) return products
    const s = search.toLowerCase()
    return products.filter(
      (p) => p.name?.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s),
    )
  }, [products, search])

  const previewData = useMemo(() => {
    if (!priceSettings) return []
    return availableProducts.map((p) => {
      const effectivePrice = getEffectivePrice(p)
      const newBrl = calculateTotalUSDFromValues(
        effectivePrice,
        Number(p.weight) || 0,
        priceSettings,
      )
      return { ...p, new_price_brl: newBrl > 0 ? newBrl : null }
    })
  }, [availableProducts, priceSettings])

  const canConfirm = useMemo(() => {
    if (isLoading || isRecalculating || !priceSettings) return false
    if (targetType === 'manufacturer') return selectedMfrs.length > 0
    if (targetType === 'category') return selectedCats.length > 0
    if (targetType === 'manufacturer_category')
      return selectedMfrs.length > 0 && selectedCats.length > 0
    if (targetType === 'specific') return selectedProds.length > 0
    return true
  }, [
    targetType,
    selectedMfrs,
    selectedCats,
    selectedProds,
    isLoading,
    isRecalculating,
    priceSettings,
  ])

  const handleConfirm = async () => {
    setIsRecalculating(true)
    try {
      const params: Record<string, any> = {
        p_all: targetType === 'all',
        p_product_ids: targetType === 'specific' ? selectedProds : null,
        p_manufacturer_ids: ['manufacturer', 'manufacturer_category'].includes(targetType)
          ? selectedMfrs
          : null,
        p_category_ids: ['category', 'manufacturer_category'].includes(targetType)
          ? selectedCats
          : null,
      }
      const { data, error } = await supabase.rpc('batch_recalculate_price_brl', params)
      if (error) throw error
      toast({
        title: 'Sucesso',
        description: `${data} produtos tiveram o price_brl recalculado.`,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao recalcular preços.',
        variant: 'destructive',
      })
    } finally {
      setIsRecalculating(false)
    }
  }

  const fmt = (v: number | null | undefined) =>
    v != null && !isNaN(Number(v))
      ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '—'

  const toggle = (
    list: string[],
    setList: (fn: (prev: string[]) => string[]) => void,
    id: string,
    checked: boolean,
  ) => setList((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl bg-card border-border/50 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recalcular Preço BRL</DialogTitle>
          <DialogDescription>
            Selecione os produtos para recalcular o price_brl com base nos parâmetros atuais.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-base font-semibold">Alvo do Recálculo</Label>
              <RadioGroup
                value={targetType}
                onValueChange={(v) => setTargetType(v as TargetType)}
                className="flex flex-col space-y-2 sm:flex-row sm:flex-wrap sm:space-y-0 sm:gap-x-6"
              >
                {[
                  ['all', 'Todo o Site'],
                  ['manufacturer', 'Por Fabricante'],
                  ['category', 'Por Categoria'],
                  ['manufacturer_category', 'Fabricante + Categoria'],
                  ['specific', 'Produtos Específicos'],
                ].map(([val, label]) => (
                  <div key={val} className="flex items-center space-x-2">
                    <RadioGroupItem value={val} id={`rbrl-${val}`} />
                    <Label htmlFor={`rbrl-${val}`} className="cursor-pointer font-medium">
                      {label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {(targetType === 'manufacturer' || targetType === 'manufacturer_category') && (
              <div className="border rounded-md p-4 bg-muted/10 space-y-2">
                <Label className="text-sm font-semibold">
                  Fabricantes <span className="text-muted-foreground">({selectedMfrs.length})</span>
                </Label>
                <div className="h-[160px] overflow-y-auto border rounded-md bg-background p-2 space-y-1">
                  {manufacturers.map((m) => (
                    <label
                      key={m.id}
                      className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded-md cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedMfrs.includes(m.id)}
                        onCheckedChange={(c) => toggle(selectedMfrs, setSelectedMfrs, m.id, !!c)}
                      />
                      <span className="text-sm">{m.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {(targetType === 'category' || targetType === 'manufacturer_category') && (
              <div className="border rounded-md p-4 bg-muted/10 space-y-2">
                <Label className="text-sm font-semibold">
                  Categorias <span className="text-muted-foreground">({selectedCats.length})</span>
                </Label>
                <div className="h-[160px] overflow-y-auto border rounded-md bg-background p-2 space-y-1">
                  {categories.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded-md cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedCats.includes(c.id)}
                        onCheckedChange={(ch) => toggle(selectedCats, setSelectedCats, c.id, !!ch)}
                      />
                      <span className="text-sm">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {targetType === 'specific' && (
              <div className="border rounded-md p-4 bg-muted/10 space-y-2">
                <Label className="text-sm font-semibold">
                  Produtos <span className="text-muted-foreground">({selectedProds.length})</span>
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produto..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <div className="h-[200px] overflow-y-auto border rounded-md bg-background p-2 space-y-1">
                  {searchResults.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded-md cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedProds.includes(p.id)}
                        onCheckedChange={(c) => toggle(selectedProds, setSelectedProds, p.id, !!c)}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground">SKU: {p.sku || 'N/A'}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {previewData.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <div className="p-3 bg-muted/20 border-b">
                  <span className="text-sm font-semibold">
                    Pré-visualização ({previewData.length} produtos)
                  </span>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Price USD</TableHead>
                        <TableHead className="text-right">Price BRL (Atual)</TableHead>
                        <TableHead className="text-right">Price BRL (Novo)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium max-w-[200px] truncate" title={p.name}>
                            {p.name}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{p.sku || '—'}</TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(Number(p.price_usd))}
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {fmt(Number(p.price_brl))}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium text-primary">
                            {p.new_price_brl != null ? fmt(p.new_price_brl) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isRecalculating}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isRecalculating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Recalculando...
              </>
            ) : (
              'Confirmar Recálculo'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
