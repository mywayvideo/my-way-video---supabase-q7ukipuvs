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

    // A trilha de auditoria (category_audit_log) é gravada por gatilho no banco:
    // ela registra quem, quando e de→para sem depender do cliente.
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

  /**
   * Exporta texto organizado de todas as categorias cadastradas e seus NCMs aceitáveis.
   * Busca as descrições curtas em imp_sim_tax_rates para cada código NCM.
   * Formata uma linha por NCM com formato "8544.42.00 — Descrição curta".
   */
  async exportCategoriesWithNcmsText(): Promise<string> {
    // 1. Buscar todas as categorias ativas ordenadas por nome
    const { data: categories, error: catError } = await (supabase.from('categories') as any)
      .select('id, name, acceptable_ncms')
      .order('name', { ascending: true })

    if (catError) {
      console.error('Erro ao buscar categorias para exportação:', catError)
      throw new Error(catError.message || 'Falha ao buscar categorias.')
    }

    const catList = (categories || []) as Array<{
      id: string
      name: string
      acceptable_ncms: string[] | null
    }>

    // 2. Extrair todos os NCMs únicos e limpar dígitos
    const allNcmDigits = new Set<string>()
    for (const cat of catList) {
      if (Array.isArray(cat.acceptable_ncms)) {
        for (const ncm of cat.acceptable_ncms) {
          const digits = String(ncm).replace(/\D/g, '')
          if (digits) {
            allNcmDigits.add(digits)
          }
        }
      }
    }

    // 3. Buscar descrições em imp_sim_tax_rates em lote
    const ncmDescMap = new Map<string, string>()
    if (allNcmDigits.size > 0) {
      const digitsArray = Array.from(allNcmDigits)
      // Chunks de até 100 para segurança de URL/in
      for (let i = 0; i < digitsArray.length; i += 100) {
        const chunk = digitsArray.slice(i, i + 100)
        const { data: taxRates } = await (supabase.from('imp_sim_tax_rates') as any)
          .select('ncm, ex, ncm_descricao, ncm_descricao_full')
          .in('ncm', chunk)

        if (taxRates && Array.isArray(taxRates)) {
          for (const row of taxRates) {
            // Priorizar registros sem ex-tarifário específico (ex nulo ou vazio)
            const currentDesc = ncmDescMap.get(row.ncm)
            const desc = (row.ncm_descricao || '').trim()
            if (desc && (!currentDesc || (!row.ex && currentDesc === 'Sem descrição cadastrada'))) {
              ncmDescMap.set(row.ncm, desc)
            } else if (!currentDesc) {
              // Se tiver ncm_descricao_full com pipe, pegar última parte como fallback
              if (row.ncm_descricao_full) {
                const parts = row.ncm_descricao_full.split('|').map((p: string) => p.trim())
                const lastPart = parts[parts.length - 1] || parts[0]
                ncmDescMap.set(row.ncm, lastPart || 'Sem descrição cadastrada')
              } else {
                ncmDescMap.set(row.ncm, 'Sem descrição cadastrada')
              }
            }
          }
        }
      }
    }

    // Função de formatação para 8 dígitos: "8544.42.00"
    const formatNcmCode = (raw: string) => {
      const digits = String(raw).replace(/\D/g, '')
      if (digits.length === 8) {
        return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
      }
      if (digits.length === 6) {
        return `${digits.slice(0, 4)}.${digits.slice(4, 6)}`
      }
      if (digits.length === 4) {
        return digits
      }
      return raw.trim()
    }

    // 4. Montar texto simples e organizado agrupado por categoria
    const sections: string[] = []

    for (const cat of catList) {
      const ncms = Array.isArray(cat.acceptable_ncms) ? cat.acceptable_ncms : []
      const lines: string[] = []
      lines.push(`[${cat.name}]`)

      if (ncms.length === 0) {
        lines.push('  (Nenhum NCM restrito cadastrado)')
      } else {
        for (const ncm of ncms) {
          const digits = String(ncm).replace(/\D/g, '')
          const formattedCode = formatNcmCode(ncm)
          const desc = ncmDescMap.get(digits) || 'Sem descrição cadastrada'
          lines.push(`  ${formattedCode} — ${desc}`)
        }
      }

      sections.push(lines.join('\n'))
    }

    return sections.join('\n\n')
  },

  /**
   * Exporta SOMENTE a lista de categorias existentes (sem NCMs).
   * Retorna texto simples (um por linha com contagem opcional) e dados para CSV.
   */
  async exportCategoriesOnlyList(): Promise<{
    textList: string
    csvContent: string
    items: Array<{ name: string; productCount: number }>
  }> {
    // 1. Buscar todas as categorias ordenadas por nome
    const { data: categories, error: catError } = await (supabase.from('categories') as any)
      .select('id, name')
      .order('name', { ascending: true })

    if (catError) {
      console.error('Erro ao buscar categorias:', catError)
      throw new Error(catError.message || 'Falha ao buscar categorias.')
    }

    const catList = (categories || []) as Array<{ id: string; name: string }>

    // 2. Contagem de produtos por categoria
    const countsMap = new Map<string, number>()
    try {
      const { data: products } = await (supabase.from('products') as any).select('category_id')

      if (Array.isArray(products)) {
        for (const p of products) {
          if (p.category_id) {
            countsMap.set(p.category_id, (countsMap.get(p.category_id) || 0) + 1)
          }
        }
      }
    } catch (countErr) {
      console.warn('Não foi possível obter contagem de produtos:', countErr)
    }

    const items = catList.map((c) => ({
      name: c.name,
      productCount: countsMap.get(c.id) || 0,
    }))

    // 3. Montar texto para cópia na área de transferência (sem NCMs)
    const textLines = items.map(
      (item) => `${item.name}${item.productCount > 0 ? ` (${item.productCount} produtos)` : ''}`,
    )
    const textList = textLines.join('\n')

    // 4. Montar CSV (com cabeçalho e escape correto)
    const csvHeader = 'Categoria,Produtos\n'
    const csvRows = items.map((item) => {
      const escapedName =
        item.name.includes(',') || item.name.includes('"')
          ? `"${item.name.replace(/"/g, '""')}"`
          : item.name
      return `${escapedName},${item.productCount}`
    })
    const csvContent = csvHeader + csvRows.join('\n')

    return {
      textList,
      csvContent,
      items,
    }
  },
}
