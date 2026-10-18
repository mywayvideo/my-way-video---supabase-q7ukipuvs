import { supabase } from '@/lib/supabase/client'
import { CategoryItem, CategoryProductItem, normalizeNcmDigits } from './categoryTriageService'

export interface CategorySummaryGroup {
  id: string
  name: string
  description?: string | null
  acceptable_ncms: string[]
  is_active: boolean
  created_at: string
  product_count: number
  legacy_pending_count: number
  out_of_standard_count: number
}

export interface CategoryOverviewMetrics {
  totalProducts: number
  withCategoryId: number
  withLegacyOnly: number
  noCategory: number
  categories: CategorySummaryGroup[]
}

export interface FetchProductsFilter {
  categoryId?: string | null // null = no category_id; 'all' = any; specific uuid = only that
  categoryFilterType?: 'all' | 'assigned' | 'triage_legacy' | 'triage_none' | 'by_category'
  search?: string
  page: number
  pageSize: number
  onlyOutOfStandard?: boolean
}

export const categoryService = {
  /**
   * Busca todas as categorias cadastradas com contadores ao vivo
   */
  async getCategoriesOverview(): Promise<CategoryOverviewMetrics> {
    // 1. Buscar categorias
    const { data: rawCategories, error: catError } = await (supabase
      .from('categories')
      .select('*')
      .order('name') as any)

    if (catError) {
      console.error('Erro ao buscar categorias:', catError)
      throw catError
    }

    const categoriesList: CategoryItem[] = (rawCategories || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      acceptable_ncms: Array.isArray(c.acceptable_ncms) ? c.acceptable_ncms : [],
      is_active: c.is_active !== false,
      created_at: c.created_at,
    }))

    // 2. Buscar contagem geral e agregação por category_id e por rótulo legado
    const { data: productsData, error: prodError } = await (supabase
      .from('products')
      .select('id, category_id, category, ncm') as any)

    if (prodError) {
      console.error('Erro ao buscar produtos para métricas de categorias:', prodError)
      throw prodError
    }

    const products = productsData || []
    let withCategoryId = 0
    let withLegacyOnly = 0
    let noCategory = 0

    const catCountMap = new Map<string, number>()
    const legacyCountMap = new Map<string, number>()
    const outOfStandardMap = new Map<string, number>()

    const catById = new Map<string, CategoryItem>()
    const catByNameLower = new Map<string, CategoryItem>()
    categoriesList.forEach((c) => {
      catById.set(c.id, c)
      catByNameLower.set(c.name.trim().toLowerCase(), c)
    })

    products.forEach((p: any) => {
      const hasCatId = !!p.category_id
      const hasCatText = !!(p.category && p.category.trim().length > 0)

      if (hasCatId) {
        withCategoryId++
        catCountMap.set(p.category_id, (catCountMap.get(p.category_id) || 0) + 1)

        // Verificar se NCM está fora do padrão
        const cat = catById.get(p.category_id)
        if (cat && cat.acceptable_ncms && cat.acceptable_ncms.length > 0 && p.ncm) {
          const ncmDigits = normalizeNcmDigits(p.ncm)
          if (ncmDigits) {
            const matches = cat.acceptable_ncms.some((pref) => {
              const prefDigits = normalizeNcmDigits(pref)
              return prefDigits ? ncmDigits.startsWith(prefDigits) : false
            })
            if (!matches) {
              outOfStandardMap.set(p.category_id, (outOfStandardMap.get(p.category_id) || 0) + 1)
            }
          }
        }
      } else if (hasCatText) {
        withLegacyOnly++
        // Tentar mapear para nome de categoria existente
        const textLower = p.category.trim().toLowerCase()
        const matched = catByNameLower.get(textLower)
        if (matched) {
          legacyCountMap.set(matched.id, (legacyCountMap.get(matched.id) || 0) + 1)
        }
      } else {
        noCategory++
      }
    })

    const categoryGroups: CategorySummaryGroup[] = categoriesList.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      acceptable_ncms: c.acceptable_ncms || [],
      is_active: c.is_active !== false,
      created_at: c.created_at || '',
      product_count: catCountMap.get(c.id) || 0,
      legacy_pending_count: legacyCountMap.get(c.id) || 0,
      out_of_standard_count: outOfStandardMap.get(c.id) || 0,
    }))

    return {
      totalProducts: products.length,
      withCategoryId,
      withLegacyOnly,
      noCategory,
      categories: categoryGroups,
    }
  },

  /**
   * Busca produtos com paginação e filtros no servidor
   */
  async fetchProducts(filter: FetchProductsFilter): Promise<{
    items: CategoryProductItem[]
    totalCount: number
  }> {
    const {
      categoryId,
      categoryFilterType = 'all',
      search = '',
      page = 1,
      pageSize = 50,
      onlyOutOfStandard = false,
    } = filter

    let query = supabase
      .from('products')
      .select(
        'id, name, sku, ncm, category, category_id, manufacturer_id, image_url, price_usd, price_brl, stock, created_at, updated_at, last_reviewed_at, manufacturer:manufacturers(id, name)',
        { count: 'exact' },
      )

    // Filtros de categoria
    if (categoryFilterType === 'by_category' && categoryId) {
      query = query.eq('category_id', categoryId)
    } else if (categoryFilterType === 'triage_legacy') {
      query = query.is('category_id', null).neq('category', '').not('category', 'is', null)
    } else if (categoryFilterType === 'triage_none') {
      // Sem categoria nenhuma
      query = query.is('category_id', null).or('category.is.null,category.eq.""')
    } else if (categoryFilterType === 'assigned') {
      query = query.not('category_id', 'is', null)
    }

    // Busca textual por nome ou SKU ou rótulo legado
    const cleanSearch = search.trim()
    if (cleanSearch) {
      query = query.or(
        `name.ilike.%${cleanSearch}%,sku.ilike.%${cleanSearch}%,category.ilike.%${cleanSearch}%,ncm.ilike.%${cleanSearch}%`,
      )
    }

    // Ordenação e paginação
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    query = query.order('name', { ascending: true }).range(from, to)

    const { data, count, error } = await query

    if (error) {
      console.error('Erro ao buscar produtos da categoria:', error)
      throw error
    }

    return {
      items: (data as any) || [],
      totalCount: count || 0,
    }
  },

  /**
   * Move múltiplos produtos para uma categoria:
   * - Grava category_id como fonte da verdade
   * - Sincroniza o texto legado category com o nome canônico da categoria
   * - Respeita invariante de auditoria: alteração real -> updated_at = last_reviewed_at = now()
   */
  async moveProductsToCategory(
    productIds: string[],
    targetCategoryId: string,
    targetCategoryName: string,
  ): Promise<{ success: boolean; count: number }> {
    if (!productIds || productIds.length === 0) {
      return { success: true, count: 0 }
    }

    const nowIso = new Date().toISOString()

    const { error } = await supabase
      .from('products')
      .update({
        category_id: targetCategoryId,
        category: targetCategoryName,
        updated_at: nowIso,
        last_reviewed_at: nowIso,
      })
      .in('id', productIds)

    if (error) {
      console.error('Erro ao mover produtos de categoria:', error)
      throw error
    }

    return { success: true, count: productIds.length }
  },

  /**
   * Confirma a categoria de um único produto (ou fila de triagem)
   */
  async confirmProductCategory(
    productId: string,
    categoryId: string,
    categoryName: string,
  ): Promise<void> {
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('products')
      .update({
        category_id: categoryId,
        category: categoryName,
        updated_at: nowIso,
        last_reviewed_at: nowIso,
      })
      .eq('id', productId)

    if (error) {
      console.error('Erro ao confirmar categoria do produto:', error)
      throw error
    }
  },

  /**
   * CRUD de Categorias: Criar nova categoria
   */
  async createCategory(params: {
    name: string
    description?: string
    acceptable_ncms?: string[]
  }): Promise<CategoryItem> {
    const trimmedName = params.name.trim()
    if (!trimmedName) throw new Error('Nome da categoria é obrigatório')

    // Checar duplicidade por nome (case/trim-insensitive)
    const { data: allCategories, error: checkError } = await supabase
      .from('categories')
      .select('id, name')

    if (checkError) {
      console.error('Erro ao verificar duplicidade de categoria:', checkError)
      throw checkError
    }

    const normalizedTarget = trimmedName.trim().toLowerCase()
    const duplicate = (allCategories || []).find(
      (c: any) => (c.name || '').trim().toLowerCase() === normalizedTarget,
    )

    if (duplicate) {
      throw new Error(
        `Já existe uma categoria cadastrada com o nome "${duplicate.name}". Não é permitido nomes duplicados.`,
      )
    }

    const insertPayload: any = {
      name: trimmedName,
      description: params.description?.trim() || null,
      acceptable_ncms: params.acceptable_ncms || [],
      is_active: true,
    }

    const { data, error } = await (supabase
      .from('categories')
      .insert(insertPayload)
      .select()
      .single() as any)

    if (error) {
      console.error('Erro ao criar categoria:', error)
      throw error
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      acceptable_ncms: data.acceptable_ncms || [],
      is_active: data.is_active !== false,
      created_at: data.created_at,
    }
  },

  /**
   * CRUD de Categorias: Atualizar categoria (nome, descrição, NCMs aceitáveis, status ativo)
   */
  async updateCategory(
    id: string,
    params: {
      name?: string
      description?: string | null
      acceptable_ncms?: string[]
      is_active?: boolean
    },
  ): Promise<CategoryItem> {
    const updatePayload: any = {}

    if (params.name !== undefined) {
      const trimmedName = params.name.trim()
      if (!trimmedName) throw new Error('Nome da categoria não pode ser vazio')
      // Checar se outro registro usa esse nome (case/trim-insensitive)
      const { data: allCategories, error: checkError } = await supabase
        .from('categories')
        .select('id, name')

      if (checkError) {
        console.error('Erro ao verificar duplicidade de categoria:', checkError)
        throw checkError
      }

      const normalizedTarget = trimmedName.trim().toLowerCase()
      const duplicate = (allCategories || []).find(
        (c: any) => c.id !== id && (c.name || '').trim().toLowerCase() === normalizedTarget,
      )

      if (duplicate) {
        throw new Error(
          `Outra categoria já utiliza o nome "${duplicate.name}". Não é permitido nomes duplicados.`,
        )
      }

      updatePayload.name = trimmedName
    }

    if (params.description !== undefined) {
      updatePayload.description = params.description?.trim() || null
    }

    if (params.acceptable_ncms !== undefined) {
      updatePayload.acceptable_ncms = params.acceptable_ncms
    }

    if (params.is_active !== undefined) {
      updatePayload.is_active = params.is_active
    }

    const { data, error } = await (supabase
      .from('categories')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single() as any)

    if (error) {
      console.error('Erro ao atualizar categoria:', error)
      throw error
    }

    // Se o nome da categoria mudou, sincronizar o texto legado na tabela products para os produtos vinculados
    if (params.name !== undefined) {
      await supabase.from('products').update({ category: params.name.trim() }).eq('category_id', id)
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      acceptable_ncms: data.acceptable_ncms || [],
      is_active: data.is_active !== false,
      created_at: data.created_at,
    }
  },

  /**
   * CRUD de Categorias: Excluir categoria
   * RECUSA se houver produtos vinculados (por category_id ou por texto legado)
   */
  async deleteCategory(id: string): Promise<void> {
    // 1. Obter nome da categoria
    const { data: cat, error: catError } = await supabase
      .from('categories')
      .select('id, name')
      .eq('id', id)
      .single()

    if (catError || !cat) {
      throw new Error('Categoria não encontrada')
    }

    // 2. Verificar produtos vinculados por category_id
    const { count: linkedCount, error: countError } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id)

    if (countError) {
      console.error('Erro ao verificar produtos vinculados:', countError)
      throw countError
    }

    if (linkedCount && linkedCount > 0) {
      throw new Error(
        `Não é possível excluir a categoria "${cat.name}": existem ${linkedCount} produto(s) vinculado(s) a ela. Realoque os produtos antes de excluir.`,
      )
    }

    // 3. Excluir a categoria
    const { error: delError } = await supabase.from('categories').delete().eq('id', id)

    if (delError) {
      console.error('Erro ao excluir categoria:', delError)
      throw delError
    }
  },
}
