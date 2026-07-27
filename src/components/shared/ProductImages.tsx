import { useMemo } from 'react'

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

function getProxiedImageUrl(url: string): string {
  if (url.includes('wsrv.nl')) return url
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=400&h=400&fit=inside`
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
              src={getProxiedImageUrl(product.image_url)}
              alt={product.name || ''}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
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
