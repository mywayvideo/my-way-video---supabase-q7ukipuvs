import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { ProductCard } from '@/components/ProductCard'

export function ReferencedProducts({
  ids,
  currentProductId,
}: {
  ids: Array<string | Record<string, any>>
  currentProductId?: string
}) {
  const [products, setProducts] = useState<any[]>([])

  useEffect(() => {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      setProducts([])
      return
    }

    let isMounted = true

    const extractedIds: string[] = []
    const validObjects: any[] = []

    ids.forEach((item) => {
      if (typeof item === 'string') {
        if (item !== currentProductId) extractedIds.push(item)
      } else if (typeof item === 'object' && item !== null && 'id' in item) {
        if (item.id !== currentProductId) validObjects.push(item)
      }
    })

    if (extractedIds.length === 0 && validObjects.length > 0) {
      setProducts(validObjects)
      return
    }

    if (extractedIds.length > 0) {
      supabase
        .from('products')
        .select(
          'id, name, price_usd, price_brl, price_nationalized_sales, price_nationalized_currency, image_url, category, description, sku, weight, is_discontinued, price_usa_rebate, date_rebate, manufacturer_id, manufacturer:manufacturers(name)',
        )
        .in('id', extractedIds)
        .then(({ data }) => {
          if (isMounted && data) {
            const mapped = data.map((p: any) => ({
              ...p,
              manufacturer: p.manufacturer?.name || p.manufacturer,
            }))

            const fetchedIds = new Set(mapped.map((m) => m.id))
            const additionalObjects = validObjects.filter((vo) => !fetchedIds.has(vo.id))

            setProducts([...mapped, ...additionalObjects].filter((p) => p.id !== currentProductId))
          }
        })
    } else {
      setProducts([])
    }

    return () => {
      isMounted = false
    }
  }, [ids, currentProductId])

  if (products.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 not-prose mt-2">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  )
}
