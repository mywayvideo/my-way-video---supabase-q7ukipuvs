import { supabase } from '@/lib/supabase/client'
import { productService } from '@/services/productService'
import { relatedProductsService } from '@/services/relatedProductsService'
import {
  CategoryItem,
  getProductCategorySuggestion,
  LEGACY_EXACT_MAP,
} from '@/services/categoryTriageService'

export interface CategoryMapping {
  id: string
  source_category: string
  source_category_normalized: string
  target_category_id: string
  target_category_name: string
  source_type: 'csv' | 'bh' | 'manual'
  created_at?: string
  updated_at?: string
}

export interface StagingProductItem {
  id: string
  batch_id: string
  batch_source: 'csv' | 'bh' | 'manual'
  sku: string | null
  name: string
  manufacturer_id: string | null
  brand_name?: string | null
  price_usd: number | null
  price_cost: number | null
  price_brl: number | null
  weight: number | null
  dimensions?: string | null
  stock: number | null
  ncm?: string | null
  image_url: string | null
  description?: string | null
  technical_info?: string | null
  website_url?: string | null
  is_special?: boolean
  is_discontinued?: boolean
  price_nationalized_sales?: number | null
  price_nationalized_cost?: number | null
  price_nationalized_currency?: string
  price_usa_rebate?: number | null
  price_cost_rebate?: number | null
  date_rebate?: string | null

  // Categorização
  original_category: string | null
  suggested_category_id: string | null
  suggested_category_name: string | null
  suggestion_confidence: 'alta' | 'media' | 'baixa'
  suggestion_reason: string | null

  // Status
  status: 'pending' | 'confirmed' | 'discarded'
  discard_reason?: string | null
  confirmed_product_id?: string | null
  confirmed_category_id?: string | null
  confirmed_at?: string | null

  raw_payload?: any
  created_at: string
  updated_at?: string

  // Relacionamentos carregados
  manufacturer?: { id: string; name: string } | null
}

export interface MatchCategoryResult {
  isMatchedDirect: boolean
  matchedCategoryId: string | null
  matchedCategoryName: string | null
  suggestedCategoryId: string | null
  suggestedCategoryName: string | null
  confidence: 'alta' | 'media' | 'baixa'
  reason: string
}

export interface StagingBatchReport {
  batchId: string
  directMatchedCount: number
  stagingCount: number
  discardedCount: number
  totalCount: number
}

export function normalizeCategoryKey(cat?: string | null): string {
  if (!cat) return ''
  return cat.trim().toLowerCase()
}

