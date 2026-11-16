import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import { compatibilityService } from '@/services/compatibilityService'
import { formatPrice, formatPriceBRL } from '@/utils/priceFormatter'

/**
 * Seção pública "Acessórios compatíveis" da página do produto: acessórios
 * vinculados via product_compatibilities com status "aprovado" (ele como
 * produto principal). Não renderiza nada quando não há vínculo aprovado.
 */

type Acessorio = {
  id: string
  name: string
  slug: string | null
  image_url: string | null
  price_usd: number | null
  price_brl: number | null
}

export function CompatibleAccessoriesSection({ productId }: { productId: string }) {
  const [acessorios, setAcessorios] = useState<Acessorio[] | null>(null)

  useEffect(() => {
    let cancelado = false
    compatibilityService
      .fetchApprovedAccessories(productId)
      .then((lista) => {
        if (!cancelado) setAcessorios(lista)
      })
      .catch(() => {
        if (!cancelado) setAcessorios([])
      })
    return () => {
      cancelado = true
    }
  }, [productId])

  // null = ainda carregando (não renderiza nada para não "piscar" a seção)
  if (acessorios === null || acessorios.length === 0) return null

  return (
    <div className="mt-16 border-t border-border/50 pt-12">
      <h2 className="text-2xl font-bold mb-6">Acessórios compatíveis</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
        {acessorios.map((a) => (
          <Link
            key={a.id}
            to={`/product/${a.id}`}
            className="flex flex-col rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden hover:border-primary/50 transition-colors"
          >
            <div className="w-full aspect-square bg-white/5 flex items-center justify-center p-4">
              <ImageWithFallback
                src={a.image_url}
                alt={a.name}
                productId={a.id}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="p-4 space-y-1">
              <div className="text-sm font-medium line-clamp-2 break-words">{a.name}</div>
              {a.price_usd != null && !formatPrice(a.price_usd).isPlaceholder ? (
                <div className="text-lg font-bold text-green-500">
                  {formatPrice(a.price_usd).text}
                </div>
              ) : a.price_brl != null && !formatPriceBRL(a.price_brl).isPlaceholder ? (
                <div className="text-lg font-bold text-green-500">
                  {formatPriceBRL(a.price_brl).text}
                </div>
              ) : (
                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Sob consulta
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
