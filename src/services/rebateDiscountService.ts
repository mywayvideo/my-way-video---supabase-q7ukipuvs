import { supabase } from '@/lib/supabase/client'

export interface RebateDiscountRuleParams {
  productId: string
  productName: string
  discountType: 'price_usa_percentage' | 'percentage' | 'fixed' | 'fixed_amount'
  discountValue: number
  startDate: string // ISO string
  endDate: string // ISO string
  isActive?: boolean
  existingDiscountId?: string | null
}

export interface ExistingRebateRule {
  id: string
  name: string
  discount_type: string
  discount_value: number
  start_date: string | null
  end_date: string | null
  is_active: boolean | null
  product_selection: any
}

export const rebateDiscountService = {
  /**
   * Procura se já existe uma regra "Rebate Fabricante" ativa ou associada ao produto
   */
  async findActiveRebateRule(productId: string): Promise<ExistingRebateRule | null> {
    try {
      const { data, error } = await (supabase.from('discounts') as any)
        .select(
          'id, name, discount_type, discount_value, start_date, end_date, is_active, product_selection',
        )
        .eq('name', 'Rebate Fabricante')
        .order('created_at', { ascending: false })

      if (error || !data) return null

      // Procura regra cujo product_selection contenha este produto
      const match = data.find((rule: any) => {
        if (!rule.product_selection) return false
        if (Array.isArray(rule.product_selection)) {
          return rule.product_selection.includes(productId)
        }
        return false
      })

      return match || null
    } catch (err) {
      console.warn('Erro ao verificar regra de rebate existente:', err)
      return null
    }
  },

  /**
   * Salva ou atualiza a regra "Rebate Fabricante" na tabela discounts
   */
  async saveRebateDiscount(params: RebateDiscountRuleParams): Promise<any> {
    const {
      productId,
      productName,
      discountType,
      discountValue,
      startDate,
      endDate,
      isActive = true,
      existingDiscountId,
    } = params

    if (!discountValue || discountValue <= 0) {
      throw new Error('Valor do desconto de rebate deve ser maior que zero.')
    }

    if (!endDate) {
      throw new Error('A data final de vigência do rebate é obrigatória.')
    }

    const payload = {
      name: 'Rebate Fabricante',
      description: `Rebate B&H / Fabricante para o produto ${productName}`,
      discount_type: discountType,
      discount_value: discountValue,
      target_type: 'specific',
      product_selection: [productId],
      customer_application_type: 'all',
      customer_role: null,
      customers: null,
      start_date: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
      end_date: new Date(endDate).toISOString(),
      is_active: isActive,
    }

    if (existingDiscountId) {
      const { data, error } = await supabase
        .from('discounts')
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', existingDiscountId)
        .select()
        .single()

      if (error) {
        throw new Error(`Falha ao atualizar Rebate Fabricante: ${error.message}`)
      }
      return data
    } else {
      const id = crypto.randomUUID()
      const { data, error } = await (supabase.from('discounts') as any)
        .insert({
          id,
          ...payload,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        throw new Error(`Falha ao criar Rebate Fabricante: ${error.message}`)
      }
      return data
    }
  },

  /**
   * Formata data amigável em pt-BR mantendo referência de fuso
   */
  formatRebateDate(dateStr?: string | null): string {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  },
}
