import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { toast } from '@/hooks/use-toast'
import { cartService } from '@/services/cartService'

interface CartItem {
  id: string
  product_id: string
  quantity: number
  product?: any
}

interface CartContextType {
  items: CartItem[]
  addToCart: (productId: string, quantity?: number, product?: any) => Promise<void>
  removeFromCart: (itemId: string, productId?: string) => Promise<void>
  updateQuantity: (itemId: string, quantity: number, productId?: string) => Promise<void>
  clearCart: () => Promise<void>
  isLoading: boolean
  totalItems: number
}

const CartContext = createContext<CartContextType | undefined>(undefined)

const LOCAL_CART_KEY = 'myway_local_cart'

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { user } = useAuth()

  const loadLocalCart = useCallback(() => {
    try {
      const local = localStorage.getItem(LOCAL_CART_KEY)
      if (local) {
        return JSON.parse(local)
      }
    } catch (e) {
      console.error('Error parsing local cart', e)
    }
    return []
  }, [])

  const saveLocalCart = useCallback((newItems: CartItem[]) => {
    try {
      localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(newItems))
      setItems(newItems)
    } catch (e) {
      console.error('Error saving local cart', e)
    }
  }, [])

  const fetchCart = useCallback(async () => {
    if (user) {
      setIsLoading(true)
      try {
        const localCart = loadLocalCart()
        if (localCart.length > 0) {
          await cartService.syncLocalCart(user.id, localCart)
          localStorage.removeItem(LOCAL_CART_KEY)
        }
        const dbItems = await cartService.fetchCart(user.id)
        setItems(dbItems)
      } catch (e) {
        console.error(e)
      } finally {
        setIsLoading(false)
      }
    } else {
      setItems(loadLocalCart())
    }
  }, [user, loadLocalCart])

  useEffect(() => {
    fetchCart()
  }, [fetchCart])

  const addToCart = async (productId: string, quantity = 1, product?: any) => {
    let p = product
    if (!p) {
      try {
        const { data } = await supabase.from('products').select('*').eq('id', productId).single()
        p = data
      } catch (e) {
        console.error('Error fetching product for cart validation:', e)
      }
    }

    if (p) {
      const hasPrice =
        (p.price_usd && p.price_usd > 0) ||
        (p.price_nationalized_sales && p.price_nationalized_sales > 0)
      if (!hasPrice) {
        toast({
          title: 'Atenção',
          description:
            'Este item requer consultoria técnica. Redirecionando para um especialista...',
        })
        const msg = encodeURIComponent(
          `Olá, gostaria de uma cotação personalizada para o produto: ${p.name}`,
        )
        window.open(`https://wa.me/5561981815050?text=${msg}`, '_blank')
        return
      }
    }

    setIsLoading(true)
    try {
      if (user) {
        await cartService.addToCart(user.id, productId, quantity)
        const dbItems = await cartService.fetchCart(user.id)
        setItems(dbItems)
        toast({ title: 'Sucesso', description: 'Produto adicionado ao carrinho.' })
      } else {
        const currentItems = loadLocalCart()
        const existing = currentItems.find((i: any) => i.product_id === productId)
        if (existing) {
          existing.quantity += quantity
        } else {
          currentItems.push({
            id: `local_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            product_id: productId,
            quantity,
            product: p,
          })
        }
        saveLocalCart(currentItems)
        toast({ title: 'Sucesso', description: 'Produto adicionado ao carrinho.' })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  const removeFromCart = async (itemId: string, productId?: string) => {
    setIsLoading(true)
    try {
      if (user) {
        await cartService.removeFromCart(itemId)
        const dbItems = await cartService.fetchCart(user.id)
        setItems(dbItems)
      } else {
        const currentItems = loadLocalCart()
        const newItems = currentItems.filter((i: any) => i.id !== itemId)
        saveLocalCart(newItems)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  const updateQuantity = async (itemId: string, quantity: number, productId?: string) => {
    setIsLoading(true)
    try {
      if (user) {
        if (quantity <= 0) {
          await cartService.removeFromCart(itemId)
        } else {
          await cartService.updateQuantity(itemId, quantity)
        }
        const dbItems = await cartService.fetchCart(user.id)
        setItems(dbItems)
      } else {
        let currentItems = loadLocalCart()
        if (quantity <= 0) {
          currentItems = currentItems.filter((i: any) => i.id !== itemId)
        } else {
          const item = currentItems.find((i: any) => i.id === itemId)
          if (item) item.quantity = quantity
        }
        saveLocalCart(currentItems)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  const clearCart = async () => {
    setIsLoading(true)
    try {
      if (user) {
        await cartService.clearCart(user.id)
        setItems([])
      } else {
        saveLocalCart([])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <CartContext.Provider
      value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, isLoading, totalItems }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
