import { useSyncExternalStore, useMemo, ReactNode } from 'react'
import { useApplyDiscount } from '@/hooks/useApplyDiscount'

export interface CartItem {
  id: string
  name: string
  price: number
  original_price?: number
  cost_price?: number
  image_url?: string
  quantity: number
  originalPrice?: number
  discountRule?: string | null
  isRebateActive?: boolean
}

class CartStore {
  private items: CartItem[] = []
  private listeners: Set<() => void> = new Set()

  constructor() {
    try {
      const stored = localStorage.getItem('mw-video-cart')
      if (stored) {
        this.items = JSON.parse(stored)
      }
    } catch (e) {
      console.error('Failed to load cart', e)
    }
  }

  private notify() {
    try {
      localStorage.setItem('mw-video-cart', JSON.stringify(this.items))
    } catch (e) {
      console.warn('Failed to save cart to localStorage', e)
    }
    this.listeners.forEach((l) => l())
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.items

  addItem = (item: CartItem) => {
    const existing = this.items.find((i) => i.id === item.id)
    if (existing) {
      this.items = this.items.map((i) =>
        i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i,
      )
    } else {
      this.items = [...this.items, item]
    }
    this.notify()
  }

  removeItem = (id: string) => {
    this.items = this.items.filter((i) => i.id !== id)
    this.notify()
  }

  updateQuantity = (id: string, quantity: number) => {
    this.items = this.items.map((i) => (i.id === id ? { ...i, quantity } : i))
    this.notify()
  }

  clearCart = () => {
    this.items = []
    this.notify()
  }

  validateCartRebates = async () => {
    try {
      const { supabase } = await import('@/lib/supabase/client')
      const { toast } = await import('@/hooks/use-toast')
      const { data: products } = await supabase
        .from('products')
        .select('id, price_usa_rebate, date_rebate')
        .in(
          'id',
          this.items.map((i) => i.id),
        )

      if (products) {
        let hasExpired = false
        const now = new Date()

        this.items = this.items.map((item) => {
          const p = products.find((prod) => prod.id === item.id)
          if (p) {
            const isActiveNow =
              p.price_usa_rebate > 0 && (!p.date_rebate || new Date(p.date_rebate) >= now)
            if (item.isRebateActive && !isActiveNow) {
              hasExpired = true
              item.isRebateActive = false
            }
          }
          return item
        })

        if (hasExpired) {
          this.notify()
          toast({
            title: 'Atenção',
            description:
              'Um ou mais rebates expiraram. Os preços no carrinho foram atualizados para o valor padrão.',
            variant: 'destructive',
          })
        }
      }
    } catch (e) {
      console.error('Failed to validate rebates', e)
    }
  }
}

const cartStore = new CartStore()

export function useCartStore() {
  const rawItems = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot)
  const { calculateDiscount } = useApplyDiscount()

  const items = useMemo(() => {
    return rawItems.map((item) => {
      const calc = calculateDiscount(
        item.id,
        item.original_price || item.price,
        item.cost_price || 0,
      )
      return {
        ...item,
        price: calc.discountedPrice, // Automatically updates the cart display with new price
        originalPrice: calc.originalPrice,
        discountRule: calc.ruleName,
      }
    })
  }, [rawItems, calculateDiscount])

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const subtotal = items.reduce(
    (sum, item) => sum + (item.originalPrice || item.price) * item.quantity,
    0,
  )
  const discountTotal = subtotal - totalPrice

  return {
    items,
    subtotal,
    discountTotal,
    addItem: cartStore.addItem,
    removeItem: cartStore.removeItem,
    updateQuantity: cartStore.updateQuantity,
    clearCart: cartStore.clearCart,
    validateCartRebates: cartStore.validateCartRebates,
    totalItems,
    totalPrice,
  }
}

// Dummy provider for backward compatibility
export function CartProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
