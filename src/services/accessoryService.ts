import { supabase } from '@/lib/supabase/client'

// Acessórios como atributo do produto (Fase 1 da reestruturação de categorias).

export const ACCESSORY_CATEGORY_NAME = 'Accessories'
export const ACCESSORY_BATCH_SIZE = 100
export const AI_CHUNK_SIZE = 20

export interface CategorySplitCounts {
  products: number
  accessories: number
}

export interface AccessoryProduct {
  id: string
  name: string
  sku: string | null
  description: string | null
}

export interface ParentCategory {
  id: string
  name: string
}

export interface AccessorySuggestion {
  productId: string
  categoryId: string | null
  justification: string
}

export const accessoryService = {
  /** Contagem de produtos (sem acessórios) e acessórios por categoria. */
  async fetchCategorySplitCounts(): Promise<Record<string, CategorySplitCounts>> {
    const { data, error } = await (supabase as any).rpc('get_category_product_split')
    if (error) throw error
    const map: Record<string, CategorySplitCounts> = {}
    for (const row of (data || []) as Array<{
      category_id: string
      products: number | string
      accessories: number | string
    }>) {
      map[row.category_id] = {
        products: Number(row.products) || 0,
        accessories: Number(row.accessories) || 0,
      }
    }
    return map
  },

  /** Lote (no máximo ACCESSORY_BATCH_SIZE) de produtos ainda na categoria Accessories. */
  async fetchAccessoryBatch(): Promise<{
    categoryId: string | null
    products: AccessoryProduct[]
  }> {
    const { data: cat, error: catError } = await supabase
      .from('categories')
      .select('id')
      .eq('name', ACCESSORY_CATEGORY_NAME)
      .maybeSingle()
    if (catError) throw catError
    if (!cat) return { categoryId: null, products: [] }

    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, description')
      .eq('category_id', cat.id)
      .order('name')
      .limit(ACCESSORY_BATCH_SIZE)
    if (error) throw error
    return { categoryId: cat.id, products: (data || []) as AccessoryProduct[] }
  },

  /** Categorias-mãe possíveis como destino (Accessories excluída). */
  async fetchParentCategories(): Promise<ParentCategory[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name')
      .neq('name', ACCESSORY_CATEGORY_NAME)
      .order('name')
    if (error) throw error
    return (data || []) as ParentCategory[]
  },

  /** Pede à IA a categoria-mãe sugerida (apenas sugestão; nada é aplicado aqui). */
  async suggestAccessoryCategories(
    products: AccessoryProduct[],
    categories: ParentCategory[],
  ): Promise<AccessorySuggestion[]> {
    const { data, error } = await supabase.functions.invoke('suggest-accessory-category', {
      body: {
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          description: (p.description || '').slice(0, 400),
        })),
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
      },
    })
    if (error) throw new Error('Falha ao consultar a IA')
    if (data?.error) throw new Error(String(data.error))
    return (data?.suggestions || []) as AccessorySuggestion[]
  },

  /** Aprova a reclassificação de um produto: sai de Accessories, vira acessório da categoria-mãe. */
  async approveAccessoryReclass(
    productId: string,
    categoryId: string,
    categoryName: string,
  ): Promise<void> {
    const { error } = await (supabase as any)
      .from('products')
      .update({ category_id: categoryId, category: categoryName, is_accessory: true })
      .eq('id', productId)
    if (error) throw error
  },

  /** Desativa (não apaga) a categoria Accessories, depois de esvaziada. */
  async deactivateAccessoriesCategory(): Promise<void> {
    const { error } = await (supabase as any)
      .from('categories')
      .update({ is_active: false })
      .eq('name', ACCESSORY_CATEGORY_NAME)
    if (error) throw error
  },
}
