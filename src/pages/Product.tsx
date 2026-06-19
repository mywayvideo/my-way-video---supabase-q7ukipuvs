import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'
import { Product as ProductType } from '@/types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCart } from '@/hooks/useCart'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { TechnicalInfoModal } from '@/components/TechnicalInfoModal'
import MarkdownWithTables from '@/components/MarkdownWithTables'
import {
  ShoppingCart,
  Globe,
  Loader2,
  Sparkles,
  MessageCircle,
  Calculator,
  ChevronRight,
  Info,
  HelpCircle,
  ChevronLeft,
  Heart,
} from 'lucide-react'
import { formatPrice } from '@/utils/priceFormatter'
import { SEO } from '@/components/SEO'
import { AIConsultantModal } from '@/components/AIConsultantModal'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import { ProductPrice } from '@/components/ProductPrice'
import { useProductDiscount } from '@/hooks/useProductDiscount'
import { useAppSettingsRealtime } from '@/hooks/useAppSettingsRealtime'
import { useFavorites } from '@/hooks/useFavorites'
import { useHeartAnimation } from '@/hooks/useHeartAnimation'
import { useAuthState } from '@/hooks/useAuthState'
import { ProductCard } from '@/components/ProductCard'

const formatNCM = (ncm?: string | number | null) => {
  if (ncm === null || ncm === undefined) return ''
  const str = String(ncm).trim()
  if (!str) return ''

  const digits = str.replace(/\D/g, '')
  if (!digits) return str

  const p1 = digits.slice(0, 4)
  const p2 = digits.slice(4, 6)
  const p3 = digits.slice(6, 8)

  let formatted = p1
  if (p2) formatted += '.' + p2
  if (p3) formatted += '.' + p3

  return formatted
}

function normalizeSpecs(specs: any) {
  if (Array.isArray(specs)) {
    return specs
      .map((s) =>
        String(s)
          .replace(/[*_~`]+/g, '')
          .trim(),
      )
      .join('; ')
  }
  return String(specs || '')
    .replace(/[*_~`]+/g, '')
    .trim()
}

const CountdownTimer = ({ targetDate }: { targetDate: string }) => {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number } | null>(
    null,
  )

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = new Date(targetDate).getTime() - new Date().getTime()
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
        })
      } else {
        setTimeLeft(null)
      }
    }

    calculateTimeLeft()
    const timer = setInterval(calculateTimeLeft, 60000)
    return () => clearInterval(timer)
  }, [targetDate])

  if (!timeLeft) return <span className="font-mono font-bold">Encerrado</span>

  return (
    <span className="font-mono font-bold text-sm mt-1">
      {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m
    </span>
  )
}

