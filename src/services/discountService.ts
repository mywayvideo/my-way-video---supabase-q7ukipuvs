import { supabase } from '@/lib/supabase/client'
import { DiscountRule } from '@/types/discount'

let cachedRules: DiscountRule[] | null = null
let lastFetchTime = 0
const TTL = 5 * 60 * 1000

let rulesPromise: Promise<DiscountRule[]> | null = null

export const discountService = {
  async getDiscounts(): Promise<any[]> {
    const { data, error } = await supabase
      .from('discounts')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async createDiscount(payload: any): Promise<any> {
    const payloadWithId = {
      id: crypto.randomUUID(),
      ...payload,
    }

    const cleanPayload = Object.fromEntries(
      Object.entries(payloadWithId).filter(([_, v]) => v !== undefined),
    )

    const { data, error } = await supabase
      .from('discounts')
      .insert([cleanPayload])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateDiscount(id: string, payload: any): Promise<any> {
    const { data, error } = await supabase
      .from('discounts')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteDiscount(id: string): Promise<boolean> {
    const { error } = await supabase.from('discounts').delete().eq('id', id)
    if (error) throw error
    return true
  },

  async getProductsForSelection(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await supabase
      .from('products')
      .select('id, name')
      .order('name', { ascending: true })
    if (error) throw error
    return data || []
  },

  async fetchActiveRules(): Promise<DiscountRule[]> {
    const now = Date.now()
    if (cachedRules && now - lastFetchTime < TTL) {
      return cachedRules
    }

    if (rulesPromise) return rulesPromise

    rulesPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('discount_rules')
          .select('*')
          .eq('is_active', true)

        if (error) throw error

        cachedRules = data as DiscountRule[]
        lastFetchTime = Date.now()
        return cachedRules
      } catch (err) {
        console.error('Erro ao buscar regras de desconto:', err)
        return []
      } finally {
        rulesPromise = null
      }
    })()

    return rulesPromise
  },

  clearCache() {
    cachedRules = null
    lastFetchTime = 0
  },

  async calculateBestDiscount(
    product: any,
    userRole: string | null,
    userCustomerId: string | null,
  ) {
    const basePrice = product?.price_usd ?? product?.price_nationalized_sales ?? null

    if (!product || basePrice == null || !userRole || !userCustomerId) {
      return {
        originalPrice: basePrice || 0,
        discountedPrice: null,
        discountPercentage: null,
        discountAmount: null,
        appliedRule: null,
      }
    }

    try {
      const rules = await this.fetchActiveRules()
      let bestRule: DiscountRule | null = null
      let maxDiscountAmount = 0

      const now = new Date()

      for (const rule of rules) {
        if (rule.start_date && new Date(rule.start_date) > now) continue
        if (rule.end_date && new Date(rule.end_date) < now) continue

        let appliesToUser = false
        const appType = rule.application_type || ''

        if (appType === 'Por Regra de Cliente' || appType === 'por_regra_de_cliente') {
          if (!rule.role || rule.role === userRole) appliesToUser = true
        } else if (appType === 'Clientes Especificos' || appType === 'clientes_especificos') {
          if (rule.customers && rule.customers.includes(userCustomerId)) appliesToUser = true
        } else {
          appliesToUser = true
        }

        if (!appliesToUser) continue

        let appliesToProduct = false
        const scopeData = rule.scope_data as any

        if (rule.scope_type === 'all_products') {
          appliesToProduct = true
        } else if (rule.scope_type === 'by_manufacturer' && product.manufacturer_id) {
          if (Array.isArray(scopeData) && scopeData.includes(product.manufacturer_id))
            appliesToProduct = true
        } else if (rule.scope_type === 'by_category' && product.category) {
          if (Array.isArray(scopeData) && scopeData.includes(product.category))
            appliesToProduct = true
        } else if (rule.scope_type === 'by_manufacturer_category') {
          if (
            scopeData &&
            Array.isArray(scopeData.manufacturers) &&
            Array.isArray(scopeData.categories)
          ) {
            if (
              scopeData.manufacturers.includes(product.manufacturer_id) ||
              scopeData.categories.includes(product.category)
            ) {
              appliesToProduct = true
            }
          }
        } else if (rule.scope_type === 'individual_products') {
          if (Array.isArray(scopeData) && scopeData.includes(product.id)) appliesToProduct = true
        }

        if (!appliesToProduct) continue

        let discountAmount = 0
        const val = rule.discount_value || 0
        const price = basePrice

        if (
          rule.discount_calculation_type === 'margin_percentage' ||
          rule.discount_calculation_type === 'price_usa_percentage'
        ) {
          discountAmount = price * (val / 100)
        } else {
          discountAmount = price * (val / 100)
        }

        if (discountAmount > maxDiscountAmount) {
          maxDiscountAmount = discountAmount
          bestRule = rule
        }
      }

      if (bestRule && maxDiscountAmount > 0) {
        return {
          originalPrice: basePrice,
          discountedPrice: basePrice - maxDiscountAmount,
          discountPercentage: bestRule.discount_value,
          discountAmount: maxDiscountAmount,
          appliedRule: bestRule,
        }
      }
    } catch (err) {
      console.error('Error calculating discount:', err)
    }

    return {
      originalPrice: basePrice || 0,
      discountedPrice: null,
      discountPercentage: null,
      discountAmount: null,
      appliedRule: null,
    }
  },
}
