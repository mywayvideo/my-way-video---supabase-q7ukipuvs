import { supabase } from '@/lib/supabase/client'
import {
  Customer,
  CustomerAddress,
  Order,
  Favorite,
  CartItem,
  DiscountRuleCustomer,
} from '@/types/customer'

export const customerService = {
  // Existing Methods
  async getProfile(): Promise<Customer | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || !user.id) {
      throw new Error('not_logged_in')
    }

    const { data, error } = await supabase
      .from('customers')
      .select(
        'id, full_name, email, phone, role, status, created_at, profile_photo_url, cpf, date_of_birth, gender, company_name',
      )
      .eq('user_id', user.id)
      .single()

    if (error) throw error

    return {
      ...data,
      email: user.email,
    } as Customer
  },

  async updateProfile(id: string, updates: Partial<Customer>): Promise<void> {
    const sanitizedUpdates = { ...updates }

    if (sanitizedUpdates.date_of_birth === '') sanitizedUpdates.date_of_birth = null
    if (sanitizedUpdates.gender === '') sanitizedUpdates.gender = null
    if (sanitizedUpdates.company_name === '') sanitizedUpdates.company_name = null
    if (sanitizedUpdates.cpf === '') sanitizedUpdates.cpf = null

    if (sanitizedUpdates.email) {
      const { error } = await supabase.auth.updateUser({ email: sanitizedUpdates.email })
      if (error) {
        if (error.message.includes('already registered')) {
          throw new Error('email_in_use')
        }
        throw new Error('network_error')
      }
      delete sanitizedUpdates.email
    }

    if (Object.keys(sanitizedUpdates).length > 0) {
      const { error } = await supabase.from('customers').update(sanitizedUpdates).eq('id', id)

      if (error) throw new Error('network_error')
    }
  },

  async getAddresses(customerId: string): Promise<CustomerAddress[]> {
    const { data, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .neq('street', 'COLETA NA MY WAY')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw new Error('network_error')
    return data as CustomerAddress[]
  },

  async addAddress(
    address: Omit<CustomerAddress, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<string | null> {
    if (address.is_default) {
      await supabase
        .from('customer_addresses')
        .update({ is_default: false })
        .eq('customer_id', address.customer_id)
    }

    const { data, error } = await supabase
      .from('customer_addresses')
      .insert([address])
      .select('id')
      .single()
    if (error) throw new Error('network_error')
    return data?.id || null
  },

  async updateAddress(id: string, updates: Partial<CustomerAddress>): Promise<void> {
    if (updates.is_default) {
      const { data } = await supabase
        .from('customer_addresses')
        .select('customer_id')
        .eq('id', id)
        .single()
      if (data) {
        await supabase
          .from('customer_addresses')
          .update({ is_default: false })
          .eq('customer_id', data.customer_id)
      }
    }

    const { error } = await supabase.from('customer_addresses').update(updates).eq('id', id)
    if (error) throw new Error('network_error')
  },

  async deleteAddress(id: string): Promise<void> {
    const { error } = await supabase.from('customer_addresses').delete().eq('id', id)
    if (error) throw new Error('address_not_found')
  },

  async uploadProfilePhoto(userId: string, file: File): Promise<string> {
    const fileExt = file.name.split('.').pop()
    const filePath = `${userId}/profile-${Date.now()}.${fileExt}`

    const { error } = await supabase.storage
      .from('profiles')
      .upload(filePath, file, { upsert: true })
    if (error) throw new Error('network_error')

    const { data } = supabase.storage.from('profiles').getPublicUrl(filePath)
    return data.publicUrl
  },

  // New Requested Methods
  async fetchCustomerData(userId: string): Promise<Customer | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || !user.id) {
      throw new Error('NOT_LOGGED_IN')
    }

    const { data, error } = await supabase
      .from('customers')
      .select(
        'id, full_name, email, phone, role, status, created_at, profile_photo_url, cpf, date_of_birth, gender, company_name',
      )
      .eq('user_id', user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') throw new Error('PGRST116')
      if (error.code === '42501' || error.message.includes('403') || error.code === '403')
        throw new Error('403')
      throw error
    }

    return { ...data, email: user.email } as Customer
  },

  async fetchCustomerAddresses(customerId: string): Promise<CustomerAddress[]> {
    return this.getAddresses(customerId)
  },

  async fetchFavorites(customerId: string): Promise<Favorite[]> {
    const { data, error } = await supabase
      .from('customer_favorites')
      .select(`
        *,
        products (
          id, name, price_usd, image_url, category, manufacturer_id
        )
      `)
      .eq('customer_id', customerId)
    if (error) throw error
    return data as any[]
  },

  async fetchCartItems(customerId: string): Promise<CartItem[]> {
    const { data: cart } = await supabase
      .from('shopping_carts')
      .select('id')
      .eq('customer_id', customerId)
      .maybeSingle()
    if (!cart) return []

    const { data, error } = await supabase
      .from('cart_items')
      .select(`
        *,
        products (
          id, name, price_usd, image_url, category, manufacturer_id
        )
      `)
      .eq('cart_id', cart.id)
      .order('added_at', { ascending: false })
    if (error) throw error
    return data as any[]
  },

  async fetchOrders(customerId: string, page: number = 1, limit: number = 10): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          products (
            id, name, price_usd, image_url
          )
        )
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)
    if (error) throw error
    return data as any[]
  },

  async fetchDiscounts(customerId: string): Promise<DiscountRuleCustomer[]> {
    const { data, error } = await supabase
      .from('discount_rule_customers')
      .select(`
        *,
        discount_rules (*)
      `)
      .eq('customer_id', customerId)
    if (error) throw error
    return data as any[]
  },

  async updateCustomerData(customerId: string, data: Partial<Customer>): Promise<void> {
    const sanitizedData = { ...data }

    if (sanitizedData.date_of_birth === '') sanitizedData.date_of_birth = null
    if (sanitizedData.gender === '') sanitizedData.gender = null
    if (sanitizedData.company_name === '') sanitizedData.company_name = null
    if (sanitizedData.cpf === '') sanitizedData.cpf = null

    await this.updateProfile(customerId, sanitizedData)
  },

  async removeFavorite(customerId: string, productId: string): Promise<void> {
    const { error } = await supabase
      .from('customer_favorites')
      .delete()
      .eq('customer_id', customerId)
      .eq('product_id', productId)
    if (error) throw error
  },

  async addToCart(customerId: string, productId: string, quantity: number): Promise<void> {
    let { data: cart } = await supabase
      .from('shopping_carts')
      .select('id')
      .eq('customer_id', customerId)
      .maybeSingle()
    if (!cart) {
      const { data: newCart, error } = await supabase
        .from('shopping_carts')
        .insert([{ customer_id: customerId }])
        .select('id')
        .single()
      if (error) throw error
      cart = newCart
    }
    const { data: existing } = await supabase
      .from('cart_items')
      .select('*')
      .eq('cart_id', cart.id)
      .eq('product_id', productId)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: existing.quantity + quantity })
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('cart_items')
        .insert([{ cart_id: cart.id, product_id: productId, quantity }])
      if (error) throw error
    }
  },

  async removeFromCart(cartItemId: string): Promise<void> {
    const { error } = await supabase.from('cart_items').delete().eq('id', cartItemId)
    if (error) throw error
  },

  async updateCartQuantity(cartItemId: string, quantity: number): Promise<void> {
    if (quantity <= 0) {
      await this.removeFromCart(cartItemId)
      return
    }
    const { error } = await supabase.from('cart_items').update({ quantity }).eq('id', cartItemId)
    if (error) throw error
  },

  async removeFromOrder(orderId: string): Promise<void> {
    const { data: order } = await supabase
      .from('orders')
      .select('customer_id')
      .eq('id', orderId)
      .single()
    if (!order) return
    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', orderId)
    if (items) {
      for (const item of items) {
        await this.addToCart(order.customer_id, item.product_id, item.quantity)
      }
    }
  },
}
