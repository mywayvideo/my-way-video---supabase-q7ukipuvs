import { useCart } from '@/hooks/useCart'
import { useFavorites } from '@/hooks/useFavorites'
import { Button } from '@/components/ui/button'
import {
  ShoppingCart,
  Heart,
  Trash2,
  AlertCircle,
  Minus,
  Plus,
  ArrowRight,
  Zap,
  MessageCircle,
  Loader2,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import { getEligibilityAndPrice, Destination } from '@/utils/pricingLogic'
import { useAuthContext } from '@/contexts/AuthContext'
import { getBestDiscount } from '@/services/discountApplicationService'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { ProductCard } from '@/components/ProductCard'

export default function Cart() {
  const { currentUser: user } = useAuthContext()
  const { items, isLoading, removeFromCart, updateQuantity } = useCart()
  const { addFavorite } = useFavorites()
  const navigate = useNavigate()
  const [fadingItems, setFadingItems] = useState<string[]>([])
  const [loadingItems, setLoadingItems] = useState<string[]>([])
  const [showHoursModal, setShowHoursModal] = useState(false)
  const [waMessage, setWaMessage] = useState('')
  const [isCheckingOut, setIsCheckingOut] = useState(false)

  const [activeDiscounts, setActiveDiscounts] = useState<any[]>([])
  const [customer, setCustomer] = useState<any>(null)

  const [destination, setDestination] = useState<Destination>('brasil')
  const [productDetails, setProductDetails] = useState<Record<string, any>>({})
  const [exchangeRate, setExchangeRate] = useState<number>(5)
  const [shippingSettings, setShippingSettings] = useState({
    pricePerKg: 120,
    percentageValue: 10,
    additionalWeightKg: 0.5,
  })
  const [isHydratingDetails, setIsHydratingDetails] = useState(true)
  const [recommendedProducts, setRecommendedProducts] = useState<any[]>([])

  useEffect(() => {
    window.scrollTo(0, 0)

    const fetchSettings = async () => {
      const { data: exData } = await supabase
        .from('price_settings')
        .select('exchange_rate, exchange_spread')
        .single()
      if (exData) setExchangeRate((exData.exchange_rate || 0) + (exData.exchange_spread || 0))

      const { data: set } = await supabase
        .from('app_settings')
        .select('setting_key, setting_value, setting_value_numeric')
        .in('setting_key', [
          'shipping_sao_paulo_price_per_kg',
          'shipping_sao_paulo_percentage_value',
          'shipping_sao_paulo_additional_weight_kg',
        ])

      if (set) {
        let pricePerKg = 120,
          percentageValue = 10,
          additionalWeightKg = 0.5
        const p = set.find((s) => s.setting_key === 'shipping_sao_paulo_price_per_kg')
        if (p) pricePerKg = p.setting_value_numeric ?? Number(p.setting_value)
        const pv = set.find((s) => s.setting_key === 'shipping_sao_paulo_percentage_value')
        if (pv) percentageValue = pv.setting_value_numeric ?? Number(pv.setting_value)
        const aw = set.find((s) => s.setting_key === 'shipping_sao_paulo_additional_weight_kg')
        if (aw) additionalWeightKg = aw.setting_value_numeric ?? Number(aw.setting_value)

        setShippingSettings({ pricePerKg, percentageValue, additionalWeightKg })
      }

      const { data: discData } = await supabase.from('discounts').select('*').eq('is_active', true)
      if (discData) setActiveDiscounts(discData)
    }
    fetchSettings()

    const fetchRecommended = async () => {
      const { data } = await supabase
        .from('products')
        .select(
          'id, name, image_url, price_usd, price_brl, price_nationalized_sales, manufacturers(name)',
        )
        .eq('is_discontinued', false)
        .order('created_at', { ascending: false })
        .limit(4)
      if (data) setRecommendedProducts(data)
    }
    fetchRecommended()
  }, [])

  useEffect(() => {
    const fetchCustomer = async () => {
      if (user) {
        const { data: custData } = await supabase
          .from('customers')
          .select('id, role')
          .eq('user_id', user.id)
          .single()
        if (custData) setCustomer(custData)
      } else {
        setCustomer(null)
      }
    }
    fetchCustomer()
  }, [user])

  useEffect(() => {
    const fetchProducts = async () => {
      const ids = (items || []).map((i) => i.product_id).filter(Boolean)
      if (!ids.length) {
        setProductDetails({})
        setIsHydratingDetails(false)
        return
      }
      setIsHydratingDetails(true)
      const { data } = await supabase
        .from('products')
        .select(
          'id, name, image_url, price_nationalized_sales, price_nationalized_cost, price_nationalized_currency, price_usd, price_cost, weight, manufacturer_id, category_id',
        )
        .in('id', ids)
      if (data) {
        const details: Record<string, any> = {}
        data.forEach((d) => (details[d.id] = d))
        setProductDetails(details)
      }
      setIsHydratingDetails(false)
    }

    if (!isLoading) {
      fetchProducts()
    }
  }, [items, isLoading])

  const evaluatedItems = useMemo(() => {
    if (isLoading || isHydratingDetails || !items) return []

    return items.map((item) => {
      const details = productDetails[item.product_id] || item.product || {}

      let discountedDetails = { ...details }
      const normalizedPriceUsa =
        details.price_usd || details.price_usa || item.product?.price_usa || 0

      discountedDetails.price_usa = normalizedPriceUsa
      discountedDetails.price_usd = normalizedPriceUsa
      details.price_usa = normalizedPriceUsa
      details.price_usd = normalizedPriceUsa

      let hasDiscount = false
      let originalPriceUsa = normalizedPriceUsa
      let originalPriceNat =
        details.price_nationalized_sales || item.product?.price_nationalized_sales || 0

      const originalEvalResult = getEligibilityAndPrice(
        details,
        destination,
        exchangeRate,
        shippingSettings,
      )

      let originalBasePrice = 0
      let originalCostPrice = 0

      if (destination === 'brasil' && originalPriceNat > 0) {
        originalBasePrice = originalPriceNat
        originalCostPrice =
          details.price_nationalized_cost || item.product?.price_nationalized_cost || 0
      } else {
        originalBasePrice = originalPriceUsa
        originalCostPrice = details.price_cost || item.product?.price_cost || 0
      }

      if (activeDiscounts.length > 0 && originalBasePrice > 0) {
        const bestDiscount = getBestDiscount(
          activeDiscounts,
          details.id,
          customer?.id || null,
          customer?.role || null,
          originalBasePrice,
          originalCostPrice,
          details.manufacturer_id,
          details.category_id,
        )
        if (bestDiscount && bestDiscount.discountedPrice < originalBasePrice) {
          hasDiscount = true

          if (destination === 'brasil' && originalPriceNat > 0) {
            discountedDetails.price_nationalized_sales = bestDiscount.discountedPrice
          } else {
            discountedDetails.price_usd = bestDiscount.discountedPrice
            discountedDetails.price_usa = bestDiscount.discountedPrice
          }
        }
      }

      const evalResult = getEligibilityAndPrice(
        discountedDetails,
        destination,
        exchangeRate,
        shippingSettings,
      )

      return {
        ...item,
        productDetails: details,
        ...evalResult,
        originalPrice: originalEvalResult.price,
        hasDiscount,
        itemTotal: evalResult.eligible ? evalResult.price * item.quantity : 0,
      }
    })
  }, [
    items,
    productDetails,
    destination,
    exchangeRate,
    shippingSettings,
    isLoading,
    isHydratingDetails,
    activeDiscounts,
    customer,
  ])

  const hasIneligibleItems = evaluatedItems.some((i) => !i.eligible)
  const dynamicSubtotal = evaluatedItems.reduce((sum, item) => sum + (item.itemTotal || 0), 0)

  const checkBusinessHours = () => {
    const miamiTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const hours = miamiTime.getHours()
    return hours >= 8 && hours < 17
  }

  const generateWaMessage = () => {
    const cartList = (items || []).filter((item) => !fadingItems.includes(item.id))
    return `Ola! Gostaria de fazer checkout com um especialista. Subtotal: R$ ${dynamicSubtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  }

  const handleWhatsAppCheckout = () => {
    try {
      setIsCheckingOut(true)
      const msg = generateWaMessage()
      setWaMessage(msg)

      if (!checkBusinessHours()) {
        setShowHoursModal(true)
        setIsCheckingOut(false)
        return
      }

      openWhatsApp(msg)
    } catch (e) {
      toast.error('Erro ao abrir WhatsApp')
    } finally {
      setIsCheckingOut(false)
    }
  }

  const openWhatsApp = (msg: string) => {
    const phone = import.meta.env.VITE_WHATSAPP_NUMBER || ''
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const handleMoveToFavorites = async (item: any) => {
    setLoadingItems((prev) => [...prev, item.id])
    try {
      await addFavorite(item.product_id)
      await removeFromCart(item.id, item.product_id)
      setFadingItems((prev) => [...prev, item.id])
      toast.success('Movido para favoritos!')
    } catch (e) {
      toast.error('Erro ao mover para favoritos.')
    } finally {
      setLoadingItems((prev) => prev.filter((id) => id !== item.id))
    }
  }

  const handleRemove = async (item: any) => {
    setLoadingItems((prev) => [...prev, item.id])
    try {
      await removeFromCart(item.id, item.product_id)
      setFadingItems((prev) => [...prev, item.id])
      toast.success('Item removido do carrinho.')
    } catch (e) {
      toast.error('Erro ao remover item.')
    } finally {
      setLoadingItems((prev) => prev.filter((id) => id !== item.id))
    }
  }

  const handleUpdateQty = async (item: any, qty: number) => {
    if (qty < 1 || qty > 50) return
    setLoadingItems((prev) => [...prev, item.id])
    try {
      await updateQuantity(item.id, qty, item.product_id)
    } catch (e) {
      toast.error('Erro ao atualizar quantidade.')
    } finally {
      setLoadingItems((prev) => prev.filter((id) => id !== item.id))
    }
  }

  if (isLoading || isHydratingDetails) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-5xl">
        <h1 className="text-3xl font-bold mb-8">Meu Carrinho</h1>
        <div className="flex flex-col md:flex-row gap-8">
          <div className="flex-1 space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
          <div className="w-full md:w-80">
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  const visibleItems = evaluatedItems.filter((item) => !fadingItems.includes(item.id))

  if (visibleItems.length === 0) {
    return (
      <div className="container mx-auto py-16 px-4 max-w-5xl animate-fade-in-up">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <ShoppingCart className="w-12 h-12 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Carrinho Vazio</h2>
          <p className="text-muted-foreground mb-8 max-w-md">
            Adicione produtos ao carrinho para continuar. Explore nosso catálogo de equipamentos
            profissionais.
          </p>
          <Button size="lg" onClick={() => navigate('/search')}>
            Voltar para Loja <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>

        {recommendedProducts.length > 0 && (
          <div className="mt-20">
            <h3 className="text-xl font-bold mb-6">Recomendados para você</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {recommendedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl animate-fade-in">
      <h1 className="text-3xl font-bold mb-8">Meu Carrinho</h1>

      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-muted/20 rounded-xl border border-border">
        <span className="font-semibold">Destino de Entrega:</span>
        <div className="flex gap-2">
          <Button
            variant={destination === 'brasil' ? 'default' : 'outline'}
            onClick={() => setDestination('brasil')}
            size="sm"
            className="rounded-full px-6"
          >
            Brasil
          </Button>
          <Button
            variant={destination === 'usa' ? 'default' : 'outline'}
            onClick={() => setDestination('usa')}
            size="sm"
            className="rounded-full px-6"
          >
            EUA
          </Button>
        </div>
      </div>

      {hasIneligibleItems && (
        <div className="bg-red-50 border border-red-200 p-4 mb-6 rounded-xl text-red-800 flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm font-medium">
            Atenção: Alguns itens do seu carrinho não estão disponíveis para entrega no destino
            selecionado. Por favor, remova-os ou divida sua compra em pedidos separados.
          </p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-4">
          {evaluatedItems.map((item) => {
            const isFading = fadingItems.includes(item.id)
            const isProcessing = loadingItems.includes(item.id)
            if (isFading) return null

            return (
              <div
                key={item.id}
                className={`flex flex-col sm:flex-row bg-card border border-border rounded-xl p-4 gap-4 items-center transition-all animate-fade-in`}
              >
                <Link to={`/product/${item.product_id}`} className="shrink-0">
                  {item.productDetails?.image_url ? (
                    <img
                      src={item.productDetails.image_url}
                      alt={item.productDetails?.name}
                      className="w-24 h-24 object-contain rounded-md bg-muted/30 p-2"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-muted/30 rounded-md flex items-center justify-center">
                      <ShoppingCart className="w-8 h-8 text-muted-foreground/30" />
                    </div>
                  )}
                </Link>

                <div className="flex-1 text-center sm:text-left">
                  <Link
                    to={`/product/${item.product_id}`}
                    className="font-semibold text-lg hover:text-primary transition-colors line-clamp-2"
                  >
                    {item.productDetails?.name || 'Produto'}
                  </Link>
                  {item.eligible ? (
                    <div className="mt-1 flex items-center gap-2">
                      <p
                        className={cn(
                          'font-medium',
                          item.hasDiscount ? 'text-emerald-600 font-bold' : 'text-muted-foreground',
                        )}
                      >
                        {item.currency === 'BRL' ? 'R$ ' : '$'}
                        {item.price?.toLocaleString(item.currency === 'BRL' ? 'pt-BR' : 'en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      {item.hasDiscount && item.originalPrice > item.price && (
                        <p className="text-xs text-muted-foreground line-through">
                          {item.currency === 'BRL' ? 'R$ ' : '$'}
                          {item.originalPrice?.toLocaleString(
                            item.currency === 'BRL' ? 'pt-BR' : 'en-US',
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-red-100 text-red-700">
                      Indisponível para este destino
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-center sm:items-end gap-3 shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center border border-border rounded-md bg-background">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-none"
                        disabled={isProcessing || item.quantity <= 1}
                        onClick={() => handleUpdateQty(item, item.quantity - 1)}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-10 text-center text-sm font-medium">{item.quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-none"
                        disabled={isProcessing || item.quantity >= 50}
                        onClick={() => handleUpdateQty(item, item.quantity + 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="text-right w-28 font-bold text-lg flex flex-col items-end">
                      {item.eligible ? (
                        <>
                          <span className={cn(item.hasDiscount ? 'text-emerald-600' : '')}>
                            {item.currency === 'BRL' ? 'R$ ' : '$'}
                            {(item.itemTotal || 0).toLocaleString(
                              item.currency === 'BRL' ? 'pt-BR' : 'en-US',
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            )}
                          </span>
                          {item.hasDiscount && item.originalPrice > item.price && (
                            <span className="text-xs text-muted-foreground line-through font-normal mt-0.5">
                              {item.currency === 'BRL' ? 'R$ ' : '$'}
                              {(item.originalPrice * item.quantity).toLocaleString(
                                item.currency === 'BRL' ? 'pt-BR' : 'en-US',
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                },
                              )}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground text-sm">--</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5 hover:scale-[1.02] shadow-sm"
                      disabled={isProcessing}
                      onClick={() => handleMoveToFavorites(item)}
                    >
                      <Heart className="w-3.5 h-3.5" />{' '}
                      <span className="hidden sm:inline">Mover para Favoritos</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:scale-[1.02] shadow-sm"
                      disabled={isProcessing}
                      onClick={() => handleRemove(item)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="w-full lg:w-80 shrink-0">
          <div className="bg-card border border-border rounded-xl p-6 sticky top-24 shadow-sm">
            <h3 className="text-xl font-bold mb-4">Resumo</h3>
            <div className="space-y-3 mb-6 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal ({visibleItems.reduce((a, b) => a + b.quantity, 0)} itens)</span>
                <span>
                  {destination === 'brasil' ? 'R$ ' : '$'}
                  {dynamicSubtotal.toLocaleString(destination === 'brasil' ? 'pt-BR' : 'en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-4 border-t border-border">
                <span>Total Estimado</span>
                <span>
                  {destination === 'brasil' ? 'R$ ' : '$'}
                  {dynamicSubtotal.toLocaleString(destination === 'brasil' ? 'pt-BR' : 'en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground text-center pt-2">
                Preço final calculado no checkout.
              </p>
            </div>
            <div>
              <p className="text-[12px] text-muted-foreground text-center">2 opcoes de checkout</p>
              <div className="flex flex-col w-full gap-[12px] mt-[16px]">
                <Button
                  className="w-full min-h-[48px] h-auto py-[16px] px-[16px] rounded-[8px] bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-start shadow-sm transition-all border-none"
                  onClick={() => {
                    setIsCheckingOut(true)
                    navigate('/checkout?dest=' + destination)
                  }}
                  disabled={isCheckingOut || hasIneligibleItems}
                >
                  {isCheckingOut ? (
                    <Loader2 className="w-[20px] h-[20px] shrink-0 animate-spin mr-[12px] text-white" />
                  ) : (
                    <Zap className="w-[20px] h-[20px] shrink-0 mr-[12px] text-white" />
                  )}
                  <div className="flex flex-col items-start text-left leading-tight text-white">
                    <span className="font-bold text-[14px]">Checkout Automatizado</span>
                    <span className="opacity-90 mb-[0px] pb-[0px] text-[12px] font-light">
                      Finalize sua compra em 2 minutos
                    </span>
                  </div>
                </Button>
                <Button
                  className="w-full min-h-[48px] h-auto py-[16px] px-[16px] rounded-[8px] bg-[#25D366] hover:bg-[#20bd5a] text-white flex items-center justify-start shadow-sm transition-all border-none"
                  onClick={handleWhatsAppCheckout}
                  disabled={isCheckingOut || hasIneligibleItems}
                >
                  {isCheckingOut ? (
                    <Loader2 className="w-[20px] h-[20px] shrink-0 animate-spin mr-[12px] text-white" />
                  ) : (
                    <MessageCircle className="w-[20px] h-[20px] shrink-0 mr-[12px] text-white" />
                  )}
                  <div className="flex flex-col items-start text-left leading-tight text-white">
                    <span className="font-bold text-[14px]">Checkout com Especialista</span>
                    <span className="font-light opacity-90 text-[12px]">
                      Checkout com atendente humano
                    </span>
                  </div>
                </Button>
              </div>
              <Button
                variant="outline"
                className="w-full shadow-sm hover:scale-[1.02] transition-all mt-3"
                onClick={() => navigate('/search')}
                disabled={isCheckingOut}
              >
                Continuar Comprando
              </Button>
            </div>
          </div>
        </div>
      </div>

      {recommendedProducts.length > 0 && (
        <div className="mt-20 border-t border-border pt-12">
          <h3 className="text-xl font-bold mb-6">Recomendados para você</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {recommendedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={showHoursModal} onOpenChange={setShowHoursModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fora do Horário Comercial</AlertDialogTitle>
            <AlertDialogDescription>
              Nosso atendimento funciona de 8h as 17h (horario de Miami). Deixe sua mensagem que
              responderemos assim que possivel!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-[12px] sm:space-x-0">
            <AlertDialogCancel className="w-full sm:w-1/2 h-[44px] rounded-[8px] bg-gray-800 text-white hover:bg-gray-700 hover:text-white border-0 mt-0 sm:mt-0">
              Fechar
            </AlertDialogCancel>
            <Button
              className="w-full sm:w-1/2 h-[44px] rounded-[8px] bg-[#25D366] hover:bg-[#20bd5a] text-white m-0"
              onClick={() => {
                openWhatsApp(waMessage)
                setShowHoursModal(false)
              }}
            >
              Enviar Pedido pelo WhatsApp
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
