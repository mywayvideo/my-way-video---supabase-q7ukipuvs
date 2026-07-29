import { useMemo } from 'react'
import { ProductCard } from '@/components/ProductCard'

export function ReferencedProducts({
  products,
  currentProductId,
}: {
  products: any[]
  currentProductId?: string
}) {
  const filteredProducts = useMemo(() => {
    if (!products || !Array.isArray(products)) return []
    return products.filter((p) => p && typeof p === 'object' && p.id && p.id !== currentProductId)
  }, [products, currentProductId])

  if (filteredProducts.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 not-prose mt-2 overflow-hidden">
      {filteredProducts.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  )
}
