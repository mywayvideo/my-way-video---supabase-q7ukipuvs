import { useMemo } from 'react'
import { getProxiedImageUrl } from '@/lib/image-proxy'

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

export function ProductImages({ products, referencedInternalProducts }: ProductImagesProps) {
  const filteredProducts = useMemo(() => {
    const refs = normalizeRefs(referencedInternalProducts)
    if (!refs.length) return []
    return products.filter((p) => p?.id && p?.image_url && refs.includes(String(p.id)))
  }, [products, referencedInternalProducts])

  if (filteredProducts.length === 0) return null

  return (
    <div className="order-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-in-up">
      {filteredProducts.map((product) => (
        <div key={product.id} className="flex flex-col items-center gap-2">
          <div className="w-full aspect-square rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800/60 p-2">
            <img
              src={getProxiedImageUrl(product.image_url) ?? undefined}
              alt={product.name || ''}
              crossOrigin="anonymous"
              className="w-full h-full object-contain"
              onError={(e) => {
                ;(e.target as HTMLImageElement).src =
                  'https://img.usecurling.com/p/400/400?q=professional%20camera&color=gray'
              }}
            />
          </div>
          {product.name && (
            <p className="text-xs text-zinc-400 text-center line-clamp-2 leading-tight">
              {product.name}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
