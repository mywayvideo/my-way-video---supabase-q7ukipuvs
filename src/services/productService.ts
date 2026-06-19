import { supabase } from '@/lib/supabase/client'
import { ProductFormData } from '@/types/product'

export const productService = {
  async getCategories() {
    const { data, error } = await supabase.from('categories').select('id, name').order('name')
    if (error) throw error
    return data || []
  },

  async checkSkuExists(sku: string) {
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .eq('sku', sku)
      .maybeSingle()
    if (error && error.code !== 'PGRST116') throw error
    return !!data
  },

  async extractFromUrl(url: string) {
    const { data, error } = await supabase.functions.invoke('extract-product-bhphoto', {
      body: { url },
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    return data
  },

  async calculateBrl(price_cost: number, weight: number) {
    const { data, error } = await supabase.functions.invoke('calculate-price-brl', {
      body: { price_cost, weight },
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    return data.price_brl
  },

  async extractProductFromUrl(url: string) {
    return this.extractFromUrl(url)
  },

  async suggestNcm(description: string) {
    const { data, error } = await supabase.functions.invoke('validate-ncm-suggestion', {
      body: { description },
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    return data
  },

  async getManufacturers() {
    const { data, error } = await supabase.from('manufacturers').select('id, name').order('name')
    if (error) throw error
    return data || []
  },

  async createProduct(productData: any) {
    const payload = {
      name: productData.name,
      sku: productData.sku,
      manufacturer_id: productData.manufacturer_id || null,
      price_usd: productData.price_usa || 0,
      price_cost: productData.price_cost || 0,
      price_brl: productData.price_brl || 0,
      weight: productData.weight || 0,
      dimensions: productData.dimensions || null,
      stock: productData.stock || 0,
      ncm: productData.ncm || null,
      image_url: productData.image_url || null,
      description: productData.description !== undefined ? productData.description : null,
      technical_info: productData.technical_info !== undefined ? productData.technical_info : null,
      is_special: productData.is_special || false,
      is_discontinued: productData.is_discontinued || false,
      category_id: productData.category_id || null,
      category: productData.category || null,
      price_nationalized_sales: productData.price_nationalized_sales || null,
      price_nationalized_cost: productData.price_nationalized_cost || null,
      price_nationalized_currency: productData.price_nationalized_currency || 'BRL',
      manual_related_ids: productData.manual_related_ids || [],
      ai_related_ids: productData.ai_related_ids || [],
      price_usa_rebate:
        productData.price_usa_rebate === '' ? null : (productData.price_usa_rebate ?? null),
      price_cost_rebate:
        productData.price_cost_rebate === '' ? null : (productData.price_cost_rebate ?? null),
      date_rebate: productData.date_rebate === '' ? null : (productData.date_rebate ?? null),
    }

    const { data, error } = await supabase.from('products').insert(payload).select().single()

    if (error) throw error
    return data
  },

  async updateProduct(id: string, productData: any) {
    const payload = {
      name: productData.name,
      sku: productData.sku,
      manufacturer_id: productData.manufacturer_id || null,
      price_usd: productData.price_usa || 0,
      price_cost: productData.price_cost || 0,
      price_brl: productData.price_brl || 0,
      weight: productData.weight || 0,
      dimensions: productData.dimensions || null,
      stock: productData.stock || 0,
      ncm: productData.ncm || null,
      image_url: productData.image_url || null,
      description: productData.description !== undefined ? productData.description : null,
      technical_info: productData.technical_info !== undefined ? productData.technical_info : null,
      is_special: productData.is_special || false,
      is_discontinued: productData.is_discontinued || false,
      category_id: productData.category_id || null,
      category: productData.category || null,
      price_nationalized_sales: productData.price_nationalized_sales || null,
      price_nationalized_cost: productData.price_nationalized_cost || null,
      price_nationalized_currency: productData.price_nationalized_currency || 'BRL',
      manual_related_ids: productData.manual_related_ids || [],
      ai_related_ids: productData.ai_related_ids || [],
      price_usa_rebate:
        productData.price_usa_rebate === '' ? null : (productData.price_usa_rebate ?? null),
      price_cost_rebate:
        productData.price_cost_rebate === '' ? null : (productData.price_cost_rebate ?? null),
      date_rebate: productData.date_rebate === '' ? null : (productData.date_rebate ?? null),
    }

    const { error } = await supabase.from('products').update(payload).eq('id', id)

    if (error) throw error
    return true
  },
}
