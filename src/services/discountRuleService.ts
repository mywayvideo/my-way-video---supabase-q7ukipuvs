import { supabase } from '@/lib/supabase/client'

export const discountRuleService = {
  async fetchDiscountRule(ruleId: string) {
    const { data, error } = await supabase.from('discounts').select('*').eq('id', ruleId).single()
    if (error) throw new Error('Falha ao buscar desconto: ' + error.message)
    return data
  },
  async fetchManufacturers() {
    const { data, error } = await supabase.from('manufacturers').select('id, name').order('name')
    if (error) throw error
    return data || []
  },
  async fetchCategories() {
    const { data, error } = await supabase
      .from('products')
      .select('category')
      .not('category', 'is', null)
    if (error) throw error
    const uniqueCategories = Array.from(
      new Set((data || []).map((d) => d.category).filter(Boolean)),
    )
    return uniqueCategories
      .map((c) => ({ id: c as string, name: c as string }))
      .sort((a, b) => a.name.localeCompare(b.name))
  },
  async fetchProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, manufacturer_id, category, price_usd')
      .order('name')
    if (error) throw error
    return data || []
  },
  async fetchCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('id, full_name, email')
      .order('full_name')
    if (error) throw error
    return (data || []).map((c) => ({
      id: c.id,
      name: c.full_name || c.email || 'Cliente sem nome',
    }))
  },
  async saveDiscountRule(data: any) {
    const payload = {
      name: data.name,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      target_type: data.target_type,
      manufacturer_ids: ['manufacturer', 'manufacturer_category'].includes(data.target_type)
        ? data.manufacturer_ids
        : [],
      category_ids: ['category', 'manufacturer_category'].includes(data.target_type)
        ? data.category_ids
        : [],
      manufacturer_id: null,
      category_id: null,
      product_selection: data.target_type === 'specific' ? data.product_selection : [],
      excluded_products: data.target_type !== 'specific' ? data.excluded_products : [],
      customer_application_type: data.customer_application_type || 'all',
      customer_role: data.customer_application_type === 'rule' ? data.customer_role : null,
      start_date: data.start_date ? new Date(data.start_date).toISOString() : null,
      end_date: data.end_date ? new Date(data.end_date).toISOString() : null,
      is_active: data.is_active !== undefined ? data.is_active : true,
    }

    if (data.id) {
      const { data: updatedData, error } = await supabase
        .from('discounts')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', data.id)
        .select()
      if (error) throw new Error('Falha ao atualizar desconto: ' + error.message)
      return updatedData
    } else {
      const { data: insertedData, error } = await supabase
        .from('discounts')
        .insert(payload)
        .select()
      if (error) throw new Error('Falha ao criar desconto: ' + error.message)
      return insertedData
    }
  },
  async deleteDiscountRule(ruleId: string) {
    const { error } = await supabase.from('discounts').delete().eq('id', ruleId)
    if (error) throw new Error('Falha ao deletar desconto: ' + error.message)
  },
}
