import { Link } from 'react-router-dom'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ShoppingCart, Heart, MessageCircle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSearchState } from '@/hooks/useSearchState'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import { useFavorites } from '@/hooks/useFavorites'
import { useState } from 'react'
import { QuantityModal } from '@/components/QuantityModal'
import { usePricing } from '@/hooks/use-pricing'
import { useProductDiscount } from '@/hooks/useProductDiscount'
import { calculateFinalPrice } from '@/utils/pricing'

export function ProductCard({
  product,
  isFavoritesPage,
  onRemove,
}: {
  product: any
  isFavoritesPage?: boolean
  onRemove?: (id: string) => void
}) {
  const [showQtyModal, setShowQtyModal] = useState(false)
  const { isSearchActive, searchQuery } = useSearchState()
  const { isFavorite, addFavorite, removeFavorite } = useFavorites()
  const [favLoading, setFavLoading] = useState(false)

  const { secondaryPrice, isLoading: pricingLoading } = usePricing(product)
  const productDiscount = useProductDiscount(product)

  const originalPrice = product.originalPrice ?? productDiscount.originalPrice
  const discountedPrice = product.discountedPrice ?? productDiscount.discountedPrice
  const originalPriceNat = product.originalPriceNat ?? productDiscount.originalPriceNat
  const discountedPriceNat = product.discountedPriceNat ?? productDiscount.discountedPriceNat
  const discountPercentage = product.discountPercentage ?? productDiscount.discountPercentage
  const isRebateActive = product.isRebateActive ?? productDiscount.isRebateActive

  const triggerFavoriteEffects = (e: React.MouseEvent) => {
    try {
      const audio = new Audio('/sounds/coin-drop.mp3')
      audio.volume = 0.5
      audio.play().catch(() => {})
    } catch {
      /* intentionally ignored */
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2

    for (let i = 0; i < 10; i++) {
      const particle = document.createElement('div')
      particle.innerHTML = '❤️'
      particle.style.position = 'fixed'
      particle.style.left = `${x}px`
      particle.style.top = `${y}px`
      particle.style.color = '#ef4444' // red-500
      particle.style.fontSize = '12px'
      particle.style.pointerEvents = 'none'
      particle.style.zIndex = '9999'
      particle.style.transition = 'all 0.6s ease-out'

      const angle = Math.random() * Math.PI * 2
      const velocity = 30 + Math.random() * 40
      const tx = Math.cos(angle) * velocity
      const ty = Math.sin(angle) * velocity - 20

      document.body.appendChild(particle)

      requestAnimationFrame(() => {
        particle.style.transform = `translate(${tx}px, ${ty}px) scale(${0.5 + Math.random()})`
        particle.style.opacity = '0'
      })

      setTimeout(() => particle.remove(), 600)
    }
  }

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const currentlyFavorite = isFavorite(product.id)

    if (!currentlyFavorite) {
      triggerFavoriteEffects(e)
    }

    setFavLoading(true)
    try {
      if (currentlyFavorite) {
        await removeFavorite(product.id)
      } else {
        await addFavorite(product.id)
      }
    } finally {
      setFavLoading(false)
    }
  }

  const searchSuffix =
    isSearchActive && searchQuery ? `?from=search&q=${encodeURIComponent(searchQuery)}` : ''
  const linkTo = `/product/${product.id}${searchSuffix}`

  const handleLinkClick = () => {
    if (isSearchActive) {
      sessionStorage.setItem('search-scroll-position', window.scrollY.toString())
    }
  }

  const formatCurrency = (val: number, currency: string) => {
    return val
      .toLocaleString('pt-BR', {
        style: 'currency',
        currency: currency === 'USD' ? 'USD' : 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      .replace('US$', 'US$ ')
      .replace('R$', 'R$ ')
  }

  const isNationalized = Number(product.price_nationalized_sales) > 0
  const weight = Number(product.weight) || 0
  const hasUsaPrice = calculateFinalPrice(product) > 0
  const hasAnyPrice = isNationalized || hasUsaPrice

  const estimatedBrlPrice =
    !isNationalized && hasUsaPrice && weight > 0 ? secondaryPrice?.value : null

  let mainPriceVal: number | null = null
  let mainOriginalVal: number | null = null
  let mainLabel = ''
  let mainCurrency = 'USD'

  let secPriceVal: number | null = null
  let secLabel = ''
  let secCurrency = 'USD'

  if (isNationalized) {
    mainPriceVal = discountedPriceNat ?? originalPriceNat
    mainOriginalVal = originalPriceNat
    mainLabel = '(Brasil)'
    mainCurrency = product.price_nationalized_currency || 'BRL'

    if (hasUsaPrice) {
      secPriceVal = discountedPrice ?? originalPrice
      secLabel = '(USA)'
      secCurrency = 'USD'
    }
  } else if (hasUsaPrice) {
    mainPriceVal = discountedPrice ?? originalPrice
    mainOriginalVal = originalPrice
    mainLabel = '(USA)'
    mainCurrency = 'USD'

    if (estimatedBrlPrice) {
      secPriceVal = estimatedBrlPrice
      secLabel = '(Brasil)'
      secCurrency = 'BRL'
    }
  }

  const showSavings =
    mainOriginalVal !== null && mainPriceVal !== null && mainOriginalVal > mainPriceVal
  const savingsValue = showSavings ? mainOriginalVal! - mainPriceVal! : 0

  return (
    <Card className="flex flex-col h-full overflow-hidden group bg-card border-transparent transition-all duration-300 relative shadow-sm hover:shadow-xl hover:-translate-y-1 rounded-xl">
      <CardHeader className="p-0 relative bg-white dark:bg-zinc-950">
        <div className="absolute top-3 left-2 z-10 flex flex-col gap-2 items-start pointer-events-none">
          {product.is_discontinued && (
            <div className="bg-destructive text-destructive-foreground px-2 py-1 text-[10px] font-bold uppercase rounded-md shadow-sm tracking-wider flex items-center h-6">
              Descontinuado
            </div>
          )}
          {isRebateActive && (
            <div className="bg-green-600 text-white px-2 py-1 text-[10px] font-bold uppercase rounded-md shadow-sm tracking-wider flex items-center h-6">
              Rebate
            </div>
          )}
          {discountPercentage > 0 && !isRebateActive && (
            <div className="bg-green-600 text-white px-2 py-1 text-[10px] font-bold uppercase rounded-md shadow-sm tracking-wider flex items-center h-6">
              {discountPercentage.toFixed(0)}% OFF
            </div>
          )}
        </div>
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-2 items-end">
          {isFavoritesPage && onRemove ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 px-3 rounded-full shadow-sm hover:bg-destructive/90 gap-1.5"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onRemove(product.id)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Remover</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full bg-white/80 dark:bg-black/80 backdrop-blur-sm shadow-sm hover:bg-white dark:hover:bg-black"
              onClick={handleToggleFavorite}
              disabled={favLoading}
            >
              <Heart
                className={cn(
                  'h-4 w-4 transition-colors',
                  isFavorite(product.id)
                    ? 'fill-red-500 text-red-500'
                    : 'text-gray-400 hover:text-red-400',
                )}
              />
            </Button>
          )}
        </div>
        <Link
          to={linkTo}
          onClick={handleLinkClick}
          className="w-full h-[220px] overflow-hidden flex items-center justify-center relative p-4"
        >
          <ImageWithFallback
            src={product.image_url}
            alt={product.name}
            productId={product.id}
            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
          />
        </Link>
      </CardHeader>

      <CardContent className="flex-1 p-4 flex flex-col gap-3">
        <Link to={linkTo} onClick={handleLinkClick} className="flex flex-col gap-1">
          {product.manufacturers?.name && (
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
              {product.manufacturers.name}
            </span>
          )}
          <h3 className="font-medium text-sm md:text-base line-clamp-2 text-foreground hover:text-primary transition-colors leading-tight">
            {product.name}
          </h3>
        </Link>

        <div className="flex flex-col items-start w-full min-h-[60px]">
          {!pricingLoading ? (
            hasAnyPrice ? (
              <div className="flex flex-col w-full gap-1">
                {/* Main Price */}
                {mainPriceVal !== null && (
                  <div className="flex flex-col">
                    {showSavings && mainOriginalVal !== null && (
                      <span className="text-xs line-through text-muted-foreground font-medium whitespace-nowrap">
                        {formatCurrency(mainOriginalVal, mainCurrency)}
                      </span>
                    )}
                    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                      <span className="text-lg font-bold text-green-500">
                        {formatCurrency(mainPriceVal, mainCurrency)}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {mainLabel}
                      </span>
                    </div>
                    {showSavings && (
                      <span className="text-[11px] font-medium text-green-600 dark:text-green-400 mt-0.5 whitespace-nowrap animate-pulse">
                        Economize {formatCurrency(savingsValue, mainCurrency)}
                      </span>
                    )}
                  </div>
                )}

                {/* Secondary Price */}
                {secPriceVal !== null && (
                  <div className="flex items-baseline gap-1.5 whitespace-nowrap mt-1 opacity-70">
                    <span className="text-xs font-semibold text-foreground">
                      {formatCurrency(secPriceVal, secCurrency)}
                    </span>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {secLabel}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-muted-foreground bg-muted/50 px-3 py-3 rounded-md w-full border border-border/50 h-[60px]">
                <MessageCircle className="w-5 h-5" />
                <span className="text-sm font-semibold uppercase tracking-wider">Sob Consulta</span>
              </div>
            )
          ) : (
            <div className="w-full space-y-2 mt-2">
              <div className="h-6 bg-muted animate-pulse rounded-md w-1/2"></div>
              <div className="h-4 bg-muted animate-pulse rounded-md w-1/3"></div>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0">
        {hasAnyPrice && !pricingLoading ? (
          <Button
            className="w-full gap-2 transition-all font-semibold rounded-lg bg-[#FF9F1A] hover:bg-[#FF9F1A]/90 text-[#111111]"
            onClick={() => setShowQtyModal(true)}
          >
            <ShoppingCart className="w-4 h-4" />
            Adicionar
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full gap-1.5 sm:gap-2 transition-all font-semibold rounded-lg bg-[#25D366] text-white hover:bg-[#1DA851] border-transparent hover:border-transparent hover:text-white px-2"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const msg = encodeURIComponent(
                `Olá, gostaria de uma cotação personalizada para o produto: ${product.name}`,
              )
              window.open(`https://wa.me/5561981815050?text=${msg}`, '_blank')
            }}
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span className="truncate text-[11px] sm:text-xs md:text-[13px]">
              Consultar Especialista
            </span>
          </Button>
        )}
      </CardFooter>
      {showQtyModal && <QuantityModal product={product} onClose={() => setShowQtyModal(false)} />}
    </Card>
  )
}
