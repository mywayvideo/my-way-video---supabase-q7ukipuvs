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

    const firstItem = ids[0]
    const isObject = typeof firstItem === 'object' && firstItem !== null && 'id' in firstItem

    if (isObject) {
      const mixed = ids.some((item) => typeof item === 'string')
      if (mixed) {
        console.warn(
          'ReferencedProducts: Mixed types detected in ids array. Filtering valid items.',
        )
      }

      const validObjects = ids.filter(
        (item) =>
          typeof item === 'object' && item !== null && 'id' in item && item.id !== currentProductId,
      )
      setProducts(validObjects)
    } else {
      const mixed = ids.some((item) => typeof item === 'object')
      if (mixed) {
        console.warn(
          'ReferencedProducts: Mixed types detected in ids array. Filtering valid items.',
        )
      }

      const validStrings = ids.filter(
        (item) => typeof item === 'string' && item !== currentProductId,
      ) as string[]

      if (validStrings.length === 0) {
        setProducts([])
        return
      }

      supabase
        .from('products')
        .select(
          'id, name, price_usd, price_brl, price_nationalized_sales, price_nationalized_currency, image_url, category, description, sku, weight, is_discontinued, price_usa_rebate, date_rebate, manufacturer_id, manufacturer:manufacturers(name)',
        )
        .in('id', validStrings)
        .then(({ data }) => {
          if (isMounted && data) {
            const mapped = data.map((p: any) => ({
              ...p,
              manufacturer: p.manufacturer?.name || p.manufacturer,
            }))
            setProducts(mapped.filter((p) => p.id !== currentProductId))
          }
        })
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
