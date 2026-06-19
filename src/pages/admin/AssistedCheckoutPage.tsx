import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { Search, ArrowLeft, Trash2, ShoppingCart, X, Loader2, MapPin } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useShippingConfig } from '@/hooks/useShippingConfig'
import { getBestDiscount } from '@/services/discountApplicationService'

async function extractEdgeFunctionError(error: any): Promise<string> {
  let errMessage = error?.message || 'Erro desconhecido'
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const res = typeof error.context.clone === 'function' ? error.context.clone() : error.context
      const errData = await res.json()
      if (errData && errData.error) errMessage = errData.error
    } catch (e) {
      // ignore JSON parse errors and keep original message
    }
  } else {
    try {
      const parsed = JSON.parse(errMessage)
      if (parsed && parsed.error) errMessage = parsed.error
    } catch (e) {
      // ignore JSON parse errors and keep original message
    }
  }
  return errMessage
}

function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export default function AssistedCheckoutPage() {
  const { customerId } = useParams()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<any>(null)
  const [products, setProducts] = useState<any[]>([])
  const [cart, setCart] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [discountRate, setDiscountRate] = useState(0)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)

  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string
    discount_amount: number
  } | null>(null)
  const [isGeneratingCoupon, setIsGeneratingCoupon] = useState(false)
  const [couponType, setCouponType] = useState<'fixed' | 'percentage'>('percentage')
  const [couponValue, setCouponValue] = useState<number | ''>('')
  const [generating, setGenerating] = useState(false)
  const [validating, setValidating] = useState(false)

  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'pix' | 'transfer' | ''>('')
  const [creditCardGateway, setCreditCardGateway] = useState<'stripe' | 'paypal'>('stripe')

  const [selectedShippingMethod, setSelectedShippingMethod] = useState<
    'miami' | 'usa' | 'brasil' | 'coleta' | ''
  >('')
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [availableAddresses, setAvailableAddresses] = useState<any[]>([])
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)

  const [shippingCost, setShippingCost] = useState<number | null>(null)
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false)
  const [shippingErrorMsg, setShippingErrorMsg] = useState<string | null>(null)
  const [usingFallbacks, setUsingFallbacks] = useState(false)
  const [upsFailed, setUpsFailed] = useState(false)

  const { warehouse } = useShippingConfig()
  const [activeDiscounts, setActiveDiscounts] = useState<any[]>([])

  const loadData = async () => {
    if (!customerId) return
    setLoading(true)
    setError(null)
    try {
      const [custRes, prodRes, discRes] = await Promise.all([
        supabase.from('customers').select('*').eq('id', customerId).single(),
        supabase.from('products').select('*, manufacturers(name)').limit(20),
        supabase.from('discounts').select('*').eq('is_active', true),
      ])

      if (custRes.error) throw custRes.error

      setCustomer(custRes.data)
      if (discRes.data) setActiveDiscounts(discRes.data)
      if (prodRes.data) setProducts(prodRes.data)

      if (custRes.data?.role === 'vip') setDiscountRate(10)
      if (custRes.data?.role === 'reseller') setDiscountRate(15)

      if (custRes.data?.user_id) {
        const { data: cartItemsData, error: itemsError } = await supabase
          .from('cart_items')
          .select('quantity, products(*, manufacturers(name))')
          .eq('user_id', custRes.data.user_id)

        if (itemsError) throw new Error('Não foi possível carregar os itens do carrinho.')

        if (cartItemsData) {
          const loadedCart = cartItemsData
            .filter((item: any) => item.products)
            .map((item: any) => {
              const prod = item.products
              const bestDiscount = getBestDiscount(
                discRes.data || [],
                prod.id,
                custRes.data?.id || null,
                custRes.data?.role || null,
                prod.price_usd || 0,
                prod.price_cost || 0,
              )
              const finalPrice = bestDiscount.discountedPrice

              if (finalPrice < (prod.price_usd || 0)) {
                prod.original_price = prod.price_usd
                prod.price_usd = finalPrice
              }

              return {
                product: prod,
                quantity: item.quantity,
              }
            })

          const cartMap = new Map()
          let hasNewDiscount = false

          loadedCart.forEach((item) => {
            if (item.product.original_price) {
              hasNewDiscount = true
            }
            if (cartMap.has(item.product.id)) {
              const existing = cartMap.get(item.product.id)
              existing.quantity += item.quantity
            } else {
              cartMap.set(item.product.id, item)
            }
          })
          setCart(Array.from(cartMap.values()))

          if (hasNewDiscount) {
            toast({
              title: 'Desconto Aplicado!',
              description:
                'Detectamos um novo desconto aplicável. O valor do carrinho foi atualizado!',
              className: 'bg-green-600 text-white border-green-700',
            })
          }
        }
      }
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar dados.')
      toast({
        title: 'Erro',
        description: e.message || 'Erro ao carregar dados.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [customerId])

  useEffect(() => {
    if (!customerId || !selectedShippingMethod || selectedShippingMethod === 'coleta') {
      setAvailableAddresses([])
      setSelectedAddressId(null)
      return
    }

    const fetchAddresses = async () => {
      setIsLoadingAddresses(true)
      setAddressError(null)
      try {
        const { data, error } = await supabase
          .from('customer_addresses')
          .select('*')
          .eq('customer_id', customerId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false })

        if (error) throw error

        let filtered = data || []
        const normalizeStr = (str: string | null) =>
          str
            ? str
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim()
            : ''

        if (selectedShippingMethod === 'miami') {
          filtered = filtered.filter((a) => {
            const isBr =
              normalizeStr(a.country) === 'brasil' || normalizeStr(a.country) === 'brazil'
            if (isBr) return false

            if (!a.latitude || !a.longitude) {
              return normalizeStr(a.city) === 'miami' || normalizeStr(a.city) === 'coral gables'
            }
            const dist = calculateHaversineDistance(
              warehouse.latitude || 25.7617,
              warehouse.longitude || -80.1918,
              a.latitude,
              a.longitude,
            )
            a._distance = dist
            return dist <= 50
          })
        } else if (selectedShippingMethod === 'usa') {
          filtered = filtered.filter((a) => {
            const isUs =
              normalizeStr(a.country) === 'usa' ||
              normalizeStr(a.country) === 'eua' ||
              normalizeStr(a.country) === 'estados unidos' ||
              normalizeStr(a.country) === 'united states'

            const isBr =
              normalizeStr(a.country) === 'brasil' || normalizeStr(a.country) === 'brazil'

            if (isBr) return false
            if (!isUs && !a.country) return false

            if (!a.latitude || !a.longitude) {
              return normalizeStr(a.city) !== 'miami' && normalizeStr(a.city) !== 'coral gables'
            }
            const dist = calculateHaversineDistance(
              warehouse.latitude || 25.7617,
              warehouse.longitude || -80.1918,
              a.latitude,
              a.longitude,
            )
            a._distance = dist
            return dist > 50
          })
        } else if (selectedShippingMethod === 'brasil') {
          filtered = filtered.filter(
            (a) =>
              (normalizeStr(a.country) === 'brasil' || normalizeStr(a.country) === 'brazil') &&
              normalizeStr(a.state) === 'sp',
          )
        }

        setAvailableAddresses(filtered)
        if (filtered.length > 0) {
          setSelectedAddressId(filtered[0].id)
        } else {
          setSelectedAddressId(null)
        }
      } catch (e: any) {
        setAddressError('Não foi possível carregar os endereços.')
      } finally {
        setIsLoadingAddresses(false)
      }
    }

    fetchAddresses()
  }, [selectedShippingMethod, customerId, warehouse])

  useEffect(() => {
    let timerId: NodeJS.Timeout
    const calculateShipping = async () => {
      if (!selectedShippingMethod || cart.length === 0) {
        setShippingCost(null)
        setShippingErrorMsg(null)
        return
      }

      if (selectedShippingMethod === 'coleta') {
        setShippingCost(0)
        setShippingErrorMsg(null)
        setUsingFallbacks(false)
        setUpsFailed(false)
        return
      }

      if (!selectedAddressId) {
        setShippingCost(null)
        setShippingErrorMsg(null)
        setUsingFallbacks(false)
        setUpsFailed(false)
        return
      }

      const addr = availableAddresses.find((a) => a.id === selectedAddressId)
      if (!addr) return

      setIsCalculatingShipping(true)
      setShippingErrorMsg(null)

      try {
        const payload = {
          delivery_type: selectedShippingMethod === 'brasil' ? 'sao_paulo' : selectedShippingMethod,
          address: {
            street: addr.street,
            number: addr.number,
            city: addr.city,
            state: addr.state,
            zip_code: addr.zip_code,
            country: addr.country,
          },
          cart_items: cart.map((item) => ({
            weight_lb: item.product.weight,
            dimensions: item.product.dimensions,
            quantity: item.quantity,
            price_usd: item.product.price_usd || 0,
          })),
        }

        const { data, error } = await supabase.functions.invoke('calculate-shipping', {
          body: payload,
        })
        if (error) {
          const errMessage = await extractEdgeFunctionError(error)
          throw new Error(errMessage)
        }
        if (data?.error) throw new Error(data.error)

        setShippingCost(data.shipping_cost || 0)
        setUsingFallbacks(!!data.using_fallbacks)
        setUpsFailed(!!data.ups_failed)
      } catch (e: any) {
        setShippingErrorMsg(e.message || 'Erro ao calcular frete')
        setShippingCost(null)
        setUsingFallbacks(false)
        setUpsFailed(false)
      } finally {
        setIsCalculatingShipping(false)
      }
    }

    timerId = setTimeout(calculateShipping, 500)
    return () => clearTimeout(timerId)
  }, [selectedShippingMethod, selectedAddressId, cart, availableAddresses])

  useEffect(() => {
    const timer = setTimeout(async () => {
      const q = supabase.from('products').select('*, manufacturers(name)').limit(20)
      if (search) q.ilike('name', `%${search}%`)
      const { data } = await q
      if (data) {
        const p = data.map((prod) => {
          const bestDiscount = getBestDiscount(
            activeDiscounts,
            prod.id,
            customer?.id || null,
            customer?.role || null,
            prod.price_usd || 0,
            prod.price_cost || 0,
          )
          if (bestDiscount.discountedPrice < (prod.price_usd || 0)) {
            prod.original_price = prod.price_usd
            prod.price_usd = bestDiscount.discountedPrice
          }
          return prod
        })
        setProducts(p)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [search, activeDiscounts, customer])

  const formatCurrency = (value: number) => {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  const subtotal = cart.reduce(
    (sum, item) => sum + (item.product.price_usd || 0) * item.quantity,
    0,
  )
  const discount = subtotal * (discountRate / 100)
  const couponDiscountUsd = appliedCoupon ? appliedCoupon.discount_amount : 0
  const totalDiscountUsd = discount + couponDiscountUsd

  const totalUsd = Math.max(0, subtotal - totalDiscountUsd) + (shippingCost || 0)

  const handleGenerateCoupon = async () => {
    const val = Number(couponValue)
    if (!val || val <= 0) {
      return toast({
        title: 'Erro',
        description: 'Valor deve ser maior que zero.',
        variant: 'destructive',
      })
    }

    let discount_amount = val
    if (couponType === 'percentage') {
      if (val > 100)
        return toast({
          title: 'Erro',
          description: 'Percentual não pode ser maior que 100%.',
          variant: 'destructive',
        })
      discount_amount = subtotal * (val / 100)
    }

    setGenerating(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-discount-coupon', {
        body: {
          cartItems: cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
          user_id: customer?.user_id,
          discount_amount,
        },
      })

      if (error) {
        const errMessage = await extractEdgeFunctionError(error)
        throw new Error(errMessage)
      }
      if (data?.error) throw new Error(data.error)

      setCouponCode(data.code)
      setAppliedCoupon({ code: data.code, discount_amount: data.discount_amount })
      setIsGeneratingCoupon(false)
      setCouponValue('')
      toast({ title: 'Sucesso', description: 'Cupom gerado com sucesso!' })
    } catch (e: any) {
      toast({
        title: 'Erro ao gerar cupom',
        description: e.message || 'Não foi possível gerar o cupom.',
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
    }
  }

  const handleApplyCoupon = async () => {
    if (!couponCode || couponCode.length < 3) {
      return toast({
        title: 'Erro',
        description: 'Digite um código válido.',
        variant: 'destructive',
      })
    }

    setValidating(true)
    try {
      const { data, error } = await supabase.functions.invoke('validate-discount-coupon', {
        body: { coupon_code: couponCode, subtotal },
      })

      if (error) {
        const errMessage = await extractEdgeFunctionError(error)
        throw new Error(errMessage)
      }
      if (data?.error) throw new Error(data.error)

      setAppliedCoupon({ code: data.code, discount_amount: data.discount_amount })
      toast({ title: 'Sucesso', description: 'Cupom aplicado com sucesso!' })
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message || 'Cupom inválido.', variant: 'destructive' })
      setAppliedCoupon(null)
    } finally {
      setValidating(false)
    }
  }

  const handleSave = async () => {
    if (!cart.length)
      return toast({ title: 'Erro', description: 'Carrinho vazio.', variant: 'destructive' })
    if (!paymentMethod)
      return toast({
        title: 'Erro',
        description: 'Selecione um método de pagamento.',
        variant: 'destructive',
      })
    if (!selectedShippingMethod)
      return toast({
        title: 'Erro',
        description: 'Selecione um método de entrega.',
        variant: 'destructive',
      })
    if (selectedShippingMethod !== 'coleta' && !selectedAddressId)
      return toast({ title: 'Erro', description: 'Selecione um endereço.', variant: 'destructive' })

    setSaving(true)
    try {
      const paymentMethodType =
        paymentMethod === 'credit_card'
          ? creditCardGateway === 'stripe'
            ? 'card'
            : 'paypal'
          : paymentMethod

      let dbShippingMethod = 'usa_cargo'
      if (selectedShippingMethod === 'coleta') dbShippingMethod = 'miami_pickup'
      if (selectedShippingMethod === 'brasil') dbShippingMethod = 'brazil_delivery'

      const orderPayload: any = {
        customer_id: customerId,
        order_number: `ORD-${Date.now().toString().slice(-6)}`,
        status: 'pending',
        subtotal,
        discount_amount: totalDiscountUsd,
        shipping_cost: shippingCost || 0,
        total: totalUsd,
        payment_method_type: paymentMethodType,
        shipping_method: dbShippingMethod,
      }

      if (selectedShippingMethod !== 'coleta' && selectedAddressId) {
        orderPayload.shipping_address_id = selectedAddressId
      }

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select()
        .single()
      if (orderErr) throw orderErr

      const items = cart.map((i) => ({
        order_id: order.id,
        product_id: i.product.id,
        quantity: i.quantity,
        unit_price: i.product.price_usd || 0,
        total_price: (i.product.price_usd || 0) * i.quantity,
      }))

      const { error: itemsErr } = await supabase.from('order_items').insert(items)
      if (itemsErr) throw itemsErr

      if (customer?.user_id) {
        await supabase.from('cart_items').delete().eq('user_id', customer.user_id)
      }

      if (appliedCoupon) {
        const { error: applyError } = await supabase.functions.invoke('apply-discount-coupon', {
          body: {
            coupon_code: appliedCoupon.code,
            order_id: order.id,
            discount_amount: appliedCoupon.discount_amount,
          },
        })
        if (applyError) {
          const errMessage = await extractEdgeFunctionError(applyError)
          throw new Error(errMessage)
        }
      }

      toast({
        title: 'Sucesso',
        description: `Pedido criado com sucesso para ${customer.full_name || customer.email}!`,
      })
      navigate('/admin/gerenciar-clientes')
    } catch (e: any) {
      toast({
        title: 'Erro ao salvar pedido',
        description: e.message || 'Não foi possível salvar o pedido.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading)
    return (
      <div className="p-8 space-y-4 max-w-7xl mx-auto">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    )

  if (error)
    return (
      <div className="p-8 flex flex-col items-center justify-center space-y-4 max-w-7xl mx-auto min-h-[50vh]">
        <p className="text-destructive font-bold text-lg">{error}</p>
        <Button onClick={loadData}>Tentar Novamente</Button>
      </div>
    )

  if (!customer)
    return <div className="p-8 text-center text-destructive font-bold">Cliente não encontrado</div>

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-7xl space-y-6">
      <div className="flex items-center gap-4 border-b pb-4">
        <Button variant="outline" size="icon" onClick={() => navigate('/admin/gerenciar-clientes')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            Checkout Assistido: {customer.full_name || 'Cliente sem nome'}
            <Badge
              variant={customer.role === 'admin' ? 'destructive' : 'default'}
              className="uppercase"
            >
              {customer.role}
            </Badge>
          </h1>
          <p className="text-muted-foreground">{customer.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="flex flex-col h-[75vh] min-h-[600px]">
          <CardHeader className="pb-3">
            <CardTitle>Selecionar Produtos</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <ScrollArea className="flex-1 px-6 pb-6">
            <div className="space-y-3">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border rounded-lg gap-4 bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium line-clamp-1" title={p.name}>
                        {p.name}
                      </p>
                      {p.is_discontinued && (
                        <Badge
                          variant="destructive"
                          className="text-[10px] h-4 px-1.5 uppercase shrink-0 font-bold"
                        >
                          Descontinuado
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      SKU: {p.sku || 'N/A'} | {p.manufacturers?.name || 'Genérico'}
                    </p>
                    <p className="text-sm font-semibold mt-1 flex items-center gap-2">
                      {p.original_price && (
                        <span className="line-through text-muted-foreground font-normal text-xs">
                          USD {formatCurrency(p.original_price)}
                        </span>
                      )}
                      <span className={p.original_price ? 'text-green-600' : ''}>
                        USD {formatCurrency(p.price_usd || 0)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="999"
                      value={quantities[p.id] || 1}
                      onChange={(e) =>
                        setQuantities({ ...quantities, [p.id]: parseInt(e.target.value) || 1 })
                      }
                      className="w-16 h-9"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        const qty = quantities[p.id] || 1
                        setCart((prev) =>
                          prev.find((i) => i.product.id === p.id)
                            ? prev.map((i) =>
                                i.product.id === p.id ? { ...i, quantity: i.quantity + qty } : i,
                              )
                            : [...prev, { product: p, quantity: qty }],
                        )
                        setQuantities({ ...quantities, [p.id]: 1 })
                      }}
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>
              ))}
              {!products.length && (
                <p className="text-center text-muted-foreground py-8">Nenhum produto encontrado.</p>
              )}
            </div>
          </ScrollArea>
        </Card>

        <Card className="flex flex-col h-[75vh] min-h-[600px] border-primary/20 shadow-md">
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Resumo do Pedido</span>
              <Badge variant="secondary" className="text-sm">
                {cart.length} {cart.length === 1 ? 'item' : 'itens'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            <div className="px-6 pt-2 space-y-3">
              {cart.map((item) => (
                <div
                  key={item.product.id}
                  className="flex justify-between items-center p-3 bg-muted/40 rounded-lg border border-muted"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium line-clamp-1" title={item.product.name}>
                        {item.product.name}
                      </p>
                      {item.product.is_discontinued && (
                        <Badge
                          variant="destructive"
                          className="text-[10px] h-4 px-1.5 uppercase shrink-0 font-bold"
                        >
                          Descontinuado
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.quantity}x USD {formatCurrency(item.product.price_usd || 0)}
                      {item.product.original_price && (
                        <span className="ml-2 text-xs text-green-600 font-medium">
                          (Desc. Aplicado)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm">
                      USD {formatCurrency(item.quantity * (item.product.price_usd || 0))}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive h-8 w-8"
                      onClick={() => setCart(cart.filter((i) => i.product.id !== item.product.id))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {!cart.length && (
                <div className="text-center py-12 text-muted-foreground flex flex-col items-center justify-center">
                  <ShoppingCart className="w-16 h-16 mb-4 opacity-20" />
                  <p>Carrinho vazio</p>
                </div>
              )}
            </div>

            <div className="p-4 border rounded-lg bg-card space-y-4 mt-6 mx-6 mb-4">
              <h3 className="font-semibold text-sm">Método de Entrega</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="shippingMethod"
                    value="miami"
                    checked={selectedShippingMethod === 'miami'}
                    onChange={(e) => setSelectedShippingMethod(e.target.value as any)}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm font-medium">Miami (Até 50km do Galpão)</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="shippingMethod"
                    value="usa"
                    checked={selectedShippingMethod === 'usa'}
                    onChange={(e) => setSelectedShippingMethod(e.target.value as any)}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm font-medium">EUA (Fora do raio de 50km)</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="shippingMethod"
                    value="brasil"
                    checked={selectedShippingMethod === 'brasil'}
                    onChange={(e) => setSelectedShippingMethod(e.target.value as any)}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm font-medium">Brasil - São Paulo</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="shippingMethod"
                    value="coleta"
                    checked={selectedShippingMethod === 'coleta'}
                    onChange={(e) => setSelectedShippingMethod(e.target.value as any)}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm font-medium">Coleta Local (Miami)</span>
                </label>
              </div>

              {selectedShippingMethod && selectedShippingMethod !== 'coleta' && (
                <div className="mt-4 pt-4 border-t space-y-4 animate-in slide-in-from-top-2">
                  <h4 className="text-sm font-medium">Endereço de Entrega</h4>
                  {isLoadingAddresses ? (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Carregando endereços...
                    </p>
                  ) : addressError ? (
                    <div className="space-y-2">
                      <p className="text-sm text-destructive">{addressError}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedShippingMethod(selectedShippingMethod)}
                      >
                        Tentar novamente
                      </Button>
                    </div>
                  ) : availableAddresses.length > 0 ? (
                    <div className="space-y-3">
                      <Select value={selectedAddressId || ''} onValueChange={setSelectedAddressId}>
                        <SelectTrigger className="h-auto py-3">
                          <SelectValue placeholder="Selecione o endereço de entrega" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {availableAddresses.map((addr) => (
                            <SelectItem
                              key={addr.id}
                              value={addr.id}
                              className="py-3 cursor-pointer"
                            >
                              <div className="flex flex-col text-left gap-1">
                                <span className="font-medium text-sm flex items-center gap-2">
                                  {addr.street}, {addr.number}{' '}
                                  {addr.complement ? `- ${addr.complement}` : ''}
                                  {addr._distance !== undefined && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] py-0 px-1.5 h-4 bg-muted flex items-center gap-1 font-mono"
                                    >
                                      <MapPin className="w-2 h-2" /> {addr._distance.toFixed(1)} km
                                    </Badge>
                                  )}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {addr.neighborhood} • {addr.city}/{addr.state} ({addr.zip_code}) -{' '}
                                  {addr.country}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="link" className="px-0 h-auto text-sm">
                        Adicionar novo endereço
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Nenhum endereço compatível com {selectedShippingMethod.toUpperCase()}{' '}
                        disponível.
                      </p>
                      <Button variant="outline" size="sm">
                        Adicionar novo endereço
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border rounded-lg bg-card space-y-3 mx-6 mb-4">
              <h3 className="font-semibold text-sm">Cupom de Desconto (Opcional)</h3>
              {appliedCoupon ? (
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
                  <div className="text-sm text-green-700 font-medium">
                    Cupom <span className="font-bold">{appliedCoupon.code}</span>: -USD{' '}
                    {formatCurrency(appliedCoupon.discount_amount)}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-green-700"
                    onClick={() => {
                      setAppliedCoupon(null)
                      setCouponCode('')
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Input
                    placeholder="Código do cupom"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={handleApplyCoupon}
                      disabled={validating || !couponCode}
                    >
                      {validating ? 'Aplicando...' : 'Aplicar'}
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => setIsGeneratingCoupon(true)}
                    >
                      Gerar Cupom
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="mx-6 mb-4 p-4 border-2 border-primary/10 rounded-xl bg-muted/10 space-y-2.5">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal:</span>
                <span className="font-mono">USD {formatCurrency(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-green-600 font-medium">
                  <span>Desconto Cliente ({discountRate}%):</span>
                  <span className="font-mono">- USD {formatCurrency(discount)}</span>
                </div>
              )}
              {appliedCoupon && (
                <div className="flex justify-between text-sm text-green-600 font-medium">
                  <span>Desconto Cupom:</span>
                  <span className="font-mono">
                    - USD {formatCurrency(appliedCoupon.discount_amount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">Frete:</span>
                {isCalculatingShipping ? (
                  <span className="flex items-center gap-2 text-primary font-medium text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" /> Calculando...
                  </span>
                ) : shippingCost !== null ? (
                  <span className="font-mono font-medium">USD {formatCurrency(shippingCost)}</span>
                ) : (
                  <span className="text-muted-foreground/60 text-xs">Pendente</span>
                )}
              </div>
              {usingFallbacks && !upsFailed && (
                <div className="text-[11px] text-amber-600 bg-amber-500/10 p-2 rounded border border-amber-500/20 mt-1 leading-tight">
                  Atenção: Alguns produtos não possuem peso/dimensões. O frete foi calculado com
                  valores padrão.
                </div>
              )}
              {upsFailed && (
                <div className="text-[11px] text-amber-600 bg-amber-500/10 p-2 rounded border border-amber-500/20 mt-1 leading-tight">
                  O frete está sendo calculado com base na tabela de contingência devido à
                  indisponibilidade temporária da transportadora.
                </div>
              )}
              {shippingErrorMsg && (
                <div className="text-xs text-destructive text-right font-medium">
                  {shippingErrorMsg}
                </div>
              )}
              <div className="w-full h-px bg-border/60 my-2" />
              <div className="flex justify-between items-center">
                <span className="font-bold text-lg">Total do Pedido:</span>
                <span className="text-primary font-bold text-2xl tracking-tight font-mono">
                  USD {formatCurrency(totalUsd)}
                </span>
              </div>
            </div>

            <div className="p-4 border rounded-lg bg-card space-y-4 mx-6 mb-6">
              <h3 className="font-semibold text-sm">Método de Pagamento</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="credit_card"
                    checked={paymentMethod === 'credit_card'}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm font-medium">Cartão de Crédito</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="pix"
                    checked={paymentMethod === 'pix'}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm font-medium">Pix</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="transfer"
                    checked={paymentMethod === 'transfer'}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm font-medium">Transferência / Zelle</span>
                </label>
              </div>
              {paymentMethod === 'credit_card' && (
                <div className="pl-7 space-y-4 animate-in slide-in-from-top-2">
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="gateway"
                        value="stripe"
                        checked={creditCardGateway === 'stripe'}
                        onChange={(e) => setCreditCardGateway(e.target.value as any)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Stripe</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="gateway"
                        value="paypal"
                        checked={creditCardGateway === 'paypal'}
                        onChange={(e) => setCreditCardGateway(e.target.value as any)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">PayPal</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-4 border-t bg-card">
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigate('/admin/gerenciar-clientes')}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 text-lg font-bold shadow-md"
                size="lg"
                onClick={handleSave}
                disabled={
                  saving ||
                  !cart.length ||
                  !paymentMethod ||
                  !selectedShippingMethod ||
                  (selectedShippingMethod !== 'coleta' && !selectedAddressId) ||
                  isCalculatingShipping ||
                  shippingErrorMsg !== null
                }
              >
                {saving ? 'Finalizando...' : 'Concluir Pedido'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {isGeneratingCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md animate-in zoom-in-95">
            <CardHeader>
              <CardTitle>Gerar Cupom</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={couponType === 'percentage'}
                    onChange={() => setCouponType('percentage')}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm font-medium">Percentual (%)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={couponType === 'fixed'}
                    onChange={() => setCouponType('fixed')}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm font-medium">Valor Fixo (USD)</span>
                </label>
              </div>
              <Input
                type="number"
                value={couponValue}
                onChange={(e) => setCouponValue(e.target.value ? Number(e.target.value) : '')}
                placeholder={couponType === 'percentage' ? 'Valor em %' : 'Valor em USD'}
              />
            </CardContent>
            <CardFooter className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsGeneratingCoupon(false)}>
                Cancelar
              </Button>
              <Button onClick={handleGenerateCoupon} disabled={generating || !couponValue}>
                {generating ? 'Gerando...' : 'Gerar Cupom'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  )
}