export const categoryImportStagingService = {
  /**
   * Busca todos os mapeamentos confirmados persistidos no banco
   */
  async getCategoryMappings(): Promise<CategoryMapping[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('category_mappings')
        .select('*')
        .order('source_category', { ascending: true })

      if (error) {
        console.warn('category_mappings não disponível ou erro de leitura:', error.message)
        return []
      }
      return data || []
    } catch (e: any) {
      console.warn('Erro ao carregar category_mappings:', e?.message)
      return []
    }
  },

  /**
   * Salva ou atualiza um mapeamento memorizado de categoria
   */
  async saveCategoryMapping(params: {
    sourceCategory: string
    targetCategoryId: string
    targetCategoryName: string
    sourceType?: 'csv' | 'bh' | 'manual'
  }): Promise<CategoryMapping | null> {
    const rawSource = params.sourceCategory.trim()
    const normalized = normalizeCategoryKey(rawSource)
    if (!normalized || !params.targetCategoryId) return null

    try {
      const payload = {
        source_category: rawSource,
        source_category_normalized: normalized,
        target_category_id: params.targetCategoryId,
        target_category_name: params.targetCategoryName,
        source_type: params.sourceType || 'manual',
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await (supabase as any)
        .from('category_mappings')
        .upsert(payload, { onConflict: 'source_category_normalized' })
        .select()
        .single()

      if (error) {
        console.warn('Erro ao salvar category_mappings:', error.message)
        return null
      }
      return data
    } catch (e: any) {
      console.warn('Erro ao persistir mapeamento de categoria:', e?.message)
      return null
    }
  },

  /**
   * Avalia a categoria informada de um produto importado:
   * 1. Verifica se casa DIRETO com o nome exato de uma categoria existente (ex: "Cameras", "Audio", "Lenses")
   * 2. Verifica se existe mapeamento memorizado persistente em category_mappings (ex: "Control Panels" -> "Production Switchers")
   * 3. Se casar em 1 ou 2 -> isMatchedDirect = true
   * 4. Se não casar -> isMatchedDirect = false e calcula sugestão via 2-layers (LEGACY_EXACT_MAP + getProductCategorySuggestion)
   */
  resolveCategoryMatch(params: {
    rawCategory?: string | null
    productName?: string | null
    productDescription?: string | null
    productNcm?: string | null
    categories: CategoryItem[]
    mappings: CategoryMapping[]
  }): MatchCategoryResult {
    const { rawCategory, productName, productDescription, productNcm, categories, mappings } =
      params
    const rawClean = (rawCategory || '').trim()
    const norm = normalizeCategoryKey(rawClean)

    // Mapa de categorias por ID e por nome em minúsculas
    const catByNameLower = new Map<string, CategoryItem>()
    const catByNameExact = new Map<string, CategoryItem>()
    for (const c of categories) {
      catByNameLower.set(c.name.trim().toLowerCase(), c)
      catByNameExact.set(c.name, c)
    }

    // Mapa de mapeamentos persistidos
    const mappingByNorm = new Map<string, CategoryMapping>()
    for (const m of mappings) {
      mappingByNorm.set(m.source_category_normalized, m)
    }

    // 1. Caso direto 1: nome já é exatamente igual a uma categoria existente
    if (norm && catByNameLower.has(norm)) {
      const cat = catByNameLower.get(norm)!
      return {
        isMatchedDirect: true,
        matchedCategoryId: cat.id,
        matchedCategoryName: cat.name,
        suggestedCategoryId: cat.id,
        suggestedCategoryName: cat.name,
        confidence: 'alta',
        reason: `Categoria idêntica ao catálogo: "${cat.name}"`,
      }
    }

    // 2. Caso direto 2: já foi memorizado pelo usuário em category_mappings
    if (norm && mappingByNorm.has(norm)) {
      const mapping = mappingByNorm.get(norm)!
      return {
        isMatchedDirect: true,
        matchedCategoryId: mapping.target_category_id,
        matchedCategoryName: mapping.target_category_name,
        suggestedCategoryId: mapping.target_category_id,
        suggestedCategoryName: mapping.target_category_name,
        confidence: 'alta',
        reason: `Mapeamento memorizado de importações anteriores: "${rawClean}" → "${mapping.target_category_name}"`,
      }
    }

    // 3. NÃO casou direto. Calcular a melhor sugestão possível:
    // A) LEGACY_EXACT_MAP estático da triagem
    if (norm && LEGACY_EXACT_MAP[norm]) {
      const targetName = LEGACY_EXACT_MAP[norm]
      const cat = catByNameExact.get(targetName) || catByNameLower.get(targetName.toLowerCase())
      return {
        isMatchedDirect: false,
        matchedCategoryId: null,
        matchedCategoryName: null,
        suggestedCategoryId: cat?.id || null,
        suggestedCategoryName: targetName,
        confidence: 'alta',
        reason: `Sugestão automática por similaridade direta: "${rawClean}" → "${targetName}"`,
      }
    }

    // B) Algoritmo de similaridade direta por termos e NCM
    const suggestion = getProductCategorySuggestion(
      {
        name: productName,
        description: productDescription,
        category: rawClean,
        ncm: productNcm,
      },
      catByNameExact,
    )

    if (suggestion) {
      return {
        isMatchedDirect: false,
        matchedCategoryId: null,
        matchedCategoryName: null,
        suggestedCategoryId: suggestion.categoryId || null,
        suggestedCategoryName: suggestion.categoryName,
        confidence: suggestion.level === 'high' ? 'alta' : 'media',
        reason: suggestion.reason,
      }
    }

    // C) Similaridade textual fuzzy/token entre rawCategory e os nomes das categorias
    if (rawClean) {
      const fuzzyMatch = this.findBestSimilarityCategory(rawClean, categories)
      if (fuzzyMatch) {
        return {
          isMatchedDirect: false,
          matchedCategoryId: null,
          matchedCategoryName: null,
          suggestedCategoryId: fuzzyMatch.category.id,
          suggestedCategoryName: fuzzyMatch.category.name,
          confidence: fuzzyMatch.score >= 0.6 ? 'media' : 'baixa',
          reason: `Sugestão por similaridade textual (${Math.round(fuzzyMatch.score * 100)}%): "${rawClean}" → "${fuzzyMatch.category.name}"`,
        }
      }
    }

    // D) Sem nenhuma sugestão conclusiva
    return {
      isMatchedDirect: false,
      matchedCategoryId: null,
      matchedCategoryName: null,
      suggestedCategoryId: null,
      suggestedCategoryName: null,
      confidence: 'baixa',
      reason: rawClean
        ? `Categoria "${rawClean}" não identificada no catálogo`
        : 'Produto sem categoria informada na importação',
    }
  },

  /**
   * Encontra a categoria do catálogo com maior similaridade textual com a string de entrada.
   * Utiliza sobreposição de tokens e distância de Levenshtein normalizada.
   */
  findBestSimilarityCategory(
    rawText: string,
    categories: CategoryItem[],
  ): { category: CategoryItem; score: number } | null {
    if (!rawText || !rawText.trim() || !categories.length) return null

    const cleanInput = rawText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const inputTokens = new Set(cleanInput.split(' ').filter((t) => t.length > 2))

    let bestScore = 0
    let bestCat: CategoryItem | null = null

    for (const cat of categories) {
      const cleanCat = cat.name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      const catTokens = cleanCat.split(' ').filter((t) => t.length > 2)

      // 1. Substring direta
      if (cleanInput.includes(cleanCat) || cleanCat.includes(cleanInput)) {
        const score = 0.8
        if (score > bestScore) {
          bestScore = score
          bestCat = cat
        }
        continue
      }

      // 2. Sobreposição de tokens
      let tokenOverlap = 0
      for (const token of catTokens) {
        if (inputTokens.has(token)) {
          tokenOverlap++
        } else {
          // Checar se algum token tem início comum (ex: camcorder vs camcorders vs camera)
          for (const inp of inputTokens) {
            if (
              (inp.length >= 4 && token.startsWith(inp)) ||
              (token.length >= 4 && inp.startsWith(token))
            ) {
              tokenOverlap += 0.7
              break
            }
          }
        }
      }

      const tokenScore = catTokens.length > 0 ? tokenOverlap / catTokens.length : 0

      // 3. Levenshtein ratio
      const maxLen = Math.max(cleanInput.length, cleanCat.length)
      const distance = this.levenshtein(cleanInput, cleanCat)
      const levScore = maxLen > 0 ? 1 - distance / maxLen : 0

      const combinedScore = tokenScore * 0.7 + levScore * 0.3

      if (combinedScore > bestScore && combinedScore >= 0.35) {
        bestScore = combinedScore
        bestCat = cat
      }
    }

    if (bestCat) {
      return { category: bestCat, score: bestScore }
    }
    return null
  },

  levenshtein(a: string, b: string): number {
    const an = a ? a.length : 0
    const bn = b ? b.length : 0
    if (an === 0) return bn
    if (bn === 0) return an
    const matrix = Array.from({ length: bn + 1 }, (_, i) => [i])
    for (let j = 0; j <= an; j++) matrix[0][j] = j
    for (let i = 1; i <= bn; i++) {
      for (let j = 1; j <= an; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1, // deletion
          )
        }
      }
    }
    return matrix[bn][an]
  },

  /**
   * Envia itens para a staging table de produtos
   */
  async insertStagingBatch(items: Array<Partial<StagingProductItem>>): Promise<{
    success: boolean
    insertedCount: number
    error?: string
  }> {
    if (items.length === 0) return { success: true, insertedCount: 0 }

    try {
      const { data, error } = await (supabase as any)
        .from('product_import_staging')
        .insert(items)
        .select('id')

      if (error) {
        console.error('Erro ao inserir na staging:', error)
        return { success: false, insertedCount: 0, error: error.message }
      }
      return { success: true, insertedCount: data?.length || 0 }
    } catch (e: any) {
      console.error('Exceção ao inserir na staging:', e)
      return { success: false, insertedCount: 0, error: e?.message }
    }
  },

  /**
   * Busca itens na staging table com filtros
   */
  async fetchStagingItems(filters?: {
    status?: 'pending' | 'confirmed' | 'discarded' | 'all'
    batchId?: string
    suggestedCategoryName?: string
    search?: string
    limit?: number
  }): Promise<{ items: StagingProductItem[]; error?: string }> {
    try {
      let query = (supabase as any)
        .from('product_import_staging')
        .select(`
          *,
          manufacturer:manufacturers(id, name)
        `)
        .order('created_at', { ascending: false })

      const statusFilter = filters?.status || 'pending'
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      if (filters?.batchId && filters.batchId !== 'all') {
        query = query.eq('batch_id', filters.batchId)
      }

      if (filters?.suggestedCategoryName && filters.suggestedCategoryName !== 'all') {
        query = query.eq('suggested_category_name', filters.suggestedCategoryName)
      }

      if (filters?.search && filters.search.trim()) {
        const s = filters.search.trim()
        query = query.or(`name.ilike.%${s}%,sku.ilike.%${s}%,original_category.ilike.%${s}%`)
      }

      if (filters?.limit) {
        query = query.limit(filters.limit)
      } else {
        query = query.limit(500)
      }

      const { data, error } = await query

      if (error) {
        console.warn('Erro ao consultar product_import_staging:', error.message)
        return { items: [], error: error.message }
      }
      return { items: data || [] }
    } catch (e: any) {
      console.warn('Erro ao carregar staging:', e?.message)
      return { items: [], error: e?.message }
    }
  },

  /**
   * Retorna os lotes distintos existentes na staging
   */
  async fetchDistinctBatches(): Promise<
    Array<{ batch_id: string; batch_source: string; created_at: string; total: number }>
  > {
    try {
      const { data, error } = await (supabase as any)
        .from('product_import_staging')
        .select('batch_id, batch_source, created_at')
        .order('created_at', { ascending: false })
        .limit(1000)

      if (error || !data) return []

      const batchMap = new Map<
        string,
        { batch_id: string; batch_source: string; created_at: string; total: number }
      >()

      for (const row of data) {
        const existing = batchMap.get(row.batch_id)
        if (existing) {
          existing.total++
        } else {
          batchMap.set(row.batch_id, {
            batch_id: row.batch_id,
            batch_source: row.batch_source,
            created_at: row.created_at,
            total: 1,
          })
        }
      }

      return Array.from(batchMap.values())
    } catch (e) {
      return []
    }
  },

  /**
   * Confirma um único item de staging:
   * 1. Cria o produto na tabela `products` com a categoria final escolhida
   * 2. Memoriza o mapeamento (se original_category existir) em category_mappings
   * 3. Atualiza o registro de staging para status='confirmed'
   * 4. Dispara o pipeline de produtos relacionados em segundo plano (relatedProductsService.triggerBackgroundGeneration)
   */
  async confirmSingleStagingItem(params: {
    stagingId: string
    finalCategoryId: string
    finalCategoryName: string
    customSku?: string
    customName?: string
  }): Promise<{ success: boolean; productId?: string; error?: string }> {
    const { stagingId, finalCategoryId, finalCategoryName } = params

    try {
      // 1. Ler o registro da staging
      const { data: item, error: fetchErr } = await (supabase as any)
        .from('product_import_staging')
        .select('*')
        .eq('id', stagingId)
        .single()

      if (fetchErr || !item) {
        throw new Error(fetchErr?.message || 'Item não encontrado na staging')
      }

      // 2. Montar o payload para salvar em `products`
      const effectiveSku = (params.customSku || item.sku || '').trim() || null
      const effectiveName = (params.customName || item.name || '').trim()

      const productPayload = {
        name: effectiveName,
        sku: effectiveSku,
        manufacturer_id: item.manufacturer_id || null,
        category_id: finalCategoryId,
        category: finalCategoryName,
        price_usd: item.price_usd || 0,
        price_cost: item.price_cost || 0,
        price_brl: item.price_brl || 0,
        weight: item.weight || 0,
        dimensions: item.dimensions || null,
        stock: item.stock || 0,
        ncm: item.ncm || null,
        image_url: item.image_url || null,
        description: item.description || null,
        technical_info: item.technical_info || null,
        website_url: item.website_url || null,
        is_special: item.is_special || false,
        is_discontinued: item.is_discontinued || false,
        price_nationalized_sales: item.price_nationalized_sales || null,
        price_nationalized_cost: item.price_nationalized_cost || null,
        price_nationalized_currency: item.price_nationalized_currency || 'BRL',
        price_usa_rebate: item.price_usa_rebate ?? null,
        price_cost_rebate: item.price_cost_rebate ?? null,
        date_rebate: item.date_rebate ?? null,
      }

      // Criação real do produto
      const createdProduct = await productService.createProduct(productPayload)
      if (!createdProduct?.id) {
        throw new Error('Falha ao inserir produto no catálogo')
      }

      const newProductId = createdProduct.id

      // 3. Atualizar status na staging table
      await (supabase as any)
        .from('product_import_staging')
        .update({
          status: 'confirmed',
          confirmed_product_id: newProductId,
          confirmed_category_id: finalCategoryId,
          confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', stagingId)

      // 4. Memorizar mapeamento se houver categoria original informada
      if (item.original_category && item.original_category.trim()) {
        await this.saveCategoryMapping({
          sourceCategory: item.original_category.trim(),
          targetCategoryId: finalCategoryId,
          targetCategoryName: finalCategoryName,
          sourceType: item.batch_source || 'manual',
        })
      }

      // 5. Disparar pipeline de relacionados em segundo plano (regra obrigatória)
      relatedProductsService.triggerBackgroundGeneration(newProductId)

      return { success: true, productId: newProductId }
    } catch (e: any) {
      console.error('Erro ao confirmar item de staging:', e)
      return { success: false, error: e?.message || 'Erro desconhecido ao confirmar' }
    }
  },

  /**
   * Descarta um único item da staging table
   */
  async discardSingleStagingItem(
    stagingId: string,
    reason: string = 'Descartado pelo operador',
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await (supabase as any)
        .from('product_import_staging')
        .update({
          status: 'discarded',
          discard_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', stagingId)

      if (error) throw error
      return { success: true }
    } catch (e: any) {
      console.error('Erro ao descartar item da staging:', e)
      return { success: false, error: e?.message }
    }
  },

  /**
   * Processamento em lote de confirmação em chunks de 10 em 10
   */
  async confirmBatchChunked(
    items: Array<{
      stagingId: string
      categoryId: string
      categoryName: string
    }>,
    onProgress?: (current: number, total: number) => void,
  ): Promise<{ confirmedCount: number; errors: Array<{ id: string; error: string }> }> {
    const total = items.length
    let confirmedCount = 0
    const errors: Array<{ id: string; error: string }> = []
    const CHUNK_SIZE = 10

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE)

      await Promise.all(
        chunk.map(async (entry) => {
          const res = await this.confirmSingleStagingItem({
            stagingId: entry.stagingId,
            finalCategoryId: entry.categoryId,
            finalCategoryName: entry.categoryName,
          })
          if (res.success) {
            confirmedCount++
          } else {
            errors.push({ id: entry.stagingId, error: res.error || 'Erro' })
          }
        }),
      )

      if (onProgress) {
        onProgress(Math.min(i + CHUNK_SIZE, total), total)
      }

      // Pequena pausa entre chunks
      await new Promise((r) => setTimeout(r, 200))
    }

    return { confirmedCount, errors }
  },

  /**
   * Processamento em lote de descarte em chunks de 10 em 10
   */
  async discardBatchChunked(
    stagingIds: string[],
    reason: string = 'Descarte em lote pelo operador',
    onProgress?: (current: number, total: number) => void,
  ): Promise<{ discardedCount: number; errors: Array<{ id: string; error: string }> }> {
    const total = stagingIds.length
    let discardedCount = 0
    const errors: Array<{ id: string; error: string }> = []
    const CHUNK_SIZE = 10

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = stagingIds.slice(i, i + CHUNK_SIZE)

      await Promise.all(
        chunk.map(async (id) => {
          const res = await this.discardSingleStagingItem(id, reason)
          if (res.success) {
            discardedCount++
          } else {
            errors.push({ id, error: res.error || 'Erro' })
          }
        }),
      )

      if (onProgress) {
        onProgress(Math.min(i + CHUNK_SIZE, total), total)
      }

      await new Promise((r) => setTimeout(r, 150))
    }

    return { discardedCount, errors }
  },
}
