import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { X, Search, Loader2, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface ProductResult {
  id: string
  name: string
  sku: string | null
  image_url: string | null
  manufacturer_id: string | null
  manufacturer_name?: string | null
}

interface ProductSelectorProps {
  selectedProductIds: string[]
  onSelectionChange: (ids: string[]) => void
  selectedProducts?: ProductResult[]
  onSelectedProductsChange?: (products: ProductResult[]) => void
}

export function ProductSelector({
  selectedProductIds,
  onSelectionChange,
  selectedProducts = [],
  onSelectedProductsChange,
}: ProductSelectorProps) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ProductResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)

  const toggleProduct = useCallback(
    (product: ProductResult) => {
      if (selectedProductIds.includes(product.id)) {
        const newIds = selectedProductIds.filter((id) => id !== product.id)
        onSelectionChange(newIds)
        if (onSelectedProductsChange) {
          onSelectedProductsChange(selectedProducts.filter((p) => p.id !== product.id))
        }
      } else {
        onSelectionChange([...selectedProductIds, product.id])
        if (onSelectedProductsChange) {
          onSelectedProductsChange([...selectedProducts, product])
        }
      }
    },
    [selectedProductIds, onSelectionChange, selectedProducts, onSelectedProductsChange],
  )

  const removeProduct = useCallback(
    (id: string) => {
      onSelectionChange(selectedProductIds.filter((pid) => pid !== id))
      if (onSelectedProductsChange) {
        onSelectedProductsChange(selectedProducts.filter((p) => p.id !== id))
      }
    },
    [selectedProductIds, onSelectionChange, selectedProducts, onSelectedProductsChange],
  )

  useEffect(() => {
    const delay = setTimeout(async () => {
      if (!search.trim()) {
        setResults([])
        setShowResults(false)
        return
      }

      setIsSearching(true)
      setShowResults(true)
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, sku, image_url, manufacturer_id, manufacturers(name)')
          .ilike('name', `%${search.trim()}%`)
          .limit(20)

        if (error) throw error

        const mapped: ProductResult[] = (data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          image_url: p.image_url,
          manufacturer_id: p.manufacturer_id,
          manufacturer_name: p.manufacturers?.name ?? null,
        }))

        setResults(mapped)
      } catch (e) {
        console.error('Product search error:', e)
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(delay)
  }, [search])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar produtos por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-background"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {selectedProductIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedProducts.map((p) => (
            <Badge key={p.id} variant="secondary" className="flex items-center gap-1.5 pr-1.5 py-1">
              <Package className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs">{p.name}</span>
              <button
                onClick={() => removeProduct(p.id)}
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {showResults && search.trim() && (
        <div className="border rounded-md max-h-[240px] overflow-y-auto bg-background">
          {results.length === 0 && !isSearching ? (
            <div className="p-3 text-sm text-muted-foreground text-center">
              Nenhum produto encontrado.
            </div>
          ) : (
            results.map((p) => (
              <label
                key={p.id}
                className={cn(
                  'flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/40 transition-colors border-b last:border-b-0',
                  selectedProductIds.includes(p.id) && 'bg-primary/5',
                )}
              >
                <Checkbox
                  checked={selectedProductIds.includes(p.id)}
                  onCheckedChange={() => toggleProduct(p)}
                />
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="w-8 h-8 rounded object-cover border"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center border">
                    <Package className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.sku && `SKU: ${p.sku}`}
                    {p.sku && p.manufacturer_name && ' • '}
                    {p.manufacturer_name && p.manufacturer_name}
                  </p>
                </div>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  )
}