export default function Product() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { addToCart } = useCart()
  const [product, setProduct] = useState<(ProductType & { technical_info?: string | null }) | null>(
    null,
  )

  // Chat State
  const [isAiChatOpen, setIsAiChatOpen] = useState(false)

  const [isMetric, setIsMetric] = useState(false)
  const [isTechnicalInfoOpen, setIsTechnicalInfoOpen] = useState(false)

  // Admin & Settings State
  const [isAdmin, setIsAdmin] = useState(false)
  const [showPriceCost, setShowPriceCost] = useState(false)

  // Related Products State
  const [relatedProducts, setRelatedProducts] = useState<any[]>([])
  const [isLoadingRelated, setIsLoadingRelated] = useState(false)
  const [hasFetchedRelated, setHasFetchedRelated] = useState(false)

  // BRL Pricing Modal State
  const [isBrlModalOpen, setIsBrlModalOpen] = useState(false)

  const { favorites, addFavorite, removeFavorite } = useFavorites()
  const [favLoading, setFavLoading] = useState(false)

  // Use state or derived state for isFavorite so it reacts to changes
  const isProductFavorite = product ? favorites.includes(product.id) : false
  const { isAnimating, triggerAnimation } = useHeartAnimation()
  const { user: authUser, isLoading: isAuthLoading } = useAuthState()

  const { originalPrice, discountedPrice, discountPercentage, ruleName, isRebateActive } =
    useProductDiscount(product)

  const effectiveDiscountPercentage = discountPercentage || 0

  const {
    pricePerKg,
    percentageValue,
    additionalWeightKg,
    isLoading,
    error: settingsError,
  } = useAppSettingsRealtime()

  useEffect(() => {
    console.log('App settings updated:', { pricePerKg, percentageValue, additionalWeightKg })
  }, [pricePerKg, percentageValue, additionalWeightKg])

  const [exchangeRate, setExchangeRate] = useState<number>(0)

  useEffect(() => {
    const fetchExchange = async () => {
      const { data } = await supabase
        .from('price_settings')
        .select('exchange_rate, exchange_spread')
        .limit(1)
        .maybeSingle()
      if (data) {
        setExchangeRate((data.exchange_rate || 0) + (data.exchange_spread || 0))
      }
    }
    fetchExchange()
  }, [])

  const hasNationalizedPrice = (product?.price_nationalized_sales || 0) > 0
  const hasUsaPrice = product
    ? (product.price_usd || 0) > 0 || (product.price_usa_rebate || 0) > 0
    : false
  const hasPrice = hasNationalizedPrice || hasUsaPrice

  const calculatePriceBRL = useCallback(
    (priceUsd: number, weightLb: number) => {
      if (!priceUsd || exchangeRate === 0) return null

      if (!weightLb || weightLb <= 0) return null

      const weight_kg = weightLb / 2.204
      const total_weight_kg = weight_kg + additionalWeightKg
      const freight_usd = total_weight_kg * pricePerKg
      const percentage_charge = (priceUsd * percentageValue) / 100
      const total_usd = priceUsd + freight_usd + percentage_charge

      const total_brl = total_usd * exchangeRate
      const freight_brl = freight_usd * exchangeRate
      const product_brl = priceUsd * exchangeRate

      return { total_brl, freight_brl, product_brl }
    },
    [pricePerKg, additionalWeightKg, percentageValue, exchangeRate],
  )

  const priceBrlResult = useMemo(() => {
    if (!product) return null

    const hasNat = (product.price_nationalized_sales || 0) > 0

    if (hasNat) {
      let natOriginal =
        product.price_nationalized_currency === 'USD'
          ? product.price_nationalized_sales! * exchangeRate
          : product.price_nationalized_sales!

      let natFinal = natOriginal
      if (discountPercentage > 0) {
        natFinal = natOriginal * (1 - discountPercentage / 100)
      }

      return {
        total_brl: natFinal,
        original_brl: natOriginal,
        savings_brl: natOriginal - natFinal,
      }
    }

    const usdOrig = originalPrice && originalPrice > 0 ? originalPrice : product.price_usd || 0
    const usdFinal = discountedPrice && discountedPrice > 0 ? discountedPrice : usdOrig

    const origCalc = calculatePriceBRL(usdOrig, product.weight || 0)
    const finalCalc = calculatePriceBRL(usdFinal, product.weight || 0)

    if (!finalCalc) return null

    return {
      total_brl: finalCalc.total_brl,
      original_brl: origCalc?.total_brl || finalCalc.total_brl,
      savings_brl: (origCalc?.total_brl || 0) - finalCalc.total_brl,
    }
  }, [calculatePriceBRL, product, originalPrice, discountedPrice, discountPercentage, exchangeRate])

  const handleToggleFavorite = async () => {
    if (!product) return
    setFavLoading(true)
    try {
      if (isProductFavorite) {
        await removeFavorite(product.id)
        // toast handles in hook
      } else {
        await addFavorite(product.id)
        triggerAnimation()
        // toast handles in hook
      }
    } catch (error) {
      // Silently fail to keep optimistic UI as requested
    } finally {
      setFavLoading(false)
    }
  }

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'show_price_cost')
        .maybeSingle()

      if (data && data.value === 'true') {
        setShowPriceCost(true)
      } else {
        setShowPriceCost(false)
      }
    }

    fetchSettings()
  }, [])

  useEffect(() => {
    if (!isAuthLoading) {
      const role = authUser?.app_metadata?.role || authUser?.user_metadata?.role
      setIsAdmin(role === 'admin')
    }
  }, [authUser, isAuthLoading])

  useEffect(() => {
    if (!product) return
    if (hasFetchedRelated) return

    let isMounted = true

    const fetchRelated = async () => {
      setIsLoadingRelated(true)
      try {
        let manualIds = product.manual_related_ids || []
        let aiIds = product.ai_related_ids || []

        if ((!aiIds || aiIds.length === 0) && !product.is_discontinued) {
          const { data, error } = await supabase.functions.invoke('generate-related-products', {
            body: { productId: product.id },
          })

          if (!error && data && data.success && data.ai_related_ids) {
            aiIds = data.ai_related_ids
          }
        }

        const allIds = Array.from(new Set([...manualIds, ...aiIds]))

        if (allIds.length === 0) {
          if (isMounted) {
            setRelatedProducts([])
            setIsLoadingRelated(false)
            setHasFetchedRelated(true)
          }
          return
        }

        const { data: relatedData } = await supabase
          .from('products')
          .select('*, manufacturer:manufacturers(*)')
          .in('id', allIds)
          .eq('is_discontinued', false)

        if (relatedData && isMounted) {
          const manualProducts = relatedData.filter((p: any) => manualIds.includes(p.id))
          const aiProducts = relatedData.filter(
            (p: any) => aiIds.includes(p.id) && !manualIds.includes(p.id),
          )

          let combined = [...manualProducts, ...aiProducts]

          for (let i = combined.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[combined[i], combined[j]] = [combined[j], combined[i]]
          }

          setRelatedProducts(combined.slice(0, 6))
        }
      } catch (e) {
        console.error('Error fetching related products:', e)
      } finally {
        if (isMounted) {
          setIsLoadingRelated(false)
          setHasFetchedRelated(true)
        }
      }
    }

    fetchRelated()

    return () => {
      isMounted = false
    }
  }, [product, hasFetchedRelated])

  useEffect(() => {
    window.scrollTo(0, 0)
    if (!id) return

    // Dynamic Chat Context Management: Reset state on product change (or URL change)
    setProduct(null)
    setIsBrlModalOpen(false)
    setIsTechnicalInfoOpen(false)
    setIsAiChatOpen(false)
    setRelatedProducts([])
    setHasFetchedRelated(false)
    setIsLoadingRelated(false)

    supabase
      .from('products')
      .select('*, manufacturer:manufacturers(*)')
      .eq('id', id)
      .single()
      .then(({ data }) => data && setProduct(data as any))
  }, [id, location.pathname, location.search])

  const displayWeight = (w: number | null) => {
    if (w === null || w === undefined) return null
    if (isMetric) return `${(w * 0.453592).toFixed(2)} kg`
    return `${w} lb`
  }

  const displayDimensions = (d: string | null) => {
    if (!d) return null
    if (isMetric) return d.replace(/\d+(\.\d+)?/g, (m) => (parseFloat(m) * 2.54).toFixed(1)) + ' cm'
    return `${d} in`
  }

  if (!product)
    return (
      <>
        <SEO title="Carregando Produto..." />
        <div className="p-12 text-center text-muted-foreground flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </>
    )

  const metaDescription = product.description ? product.description.substring(0, 150) : undefined

  return (
    <>
      <SEO
        title={product.name}
        description={metaDescription}
        image={product.image_url || undefined}
        article={true}
      />
      <div className="container mx-auto px-4 py-8 animate-fade-in pb-24">
        <div className="text-sm text-muted-foreground mb-8 font-mono">
          <Link to="/" className="hover:text-primary transition-colors">
            Catálogo
          </Link>{' '}
          / <span className="text-foreground ml-2">{product.name}</span>
        </div>

        <div className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-12 xl:gap-16">
          <div className="contents lg:block lg:space-y-8">
            <div className="order-1 lg:order-none mb-8 lg:mb-0">
              <div className="aspect-square bg-white rounded-xl overflow-hidden border border-border/50 p-8 flex items-center justify-center relative group shadow-sm">
                <ImageWithFallback
                  src={product.image_url}
                  alt={product.name}
                  productId={product.id}
                  className="w-full h-full object-contain rounded group-hover:scale-105 transition-transform duration-700 ease-out drop-shadow-2xl"
                />

                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleToggleFavorite()
                  }}
                  disabled={favLoading}
                  className="absolute top-4 right-4 z-10 p-3 rounded-full bg-background/80 backdrop-blur-md border border-border/50 shadow-sm transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
                  aria-label={
                    isProductFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
                  }
                >
                  <div className="relative flex items-center justify-center">
                    <Heart
                      className={cn(
                        'w-6 h-6 transition-all duration-300 relative z-10',
                        isProductFavorite
                          ? 'fill-red-500 text-red-500'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    />
                    {isAnimating && (
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-0">
                        <Heart className="w-6 h-6 fill-red-500 text-red-500 animate-ping absolute opacity-75" />
                        <div className="absolute -inset-4 bg-red-500/20 rounded-full animate-pulse blur-sm" />
                      </div>
                    )}
                  </div>
                </button>
              </div>
            </div>

            <div className="order-4 lg:order-none mb-8 lg:mb-0">
              <div className="bg-card border border-border/50 rounded-2xl overflow-hidden text-sm shadow-sm">
                <div className="flex items-center justify-between p-4 border-b border-green-900/40 bg-green-950/20">
                  <h3 className="font-bold text-green-400">Especificações Base</h3>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={!isMetric ? 'font-bold text-green-400' : 'text-green-800'}>
                      IMP
                    </span>
                    <div className="flex items-center">
                      <Switch
                        checked={isMetric}
                        onCheckedChange={setIsMetric}
                        className="scale-75 data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-green-800 [&>span]:bg-[#4ade80]"
                      />
                    </div>
                    <span className={isMetric ? 'font-bold text-green-400' : 'text-green-800'}>
                      MET
                    </span>
                  </div>
                </div>
                {[
                  ...(product.manufacturer?.name && product.manufacturer.name.trim() !== ''
                    ? [{ l: 'Marca', v: product.manufacturer.name }]
                    : []),
                  ...(product.sku && product.sku.trim() !== ''
                    ? [{ l: 'Código (SKU)', v: product.sku }]
                    : []),
                  ...(product.category && product.category.trim() !== ''
                    ? [{ l: 'Categoria', v: product.category }]
                    : []),
                  ...(product.ncm !== null &&
                  product.ncm !== undefined &&
                  String(product.ncm).trim() !== ''
                    ? [{ l: 'NCM', v: formatNCM(product.ncm) }]
                    : []),
                  ...(product.weight !== null && product.weight !== undefined && product.weight > 0
                    ? [{ l: 'Peso', v: displayWeight(product.weight) }]
                    : []),
                  ...(product.dimensions && product.dimensions.trim() !== ''
                    ? [{ l: 'Dimensões', v: displayDimensions(product.dimensions) }]
                    : []),
                ].map((s, i) => (
                  <div
                    key={s.l}
                    className={`flex justify-between py-3 px-4 hover:bg-muted/30 transition-colors ${i !== 0 ? 'border-t border-border/30' : ''}`}
                  >
                    <span className="text-muted-foreground font-medium">{s.l}</span>
                    <span className="font-mono text-foreground">{s.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="contents lg:flex lg:flex-col">
            <div className="order-2 lg:order-none flex flex-col w-full">
              <span className="text-primary font-mono uppercase tracking-widest text-xs font-bold mb-2">
                {product.manufacturer?.name || product.category || 'Equipamento Profissional'}
              </span>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-6 leading-tight flex items-center gap-3 flex-wrap">
                {product.name}
                {product.is_discontinued && (
                  <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-md text-sm font-semibold uppercase tracking-wider">
                    DESCONTINUADO
                  </span>
                )}
              </h1>

              <div className="mb-8">
                <div className="text-foreground/90 text-sm md:text-base leading-relaxed">
                  {product.description ? (
                    <MarkdownWithTables markdown={product.description} />
                  ) : (
                    <p className="text-muted-foreground italic">Descrição não disponível.</p>
                  )}
                </div>

                {product.technical_info && product.technical_info.trim() !== '' && (
                  <Button
                    variant="outline"
                    onClick={() => setIsTechnicalInfoOpen(true)}
                    className="mt-6"
                  >
                    <Info className="w-4 h-4 mr-2" />
                    Mais Informações
                  </Button>
                )}
              </div>

              <div className="bg-card border border-border/50 rounded-xl p-6 shadow-sm mb-6 relative overflow-hidden">
                <div className="absolute -top-4 -right-4 p-4 opacity-5 pointer-events-none">
                  <Globe className="w-32 h-32" />
                </div>

                <div className="relative z-10 flex flex-col gap-6">
                  {!hasPrice && (
                    <div>
                      <ProductPrice originalPrice={null} size="lg" align="left" />
                    </div>
                  )}

                  {hasUsaPrice ? (
                    <div>
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <span className="text-xs font-bold uppercase tracking-widest">
                          Preço Miami (FOB)
                        </span>
                      </div>
                      <ProductPrice
                        originalPrice={
                          originalPrice || product.price_usd || product.price_usa_rebate
                        }
                        discountedPrice={discountedPrice}
                        discountPercentage={discountPercentage}
                        ruleName={ruleName}
                        isRebateActive={isRebateActive}
                        size="lg"
                        align="left"
                      />
                    </div>
                  ) : hasNationalizedPrice ? (
                    <div>
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <span className="text-xs font-bold uppercase tracking-widest">
                          Preço Brasil (Nacionalizado)
                        </span>
                      </div>
                      <ProductPrice
                        originalPrice={
                          product.price_nationalized_currency === 'USD'
                            ? product.price_nationalized_sales! * exchangeRate
                            : product.price_nationalized_sales!
                        }
                        discountedPrice={
                          discountPercentage > 0
                            ? (product.price_nationalized_currency === 'USD'
                                ? product.price_nationalized_sales! * exchangeRate
                                : product.price_nationalized_sales!) *
                              (1 - discountPercentage / 100)
                            : product.price_nationalized_currency === 'USD'
                              ? product.price_nationalized_sales! * exchangeRate
                              : product.price_nationalized_sales!
                        }
                        discountPercentage={discountPercentage}
                        ruleName={ruleName}
                        isRebateActive={false}
                        size="lg"
                        currency="BRL"
                        align="left"
                      />
                    </div>
                  ) : null}

                  {isAdmin && showPriceCost && (
                    <div className="mt-2 text-xs text-muted-foreground font-mono flex flex-col gap-1">
                      <span className="font-medium">
                        Preço de Custo (FOB Miami / Nacionalizado):
                      </span>
                      <span className="text-foreground flex items-center gap-1">
                        {(() => {
                          const costPrice = formatPrice(product.price_cost)
                          const natCurrency = product.price_nationalized_currency || 'BRL'
                          const costPriceNat = product.price_nationalized_cost
                            ? new Intl.NumberFormat(natCurrency === 'BRL' ? 'pt-BR' : 'en-US', {
                                style: 'currency',
                                currency: natCurrency,
                              }).format(product.price_nationalized_cost)
                            : null

                          return (
                            <>
                              {costPrice.isPlaceholder ? 'US$ N/A' : costPrice.text}
                              {' / '}
                              {costPriceNat ? costPriceNat : `${natCurrency} N/A`}
                            </>
                          )
                        })()}
                      </span>
                    </div>
                  )}

                  {hasUsaPrice && (
                    <div className="mt-2 pt-6 border-t border-border/50">
                      <Button
                        variant="secondary"
                        className="w-full justify-between h-12 text-sm bg-muted/50 hover:bg-muted"
                        onClick={() => setIsBrlModalOpen(true)}
                        disabled={isLoading}
                      >
                        <span className="flex items-center gap-2 text-foreground font-medium">
                          <Calculator className="w-4 h-4 text-green-500" />
                          Estimar Preço Entregue no Brasil
                        </span>
                        <ChevronRight className="w-4 h-4 opacity-50" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="order-3 lg:order-none w-full mb-10 lg:mb-0 flex gap-4">
              {hasPrice ? (
                <Button
                  size="lg"
                  disabled={product.is_discontinued}
                  aria-label={
                    product.is_discontinued
                      ? 'Produto descontinuado. Nao disponivel para adicionar.'
                      : undefined
                  }
                  onClick={() => {
                    if (!product.is_discontinued) {
                      addToCart(product.id, 1, product)
                        .then(() => {
                          toast({
                            title: 'Adicionado ao carrinho!',
                            description: `${product.name} adicionado com sucesso.`,
                          })
                        })
                        .catch(() => {
                          toast({
                            variant: 'destructive',
                            title: 'Erro',
                            description: 'Falha ao adicionar ao carrinho.',
                          })
                        })
                    }
                  }}
                  className={cn(
                    'flex-1 h-14 text-base font-semibold shadow-lg transition-all',
                    product.is_discontinued
                      ? 'opacity-50 cursor-not-allowed !pointer-events-auto bg-[#cc7f14] text-[#111111]'
                      : 'bg-[#FF9F1A] hover:bg-[#FF9F1A]/90 text-[#111111] hover:shadow-[#FF9F1A]/20 hover:-translate-y-0.5',
                  )}
                >
                  <ShoppingCart className="w-5 h-5 mr-3" /> Adicionar ao Carrinho
                </Button>
              ) : (
                <Button
                  size="lg"
                  disabled={product.is_discontinued}
                  onClick={() => {
                    const msg = encodeURIComponent(
                      `Olá, gostaria de uma cotação personalizada para o produto: ${product.name}`,
                    )
                    window.open(`https://wa.me/5561981815050?text=${msg}`, '_blank')
                  }}
                  className={cn(
                    'flex-1 h-14 text-base font-semibold shadow-lg transition-all bg-emerald-600 hover:bg-emerald-700 text-white',
                    product.is_discontinued
                      ? 'opacity-50 cursor-not-allowed !pointer-events-auto'
                      : 'hover:shadow-emerald-600/20 hover:-translate-y-0.5',
                  )}
                >
                  <MessageCircle className="w-5 h-5 mr-3" /> Consultar Especialista
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={handleToggleFavorite}
                disabled={favLoading}
                className={cn(
                  'h-14 w-14 shrink-0 rounded-xl transition-all shadow-sm relative overflow-hidden bg-[#012211] hover:bg-[#023317]',
                  isProductFavorite ? 'border-transparent' : 'border-transparent',
                  //  : 'border-[#4ade80] hover:border-[#4ade80]',
                )}
                aria-label={isProductFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              >
                <Heart
                  className={cn(
                    'w-6 h-6 transition-all duration-300 relative z-10',
                    isProductFavorite
                      ? 'fill-red-500 text-red-500 stroke-red-500'
                      : 'text-[#4ade80]',
                  )}
                />
                {isAnimating && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-0">
                    <Heart className="w-6 h-6 fill-red-500 text-red-500 animate-ping absolute opacity-75" />
                    <div className="absolute inset-0 bg-[#023317]/50 animate-pulse" />
                  </div>
                )}
              </Button>
            </div>

            <div className="order-5 lg:order-none w-full mt-0 lg:mt-6">
              <div className="bg-secondary border border-border rounded-[1rem] p-6 min-h-[280px] w-full flex flex-col shadow-sm mb-6">
                <div className="flex items-start gap-4">
                  <Sparkles className="w-12 h-12 text-primary shrink-0" />
                  <div>
                    <h3 className="text-[1.25rem] font-semibold text-foreground">
                      Engenharia de IA
                    </h3>
                    <p className="text-[0.875rem] text-muted-foreground mt-1">
                      Faça perguntas técnicas avançadas
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex-1">
                  <p className="text-[0.95rem] leading-[1.6] text-foreground">
                    Utilize nosso assistente de IA para obter respostas detalhadas sobre
                    especificações, compatibilidade, integrações e fluxos de trabalho profissionais
                    do {product.name}.
                  </p>
                </div>

                <Button
                  type="button"
                  className="w-full mt-6"
                  size="lg"
                  onClick={() => setIsAiChatOpen(true)}
                >
                  Fazer Pergunta
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Produtos Relacionados Section */}
        <div className="mt-16 border-t border-border/50 pt-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Produtos Relacionados
          </h2>

          {isLoadingRelated ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-3 p-4 rounded-xl border border-border/50 bg-card shadow-sm h-full"
                >
                  <div className="w-full aspect-square bg-slate-800 animate-pulse rounded-lg" />
                  <div className="flex flex-col flex-1 mt-2">
                    <div className="h-3 bg-slate-800 animate-pulse rounded w-1/3 mb-2" />
                    <div className="h-4 bg-slate-800 animate-pulse rounded w-full mb-1" />
                    <div className="h-4 bg-slate-800 animate-pulse rounded w-2/3 mb-4" />
                    <div className="h-6 bg-slate-800 animate-pulse rounded w-1/2 mt-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : relatedProducts.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="p-8 text-center bg-muted/20 rounded-xl border border-border/50">
              <p className="text-muted-foreground">
                Nenhum produto relacionado encontrado no momento.
              </p>
            </div>
          )}
        </div>

        <AIConsultantModal
          isOpen={isAiChatOpen}
          onClose={() => setIsAiChatOpen(false)}
          productName={product.name}
          technicalInfo={normalizeSpecs(product.technical_info)}
          productId={product.id}
        />

        <TechnicalInfoModal
          isOpen={isTechnicalInfoOpen}
          onClose={() => setIsTechnicalInfoOpen(false)}
          technicalInfo={normalizeSpecs(product.technical_info)}
        />

        <Dialog open={isBrlModalOpen} onOpenChange={setIsBrlModalOpen}>
          <DialogContent className="sm:max-w-md bg-background border-border/50">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-green-500" />
                Estimativa Entregue no Brasil
              </DialogTitle>
              <DialogDescription>
                Preço final estimado em reais incluindo o frete e a conversão de câmbio
              </DialogDescription>
            </DialogHeader>

            <div className="py-6 flex flex-col items-center justify-center">
              {isLoading || exchangeRate === 0 ? (
                <div className="flex flex-col items-center space-y-4">
                  <div className="h-8 w-32 bg-muted animate-pulse rounded" />
                  <div className="h-10 w-48 bg-muted animate-pulse rounded" />
                </div>
              ) : priceBrlResult === null ? (
                <div className="flex flex-col items-center text-center gap-2">
                  <HelpCircle className="w-10 h-10 text-muted-foreground opacity-50 mb-2" />
                  <p className="text-lg font-semibold text-foreground uppercase tracking-wider">
                    Preço sob consulta
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {!product?.weight && !(product?.price_nationalized_sales || 0)
                      ? 'Peso e preço nacional não cadastrados. '
                      : ''}
                    Entre em contato para um orçamento detalhado em BRL.
                  </p>
                </div>
              ) : (
                <div className="relative w-full max-w-[340px] mx-auto transition-all duration-500">
                  <div className="text-center animate-in fade-in zoom-in-95 duration-300 flex flex-col items-center w-full">
                    {settingsError && (
                      <div className="text-sm font-medium text-destructive mb-4">
                        {settingsError}
                      </div>
                    )}
                    <span className="text-sm font-semibold text-green-500 uppercase tracking-wider block mb-2">
                      Preço Final BRL
                    </span>

                    <div className="[&_[class*='mt-1.5']]:hidden w-full flex justify-center">
                      <ProductPrice
                        originalPrice={priceBrlResult.original_brl}
                        discountedPrice={priceBrlResult.total_brl}
                        discountPercentage={discountPercentage}
                        ruleName={ruleName}
                        isRebateActive={isRebateActive}
                        currency="BRL"
                        size="lg"
                      />
                    </div>

                    {priceBrlResult.savings_brl > 0 && (
                      <div className="mt-5 bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 px-4 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 w-full text-sm shadow-sm">
                        <Sparkles className="w-4 h-4 shrink-0" />
                        <span>
                          Você economiza{' '}
                          <strong>
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            }).format(priceBrlResult.savings_brl)}
                          </strong>{' '}
                          nesta compra
                        </span>
                      </div>
                    )}

                    {isRebateActive && product?.date_rebate && (
                      <div className="mt-4 flex flex-col items-center text-amber-600 dark:text-amber-500 bg-amber-500/10 px-4 py-2.5 rounded-lg border border-amber-500/20 w-full text-sm shadow-sm">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600/80 dark:text-amber-500/80">
                          Oferta termina em
                        </span>
                        <CountdownTimer targetDate={product.date_rebate} />
                      </div>
                    )}

                    <p className="text-[11px] text-muted-foreground mt-4 max-w-[280px] mx-auto leading-relaxed">
                      * Referencial dinâmico sujeito a variação cambial
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-2 text-center border-t border-border/30 pt-4">
              <Button onClick={() => setIsBrlModalOpen(false)} variant="outline" className="w-full">
                Fechar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <button
        onClick={() => {
          if (window.history.state && window.history.state.idx > 0) {
            navigate(-1)
          } else {
            navigate('/')
          }
        }}
        aria-label="Voltar para busca anterior"
        className={cn(
          'fixed z-40 flex items-center justify-center rounded-full border border-[rgba(255,255,255,0.2)] bg-[rgba(0,0,0,0.15)] backdrop-blur-[8px] transition-all duration-200 ease-out hover:bg-[rgba(0,0,0,0.25)] active:scale-95 active:bg-[rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group animate-in fade-in slide-in-from-left-5 duration-300',
          'bottom-4 left-4 h-12 w-12',
          'md:bottom-5 md:left-5 md:h-[52px] md:w-[52px]',
          'lg:bottom-6 lg:left-6 lg:h-14 lg:w-14',
        )}
      >
        <ChevronLeft className="text-white/80 group-hover:text-white group-hover:opacity-100 transition-opacity w-5 h-5 md:w-[22px] md:h-[22px] lg:w-6 lg:h-6" />
      </button>
    </>
  )
}
