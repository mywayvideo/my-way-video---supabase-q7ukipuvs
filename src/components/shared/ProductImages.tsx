import { useMemo, useState } from 'react'
import { getProxiedImageUrl } from '@/lib/image-proxy'
import { normalizeProductName } from '@/utils/productImageProcessor'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface ProductImagesProps {
  products: any[]
  referencedInternalProducts: string[]
}

function normalizeRefs(refs: string[]): string[] {
  return refs
    .map((item: any) => (typeof item === 'object' && item !== null ? item.id : item))
    .filter(Boolean)
    .map(String)
}

function ProductImageItem({ product }: { product: any }) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-full aspect-square rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800/60 p-2 relative">
        {!loaded && <Skeleton className="absolute inset-2 rounded-lg" />}
        <img
          src={getProxiedImageUrl(product.image_url) || product.image_url}
          alt={product.name || ''}
          referrerPolicy="no-referrer"
          className={cn(
            'w-full h-full object-contain transition-all duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={() => setLoaded(true)}
        />
      </div>
      {product.name && (
        <p className="text-xs text-zinc-400 text-center line-clamp-2 leading-tight">
          {product.name}
        </p>
      )}
    </div>
  )
}

export function ProductImages({ products, referencedInternalProducts }: ProductImagesProps) {
  const filteredProducts = useMemo(() => {
    const refs = normalizeRefs(referencedInternalProducts)
    if (!refs.length) return []
    const seenNames = new Set<string>()
    const seenUrls = new Set<string>()
    return products
      .filter((p) => p?.id && p?.image_url && refs.includes(String(p.id)))
      .filter((p) => {
        const nameKey = normalizeProductName(p.name || '').toLowerCase()
        const urlKey = p.image_url
        if (seenNames.has(nameKey) || seenUrls.has(urlKey)) return false
        seenNames.add(nameKey)
        seenUrls.add(urlKey)
        return true
      })
  }, [products, referencedInternalProducts])

  if (filteredProducts.length === 0) return null

  return (
    <div className="order-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-in-up">
      {filteredProducts.map((product) => (
        <ProductImageItem key={product.id} product={product} />
      ))}
    </div>
  )
}
