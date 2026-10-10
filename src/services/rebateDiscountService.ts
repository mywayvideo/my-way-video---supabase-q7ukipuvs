import { supabase } from '@/lib/supabase/client'

export interface RebateDiscountRuleParams {
  productId: string
  productName: string
  discountType: 'price_usa_percentage' | 'percentage' | 'fixed' | 'fixed_amount'
  discountValue: number
  startDate?: string | null // ISO string
  endDate: string // ISO string
  isActive?: boolean
  existingDiscountId?: string | null
}

export interface ExistingRebateRule {
  id?: string
  name?: string
  discount_type?: string
  discount_value?: number
  start_date?: string | null
  end_date?: string | null
  is_active?: boolean | null
  product_selection?: any
  // Campos nativos correspondentes
  price_usa_rebate?: number | null
  price_cost_rebate?: number | null
  date_rebate?: string | null
}

export interface NativeRebateSaveResult {
  productId: string
  priceUsaRebate: number
  priceCostRebate: number | null
  dateRebate: string
  updatedAt: string
}

export const rebateDiscountService = {
  /**
   * Helper para calcular o preço com rebate e custo com rebate a partir de preço base e custo base.
   */
  calculateNativeRebateValues(params: {
    priceUsd: number
    priceCost?: number | null
    discountType: 'price_usa_percentage' | 'percentage' | 'fixed' | 'fixed_amount'
    discountValue: number
  }): { priceUsaRebate: number; priceCostRebate: number | null } {
    const { priceUsd, priceCost, discountType, discountValue } = params
    const fullPrice = Number(priceUsd) || 0
    let priceUsaRebate = fullPrice

    if (discountType === 'price_usa_percentage' || discountType === 'percentage') {
      priceUsaRebate = fullPrice * (1 - Math.max(0, discountValue) / 100)
    } else if (discountType === 'fixed' || discountType === 'fixed_amount') {
      priceUsaRebate = fullPrice - Math.max(0, discountValue)
    }

    // Piso em 0
    priceUsaRebate = Math.max(0, Number(priceUsaRebate.toFixed(2)))

    let priceCostRebate: number | null = null
    const cost = priceCost != null ? Number(priceCost) : null
    if (cost != null && cost > 0 && fullPrice > 0) {
      const proportion = priceUsaRebate / fullPrice
      priceCostRebate = Number((cost * proportion).toFixed(2))
    }

    return { priceUsaRebate, priceCostRebate }
  },

  /**
   * Procura se o produto possui rebate nativo configurado (ou regra legada ativa em discounts)
   */
  async findActiveRebateRule(productId: string): Promise<ExistingRebateRule | null> {
    try {
      // 1. Prioridade: verificar campos nativos do produto
      const { data: prod, error: prodErr } = await supabase
        .from('products')
        .select('id, price_usd, price_cost, price_usa_rebate, price_cost_rebate, date_rebate')
        .eq('id', productId)
        .maybeSingle()

      if (!prodErr && prod && prod.price_usa_rebate != null && Number(prod.price_usa_rebate) > 0) {
        const fullPrice = Number(prod.price_usd) || 0
        const rebatePrice = Number(prod.price_usa_rebate)
        const savings = fullPrice > rebatePrice ? fullPrice - rebatePrice : 0
        const pct = fullPrice > 0 ? Number(((savings / fullPrice) * 100).toFixed(2)) : 0

        return {
          id: prod.id,
          name: 'Rebate Fabricante',
          discount_type: 'price_usa_percentage',
          discount_value: pct,
          start_date: null,
          end_date: prod.date_rebate || null,
          is_active: !prod.date_rebate || new Date(prod.date_rebate) >= new Date(),
          product_selection: [prod.id],
          price_usa_rebate: prod.price_usa_rebate,
          price_cost_rebate: prod.price_cost_rebate,
          date_rebate: prod.date_rebate,
        }
      }

      // 2. Fallback: procurar regra legada em discounts
      const { data, error } = await (supabase.from('discounts') as any)
        .select(
          'id, name, discount_type, discount_value, start_date, end_date, is_active, product_selection',
        )
        .eq('name', 'Rebate Fabricante')
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error || !data) return null

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
   * Salva o rebate diretamente nos campos nativos do produto em products:
   * - price_usa_rebate: calculado (percentual ou fixo sobre price_usd, piso em 0)
   * - price_cost_rebate: price_cost * proporção (ou null/0 se ausente)
   * - date_rebate: vigência informada
   * - updated_at = last_reviewed_at = agora (mesmo valor - regra vinculante do usuário)
   * - price_usd NUNCA é alterado
   * - Desativa regras legadas "Rebate Fabricante" para este produto em discounts
   */
  async saveRebateDiscount(params: RebateDiscountRuleParams): Promise<NativeRebateSaveResult> {
    const { productId, discountType, discountValue, endDate } = params

    if (!discountValue || discountValue <= 0) {
      throw new Error('Valor do desconto de rebate deve ser maior que zero.')
    }

    if (!endDate) {
      throw new Error('A data final de vigência do rebate é obrigatória.')
    }

    // 1. Buscar o produto para pegar price_usd e price_cost atuais
    const { data: currentProd, error: fetchErr } = await supabase
      .from('products')
      .select('id, price_usd, price_cost')
      .eq('id', productId)
      .maybeSingle()

    if (fetchErr || !currentProd) {
      throw new Error(`Produto não encontrado para aplicação de rebate: ${fetchErr?.message || ''}`)
    }

    const priceUsd = Number(currentProd.price_usd) || 0
    const priceCost = currentProd.price_cost != null ? Number(currentProd.price_cost) : null

    const { priceUsaRebate, priceCostRebate } = this.calculateNativeRebateValues({
      priceUsd,
      priceCost,
      discountType,
      discountValue,
    })

    const nowIso = new Date().toISOString()
    const dateRebateIso = new Date(endDate).toISOString()

    // 2. Atualizar o próprio produto em `products`
    const { error: updateErr } = await supabase
      .from('products')
      .update({
        price_usa_rebate: priceUsaRebate,
        price_cost_rebate: priceCostRebate,
        date_rebate: dateRebateIso,
        updated_at: nowIso,
        last_reviewed_at: nowIso,
      } as any)
      .eq('id', productId)

    if (updateErr) {
      throw new Error(`Falha ao atualizar rebate no produto: ${updateErr.message}`)
    }

    // 3. Desativar qualquer regra legada "Rebate Fabricante" deste produto em discounts
    try {
      await this.deactivateLegacyDiscountsForProduct(productId)
    } catch (legErr) {
      console.warn('Erro não bloqueante ao desativar regra legada em discounts:', legErr)
    }

    return {
      productId,
      priceUsaRebate,
      priceCostRebate,
      dateRebate: dateRebateIso,
      updatedAt: nowIso,
    }
  },

  /**
   * Remove/desativa regras legadas "Rebate Fabricante" na tabela discounts que apontem para o produto
   */
  async deactivateLegacyDiscountsForProduct(productId: string): Promise<void> {
    const { data: legacyRules, error: selectErr } = await (supabase.from('discounts') as any)
      .select('id, product_selection, is_active')
      .eq('name', 'Rebate Fabricante')
      .eq('is_active', true)

    if (selectErr || !legacyRules || !Array.isArray(legacyRules)) return

    const nowIso = new Date().toISOString()
    for (const rule of legacyRules) {
      if (Array.isArray(rule.product_selection) && rule.product_selection.includes(productId)) {
        if (rule.product_selection.length === 1) {
          // Desativa a regra inteira
          await (supabase.from('discounts') as any)
            .update({ is_active: false, updated_at: nowIso })
            .eq('id', rule.id)
        } else {
          // Remove o produto da lista de produtos selecionados
          const remaining = rule.product_selection.filter((id: string) => id !== productId)
          await (supabase.from('discounts') as any)
            .update({ product_selection: remaining, updated_at: nowIso })
            .eq('id', rule.id)
        }
      }
    }
  },

  /**
   * Migração idempotente das regras legadas de "Rebate Fabricante" em discounts
   * para os campos nativos em products.
   * Para cada regra ativa:
   * - calcula price_usa_rebate, price_cost_rebate e date_rebate = rule.end_date
   * - atualiza os produtos da seleção (se ainda não possuírem rebate ou se regra for mais recente)
   * - marca a regra is_active: false
   * Idempotente: pode ser executada várias vezes com segurança.
   */
  async migrateLegacyRebates(): Promise<{
    migratedRulesCount: number
    updatedProductsCount: number
    errors: string[]
  }> {
    const errors: string[] = []
    let migratedRulesCount = 0
    let updatedProductsCount = 0

    try {
      const { data: activeRules, error } = await (supabase.from('discounts') as any)
        .select(
          'id, name, discount_type, discount_value, start_date, end_date, is_active, product_selection',
        )
        .eq('name', 'Rebate Fabricante')
        .eq('is_active', true)

      if (error) {
        throw new Error(`Erro ao buscar regras legadas: ${error.message}`)
      }

      if (!activeRules || activeRules.length === 0) {
        return { migratedRulesCount: 0, updatedProductsCount: 0, errors: [] }
      }

      const nowIso = new Date().toISOString()

      for (const rule of activeRules) {
        const productIds: string[] = Array.isArray(rule.product_selection)
          ? rule.product_selection
          : []

        if (productIds.length > 0) {
          const { data: prods, error: prodErr } = await supabase
            .from('products')
            .select('id, price_usd, price_cost, price_usa_rebate, date_rebate')
            .in('id', productIds)

          if (prodErr) {
            errors.push(`Erro ao carregar produtos da regra ${rule.id}: ${prodErr.message}`)
            continue
          }

          for (const prod of prods || []) {
            const priceUsd = Number(prod.price_usd) || 0
            if (priceUsd <= 0) continue

            const { priceUsaRebate, priceCostRebate } = this.calculateNativeRebateValues({
              priceUsd,
              priceCost: prod.price_cost != null ? Number(prod.price_cost) : null,
              discountType: rule.discount_type || 'percentage',
              discountValue: Number(rule.discount_value) || 0,
            })

            const targetDateRebate = rule.end_date
              ? new Date(rule.end_date).toISOString()
              : prod.date_rebate || null

            const { error: updateErr } = await supabase
              .from('products')
              .update({
                price_usa_rebate: priceUsaRebate,
                price_cost_rebate: priceCostRebate,
                date_rebate: targetDateRebate,
                updated_at: nowIso,
                last_reviewed_at: nowIso,
              } as any)
              .eq('id', prod.id)

            if (updateErr) {
              errors.push(`Falha ao migrar produto ${prod.id}: ${updateErr.message}`)
            } else {
              updatedProductsCount++
            }
          }
        }

        // Marca a regra legada como inativa
        const { error: deactivateErr } = await (supabase.from('discounts') as any)
          .update({ is_active: false, updated_at: nowIso })
          .eq('id', rule.id)

        if (deactivateErr) {
          errors.push(`Falha ao desativar regra ${rule.id}: ${deactivateErr.message}`)
        } else {
          migratedRulesCount++
        }
      }
    } catch (err: any) {
      errors.push(err.message || 'Erro inesperado na migração de rebates')
    }

    return { migratedRulesCount, updatedProductsCount, errors }
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
