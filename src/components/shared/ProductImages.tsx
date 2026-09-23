import { useMemo } from 'react'
import { normalizeProductName } from '@/utils/productImageProcessor'
import { ImageWithFallback } from '@/components/ImageWithFallback'

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
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-full aspect-square rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800/60 p-2 relative flex items-center justify-center">
        <ImageWithFallback
          src={product.image_url}
          alt={product.name || ''}
          productId={product.id}
          className="w-full h-full object-contain"
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
