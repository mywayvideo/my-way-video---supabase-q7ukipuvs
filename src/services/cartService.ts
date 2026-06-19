import { supabase } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'

export const cartService = {
  async getOrCreateCartId(userId: string) {
    try {
      let { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()

      let customerId = userId
      if (customer) {
        customerId = customer.id
      } else {
        const { data: user } = await supabase.auth.getUser()
        const { data: newCustomer, error: cErr } = await supabase
          .from('customers')
          .insert({ user_id: userId, email: user?.user?.email })
          .select('id')
          .single()
        if (!cErr && newCustomer) customerId = newCustomer.id
      }

      let { data: cart } = await supabase
        .from('shopping_carts')
        .select('id')
        .eq('customer_id', customerId)
        .maybeSingle()

      if (cart) return cart.id

      const { data: newCart, error: cartErr } = await supabase
        .from('shopping_carts')
        .insert({ customer_id: customerId })
        .select('id')
        .single()

      if (cartErr) throw cartErr
      return newCart?.id
    } catch (e) {
      console.error('Error in getOrCreateCartId:', e)
      throw e
    }
  },

  async fetchCart(userId: string) {
    try {
      const cartId = await this.getOrCreateCartId(userId)
      if (!cartId) return []

      let attempt = 0
      const maxRetries = 3
      const baseDelay = 1000

      while (true) {
        const { data: cartItems, error } = await supabase
          .from('cart_items')
          .select('*, product:products(*)')
          .eq('cart_id', cartId)

        if (error) {
          const isServiceUnavailable =
            error.code === 'PGRST002' ||
            error.message?.includes('503') ||
            error.code === '503' ||
            (error as any).status === 503

          if (isServiceUnavailable && attempt < maxRetries) {
            attempt++
            console.warn(
              `Database schema cache issue (PGRST002/503) encountered. Retrying fetchCart (${attempt}/${maxRetries})...`,
            )
            await new Promise((resolve) =>
              setTimeout(resolve, baseDelay * Math.pow(2, attempt - 1)),
            )
            continue
          }
          throw error
        }

        return cartItems || []
      }
    } catch (e) {
      console.error('Error in fetchCart:', e)
      // Return safely to avoid propagating fatal errors that could cause UI crashes
      toast({
        title: 'Aviso',
        description:
          'Serviço temporariamente indisponível. Seu carrinho pode não estar atualizado.',
        variant: 'destructive',
      })
      return []
    }
  },

  async addToCart(userId: string, productId: string, quantity: number) {
    try {
      const cartId = await this.getOrCreateCartId(userId)
      if (!cartId) return

      const { data: existingItems, error: findErr } = await supabase
        .from('cart_items')
        .select('*')
        .eq('cart_id', cartId)
        .eq('product_id', productId)

      if (findErr) throw findErr

      if (existingItems && existingItems.length > 0) {
        const existingItem = existingItems[0]
        const { error: updateErr } = await supabase
          .from('cart_items')
          .update({ quantity: existingItem.quantity + quantity })
          .eq('id', existingItem.id)
        if (updateErr) throw updateErr
      } else {
        const { error: insertErr } = await supabase
          .from('cart_items')
          .insert({ cart_id: cartId, product_id: productId, quantity, user_id: userId })
        if (insertErr) throw insertErr
      }
    } catch (e) {
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar carrinho. Tente novamente.',
        variant: 'destructive',
      })
      throw e
    }
  },

  async removeFromCart(itemId: string) {
    try {
      const { error } = await supabase.from('cart_items').delete().eq('id', itemId)
      if (error) throw error
    } catch (e) {
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar carrinho. Tente novamente.',
        variant: 'destructive',
      })
      throw e
    }
  },

  async updateQuantity(itemId: string, quantity: number) {
    try {
      if (quantity <= 0) {
        return this.removeFromCart(itemId)
      }
      const { error } = await supabase.from('cart_items').update({ quantity }).eq('id', itemId)
      if (error) throw error
    } catch (e) {
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar carrinho. Tente novamente.',
        variant: 'destructive',
      })
      throw e
    }
  },

  async clearCart(userId: string) {
    try {
      const cartId = await this.getOrCreateCartId(userId)
      if (!cartId) return
      const { error } = await supabase.from('cart_items').delete().eq('cart_id', cartId)
      if (error) throw error
      localStorage.removeItem('cart')
      localStorage.removeItem('myway_local_cart')
    } catch (e) {
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar carrinho. Tente novamente.',
        variant: 'destructive',
      })
      throw e
    }
  },

  async syncLocalCart(userId: string, localItems: any[]) {
    if (!localItems || localItems.length === 0) return
    try {
      for (const item of localItems) {
        await this.addToCart(userId, item.product_id, item.quantity)
      }
    } catch (e) {
      console.error('Error syncing local cart:', e)
    }
  },
}
