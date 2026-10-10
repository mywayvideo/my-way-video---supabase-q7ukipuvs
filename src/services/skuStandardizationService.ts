/**
 * Serviço de Diagnóstico de Padronização de SKU e Colisões (Rodada 1 - Modo Dry-Run)
 *
 * Princípios fundamentais:
 * - Somente leitura da tabela public.products.
 * - NUNCA altera products.price_usd nem qualquer outro campo de products nesta rodada.
 * - Suporta persistência de decisões do usuário na tabela de apoio `sku_collision_decisions`.
 */

import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'
import {
  normalizeSkuKey,
  formatSonyStandardSku,
  hasSkuDash,
  isSonyBrand,
} from '@/utils/sku-normalization'

export interface SkuProductItem {
  id: string
  name: string
  sku: string | null
  manufacturer_id: string | null
  manufacturer_name: string
  price_usd: number | null
  price_cost: number | null
  is_discontinued: boolean
  is_special: boolean
  image_url: string | null
  website_url?: string | null
  ncm?: string | null
  description?: string | null
  technical_info?: string | null
  created_at: string
  updated_at: string
  last_reviewed_at: string
  normalizedSku: string
  hasDash: boolean
  isSony: boolean
}

export interface MergedFieldDetail {
  field: string
  previousValue: any
  mergedValue: any
  sourceProductId: string
  sourceSku: string | null
}

export interface MergeResultItem {
  preferredProductId: string
  preferredSkuBefore: string | null
  preferredSkuAfter: string | null
  preferredName: string
  mergedFields: MergedFieldDetail[]
  deactivatedProducts: {
    id: string
    sku: string | null
    name: string
    wasAlreadyDiscontinued: boolean
  }[]
  normalizedSku: string
}

export interface RenamedSkuItem {
  id: string
  name: string
  oldSku: string
  newSku: string
  lastReviewedAtBefore?: string
  lastReviewedAtAfter: string
  updatedAtAfter: string
}

export interface SkippedCollisionItem {
  normalizedSku: string
  brand: string
  reason: 'undecided' | 'distinct_products' | 'missing_preferred'
  productIds: string[]
  productSkus: (string | null)[]
}

export interface BackfillPlanPreview {
  canExecute: boolean
  missingTableError?: string | null
  renamesCount: number
  renamesPreview: { id: string; oldSku: string; newSku: string; name: string }[]
  mergesCount: number
  mergesPreview: {
    normalizedSku: string
    preferredProduct: { id: string; sku: string | null; name: string }
    secondaryProducts: { id: string; sku: string | null; name: string }[]
    fieldsToMerge: string[]
  }[]
  skippedCollisionsCount: number
  skippedCollisions: SkippedCollisionItem[]
  distinctCollisionsCount: number
  alreadyStandardizedCount: number
  totalSonyProducts: number
}

export interface BackfillExecutionReport {
  success: boolean
  startedAt: string
  finishedAt: string
  totalSonyRenamed: number
  renamedItems: RenamedSkuItem[]
  totalLosersDeactivated: number
  mergedGroups: MergeResultItem[]
  skippedCollisions: SkippedCollisionItem[]
  errors: { id?: string; sku?: string; error: string }[]
}

export interface SkuCollisionGroup {
  normalizedSku: string
  brand: string
  isSony: boolean
  products: SkuProductItem[]
  suggestedPreferredId?: string
  decision?: {
    id?: string
    decision_type: 'keep_preferred' | 'distinct_products' | 'merge_pending' | 'undecided'
    preferred_product_id?: string | null
    notes?: string | null
    decided_at?: string | null
  }
}

export interface SkuDiagnosisStats {
  totalProducts: number
  sony: {
    total: number
    withDash: number
    withoutDash: number
    noSku: number
    alreadyIdenticalAfterNorm: number
    sampleWithDash: SkuProductItem[]
    sampleWithoutDash: SkuProductItem[]
  }
  otherBrands: {
    total: number
    withDash: number
    withoutDash: number
    noSku: number
    sampleWithDash: SkuProductItem[]
  }
  collisions: {
    sonyCount: number
    otherBrandsSameBrandCount: number
    crossBrandCount: number
    totalCollidingProducts: number
  }
}

export interface SkuDiagnosisResult {
  stats: SkuDiagnosisStats
  sonyCollisions: SkuCollisionGroup[]
  otherCollisions: SkuCollisionGroup[]
  crossBrandCollisions: SkuCollisionGroup[]
  sonyDashProducts: SkuProductItem[]
  decisionsMap: Record<string, any>
}

/**
 * Função pura para processar uma lista de produtos brutos e fabricantes em estatísticas e colisões
 */
export function analyzeProductsSku(
  products: any[],
  manufacturersMap: Map<string, string>,
  existingDecisions: any[] = [],
): SkuDiagnosisResult {
  const items: SkuProductItem[] = products.map((p) => {
    const mfrName = (p.manufacturer_id ? manufacturersMap.get(p.manufacturer_id) : '') || ''
    const isSony = isSonyBrand(mfrName)
    const rawSku = p.sku || null
    const norm = normalizeSkuKey(rawSku)
    const dash = hasSkuDash(rawSku)

    return {
      id: p.id,
      name: p.name || 'Sem nome',
      sku: rawSku,
      manufacturer_id: p.manufacturer_id || null,
      manufacturer_name: mfrName || (isSony ? 'Sony' : 'Sem Fabricante'),
      price_usd: p.price_usd != null ? Number(p.price_usd) : null,
      price_cost: p.price_cost != null ? Number(p.price_cost) : null,
      is_discontinued: Boolean(p.is_discontinued),
      is_special: Boolean(p.is_special),
      image_url: p.image_url || null,
      website_url: p.website_url || null,
      ncm: p.ncm || null,
      description: p.description || null,
      technical_info: p.technical_info || null,
      created_at: p.created_at || '',
      updated_at: p.updated_at || '',
      last_reviewed_at: p.last_reviewed_at || '',
      normalizedSku: norm,
      hasDash: dash,
      isSony,
    }
  })

  // Estatísticas Sony
  const sonyItems = items.filter((p) => p.isSony)
  const otherItems = items.filter((p) => !p.isSony)

  let sonyWithDash = 0
  let sonyWithoutDash = 0
  let sonyNoSku = 0
  let sonyAlreadyIdentical = 0
  const sonySampleWithDash: SkuProductItem[] = []
  const sonySampleWithoutDash: SkuProductItem[] = []

  const sonyDashProducts: SkuProductItem[] = []

  for (const item of sonyItems) {
    if (!item.sku || item.sku.trim() === '') {
      sonyNoSku++
      continue
    }
    if (item.hasDash) {
      sonyWithDash++
      sonyDashProducts.push(item)
      if (sonySampleWithDash.length < 15) sonySampleWithDash.push(item)
    } else {
      sonyWithoutDash++
      if (sonySampleWithoutDash.length < 15) sonySampleWithoutDash.push(item)
    }

    if (item.sku === item.normalizedSku) {
      sonyAlreadyIdentical++
    }
  }

  // Estatísticas Outras Marcas
  let otherWithDash = 0
  let otherWithoutDash = 0
  let otherNoSku = 0
  const otherSampleWithDash: SkuProductItem[] = []

  for (const item of otherItems) {
    if (!item.sku || item.sku.trim() === '') {
      otherNoSku++
      continue
    }
    if (item.hasDash) {
      otherWithDash++
      if (otherSampleWithDash.length < 15) otherSampleWithDash.push(item)
    } else {
      otherWithoutDash++
    }
  }

  // Mapa de decisões existentes
  const decisionsMap: Record<string, any> = {}
  for (const dec of existingDecisions) {
    const key = `${dec.normalized_sku}_${dec.brand}`
    decisionsMap[key] = dec
  }

  // Detecção de COLISÕES
  // 1. Agrupar Sony por SKU Normalizado
  const sonyGrouped = new Map<string, SkuProductItem[]>()
  for (const item of sonyItems) {
    if (!item.normalizedSku) continue
    if (!sonyGrouped.has(item.normalizedSku)) {
      sonyGrouped.set(item.normalizedSku, [])
    }
    sonyGrouped.get(item.normalizedSku)!.push(item)
  }

  const sonyCollisions: SkuCollisionGroup[] = []
  for (const [normSku, list] of sonyGrouped.entries()) {
    if (list.length > 1) {
      // Sugestão de preferred: ativo > com preço > mais recente
      const sorted = [...list].sort((a, b) => {
        if (!a.is_discontinued && b.is_discontinued) return -1
        if (a.is_discontinued && !b.is_discontinued) return 1
        if (a.price_usd != null && b.price_usd == null) return -1
        if (a.price_usd == null && b.price_usd != null) return 1
        return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
      })

      const decKey = `${normSku}_Sony`
      const dec = decisionsMap[decKey]

      sonyCollisions.push({
        normalizedSku: normSku,
        brand: 'Sony',
        isSony: true,
        products: list,
        suggestedPreferredId: sorted[0]?.id,
        decision: dec
          ? {
              id: dec.id,
              decision_type: dec.decision_type,
              preferred_product_id: dec.preferred_product_id,
              notes: dec.notes,
              decided_at: dec.decided_at,
            }
          : undefined,
      })
    }
  }

  // 2. Colisões em Outras Marcas (mesma marca)
  const otherByBrandAndNorm = new Map<string, SkuProductItem[]>()
  for (const item of otherItems) {
    if (!item.normalizedSku) continue
    const key = `${item.manufacturer_name}|||${item.normalizedSku}`
    if (!otherByBrandAndNorm.has(key)) {
      otherByBrandAndNorm.set(key, [])
    }
    otherByBrandAndNorm.get(key)!.push(item)
  }

  const otherCollisions: SkuCollisionGroup[] = []
  for (const [brandKey, list] of otherByBrandAndNorm.entries()) {
    if (list.length > 1) {
      const [brand, normSku] = brandKey.split('|||')
      const decKey = `${normSku}_${brand}`
      const dec = decisionsMap[decKey]

      otherCollisions.push({
        normalizedSku: normSku,
        brand,
        isSony: false,
        products: list,
        decision: dec
          ? {
              id: dec.id,
              decision_type: dec.decision_type,
              preferred_product_id: dec.preferred_product_id,
              notes: dec.notes,
              decided_at: dec.decided_at,
            }
          : undefined,
      })
    }
  }

  // 3. Colisões Cruzadas entre marcas distintas (Cross-Brand)
  const globalByNorm = new Map<string, SkuProductItem[]>()
  for (const item of items) {
    if (!item.normalizedSku) continue
    if (!globalByNorm.has(item.normalizedSku)) {
      globalByNorm.set(item.normalizedSku, [])
    }
    globalByNorm.get(item.normalizedSku)!.push(item)
  }

  const crossBrandCollisions: SkuCollisionGroup[] = []
  for (const [normSku, list] of globalByNorm.entries()) {
    const brands = new Set(list.map((p) => p.manufacturer_name))
    if (brands.size > 1) {
      const decKey = `${normSku}_CrossBrand`
      const dec = decisionsMap[decKey]

      crossBrandCollisions.push({
        normalizedSku: normSku,
        brand: Array.from(brands).join(' / '),
        isSony: list.some((p) => p.isSony),
        products: list,
        decision: dec
          ? {
              id: dec.id,
              decision_type: dec.decision_type,
              preferred_product_id: dec.preferred_product_id,
              notes: dec.notes,
              decided_at: dec.decided_at,
            }
          : undefined,
      })
    }
  }

  const totalColliding =
    sonyCollisions.reduce((sum, g) => sum + g.products.length, 0) +
    otherCollisions.reduce((sum, g) => sum + g.products.length, 0)

  return {
    stats: {
      totalProducts: items.length,
      sony: {
        total: sonyItems.length,
        withDash: sonyWithDash,
        withoutDash: sonyWithoutDash,
        noSku: sonyNoSku,
        alreadyIdenticalAfterNorm: sonyAlreadyIdentical,
        sampleWithDash: sonySampleWithDash,
        sampleWithoutDash: sonySampleWithoutDash,
      },
      otherBrands: {
        total: otherItems.length,
        withDash: otherWithDash,
        withoutDash: otherWithoutDash,
        noSku: otherNoSku,
        sampleWithDash: otherSampleWithDash,
      },
      collisions: {
        sonyCount: sonyCollisions.length,
        otherBrandsSameBrandCount: otherCollisions.length,
        crossBrandCount: crossBrandCollisions.length,
        totalCollidingProducts: totalColliding,
      },
    },
    sonyCollisions,
    otherCollisions,
    crossBrandCollisions,
    sonyDashProducts,
    decisionsMap,
  }
}

export const skuStandardizationService = {
  /**
   * Executa a análise completa em modo dry-run puxando a base de dados em páginas
   */
  async runDryRunDiagnosis(): Promise<SkuDiagnosisResult> {
    // 1. Fabricantes
    const { data: mfrs, error: mfrError } = await supabase.from('manufacturers').select('id, name')

    if (mfrError) {
      console.warn('Erro ao carregar fabricantes:', mfrError.message)
    }

    const manufacturersMap = new Map<string, string>()
    ;(mfrs || []).forEach((m: any) => {
      manufacturersMap.set(m.id, m.name)
    })

    // 2. Decisões prévias gravadas (se houver tabela)
    let existingDecisions: any[] = []
    try {
      const { data: decData, error: decError } = await supabase
        .from('sku_collision_decisions')
        .select('*')
      if (!decError && decData) {
        existingDecisions = decData
      } else if (decError) {
        console.warn('Aviso ao carregar decisões de colisão:', decError.message)
      }
    } catch (e) {
      console.warn('Tabela sku_collision_decisions não consultável:', e)
    }

    // 3. Paginar todos os produtos de public.products (leitura pura)
    const allProducts: any[] = []
    let page = 0
    const pageSize = 1000

    while (true) {
      const { data, error } = await supabase
        .from('products')
        .select(
          'id, name, sku, manufacturer_id, price_usd, price_cost, is_discontinued, is_special, image_url, website_url, ncm, description, technical_info, created_at, updated_at, last_reviewed_at',
        )
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (error) {
        throw new Error(`Erro ao buscar produtos: ${error.message}`)
      }

      if (!data || data.length === 0) break
      allProducts.push(...data)
      if (data.length < pageSize) break
      page++
    }

    return analyzeProductsSku(allProducts, manufacturersMap, existingDecisions)
  },

  /**
   * Grava uma decisão de colisão na tabela de apoio sku_collision_decisions
   * NUNCA altera public.products nesta rodada.
   */
  async saveCollisionDecision(params: {
    normalizedSku: string
    brand: string
    isSony: boolean
    preferredProductId?: string | null
    secondaryProductIds?: string[]
    decisionType: 'keep_preferred' | 'distinct_products' | 'merge_pending' | 'undecided'
    notes?: string
    decidedBy?: string
  }): Promise<void> {
    const nowIso = new Date().toISOString()
    const { error } = await supabase.from('sku_collision_decisions').upsert(
      {
        normalized_sku: params.normalizedSku,
        brand: params.brand,
        is_sony: params.isSony,
        preferred_product_id: params.preferredProductId || null,
        secondary_product_ids: params.secondaryProductIds || [],
        decision_type: params.decisionType,
        notes: params.notes || null,
        decided_by: params.decidedBy || 'admin',
        decided_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'normalized_sku,brand' },
    )

    if (error) {
      throw new Error(`Erro ao salvar decisão de colisão: ${error.message}`)
    }
  },

  /**
   * Verifica se a tabela de apoio sku_collision_decisions existe e está acessível.
   * Se não existir ou a query falhar por ausência da tabela, retorna mensagem instrutiva.
   */
  async checkDecisionsTableAccessible(): Promise<{ accessible: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.from('sku_collision_decisions').select('id').limit(1)

      if (error) {
        return {
          accessible: false,
          error: `A tabela "sku_collision_decisions" não está acessível no Supabase (${error.message}). Por favor, execute o script SQL "supabase/migrations/20261009120000_create_sku_collision_decisions.sql" no SQL Editor do painel Supabase e execute "NOTIFY pgrst, 'reload schema';" para prosseguir com a Rodada 2.`,
        }
      }

      return { accessible: true }
    } catch (e: any) {
      return {
        accessible: false,
        error: `Exceção ao verificar "sku_collision_decisions": ${e?.message || String(e)}. Execute a migração no painel Supabase para prosseguir.`,
      }
    }
  },

  /**
   * Calcula o preview das ações que serão executadas na Rodada 2:
   * - Produtos Sony a renomear
   * - Grupos com decisão 'keep_preferred' para mesclar e desativar perdedor
   * - Colisões pendentes (puladas)
   * - Colisões distintas (mantidas)
   */
  async getBackfillPreview(): Promise<BackfillPlanPreview> {
    // 1. Verificar tabela de decisões
    const tableCheck = await this.checkDecisionsTableAccessible()
    if (!tableCheck.accessible) {
      return {
        canExecute: false,
        missingTableError: tableCheck.error,
        renamesCount: 0,
        renamesPreview: [],
        mergesCount: 0,
        mergesPreview: [],
        skippedCollisionsCount: 0,
        skippedCollisions: [],
        distinctCollisionsCount: 0,
        alreadyStandardizedCount: 0,
        totalSonyProducts: 0,
      }
    }

    // 2. Carregar diagnóstico completo
    const diag = await this.runDryRunDiagnosis()

    const sonyCollisions = diag.sonyCollisions
    const sonyCollidingProductIds = new Set<string>()
    sonyCollisions.forEach((g) => {
      g.products.forEach((p) => sonyCollidingProductIds.add(p.id))
    })

    const skippedCollisions: SkippedCollisionItem[] = []
    let distinctCollisionsCount = 0

    // Mapear perdedores que serão desativados
    const loserProductIds = new Set<string>()
    const preferredProductIds = new Set<string>()

    const mergesPreview: BackfillPlanPreview['mergesPreview'] = []

    for (const group of sonyCollisions) {
      const dec = group.decision
      if (!dec || dec.decision_type === 'undecided') {
        skippedCollisions.push({
          normalizedSku: group.normalizedSku,
          brand: group.brand,
          reason: 'undecided',
          productIds: group.products.map((p) => p.id),
          productSkus: group.products.map((p) => p.sku),
        })
        continue
      }

      if (dec.decision_type === 'distinct_products') {
        distinctCollisionsCount++
        skippedCollisions.push({
          normalizedSku: group.normalizedSku,
          brand: group.brand,
          reason: 'distinct_products',
          productIds: group.products.map((p) => p.id),
          productSkus: group.products.map((p) => p.sku),
        })
        continue
      }

      if (dec.decision_type === 'keep_preferred') {
        const prefId = dec.preferred_product_id
        const preferred = group.products.find((p) => p.id === prefId)
        if (!preferred) {
          skippedCollisions.push({
            normalizedSku: group.normalizedSku,
            brand: group.brand,
            reason: 'missing_preferred',
            productIds: group.products.map((p) => p.id),
            productSkus: group.products.map((p) => p.sku),
          })
          continue
        }

        preferredProductIds.add(preferred.id)
        const secondaries = group.products.filter((p) => p.id !== preferred.id)
        secondaries.forEach((s) => loserProductIds.add(s.id))

        // Determinar campos que podem ser mesclados
        const fieldsToMerge: string[] = []
        for (const sec of secondaries) {
          if (!preferred.website_url && sec.website_url) fieldsToMerge.push('website_url')
          if (!preferred.image_url && sec.image_url) fieldsToMerge.push('image_url')
          if (!preferred.ncm && sec.ncm) fieldsToMerge.push('ncm')
          if (!preferred.description && sec.description) fieldsToMerge.push('description')
          if (!preferred.technical_info && sec.technical_info) fieldsToMerge.push('technical_info')
        }

        mergesPreview.push({
          normalizedSku: group.normalizedSku,
          preferredProduct: { id: preferred.id, sku: preferred.sku, name: preferred.name },
          secondaryProducts: secondaries.map((s) => ({ id: s.id, sku: s.sku, name: s.name })),
          fieldsToMerge: Array.from(new Set(fieldsToMerge)),
        })
      }
    }

    // Produtos Sony a renomear:
    // Critérios:
    // 1. isSony = true
    // 2. hasDash = true ou sku !== formatSonyStandardSku(sku)
    // 3. NÃO é perdedor de colisão (loserProductIds) — perdedores serão aposentados
    // 4. Se faz parte de uma colisão, só pode ser renomeado se a colisão estiver decidida como keep_preferred E ele for o preferred
    // 5. Se a colisão estiver undecided ou distinct_products, fica fora do rename
    const renamesPreview: BackfillPlanPreview['renamesPreview'] = []
    let alreadyStandardizedCount = 0

    // Carregar todos os produtos Sony
    for (const p of diag.sonyDashProducts) {
      if (loserProductIds.has(p.id)) {
        // Ignora perdedor, será desativado
        continue
      }

      if (sonyCollidingProductIds.has(p.id)) {
        // Só renomeia se for o preferred de uma colisão keep_preferred
        if (!preferredProductIds.has(p.id)) {
          continue
        }
      }

      const standardSku = formatSonyStandardSku(p.sku)
      if (standardSku && standardSku !== p.sku) {
        renamesPreview.push({
          id: p.id,
          oldSku: p.sku || '',
          newSku: standardSku,
          name: p.name,
        })
      }
    }

    // Contar já padronizados
    const totalSony = diag.stats.sony.total
    alreadyStandardizedCount = diag.stats.sony.alreadyIdenticalAfterNorm

    return {
      canExecute: true,
      missingTableError: null,
      renamesCount: renamesPreview.length,
      renamesPreview,
      mergesCount: mergesPreview.length,
      mergesPreview,
      skippedCollisionsCount: skippedCollisions.length,
      skippedCollisions,
      distinctCollisionsCount,
      alreadyStandardizedCount,
      totalSonyProducts: totalSony,
    }
  },

  /**
   * Executa a Rodada 2 completa:
   * 1. Valida existência da tabela sku_collision_decisions.
   * 2. Desativação + Mesclagem de perdedores em colisões decididas (keep_preferred).
   * 3. Backfill em massa de SKUs Sony com traço (SEM alterar price_usd, mantendo regra de datas).
   * 4. Gera relatório final estruturado.
   */
  async executeRound2Backfill(
    onProgress?: (progress: { stage: string; current: number; total: number }) => void,
  ): Promise<BackfillExecutionReport> {
    const startedAt = new Date().toISOString()

    // 1. Salvaguarda: Verificar tabela de decisões
    const tableCheck = await this.checkDecisionsTableAccessible()
    if (!tableCheck.accessible) {
      throw new Error(tableCheck.error)
    }

    // 2. Carregar diagnósticos e produtos frescos
    if (onProgress) onProgress({ stage: 'Carregando base e decisões...', current: 0, total: 100 })
    const diag = await this.runDryRunDiagnosis()

    const sonyCollisions = diag.sonyCollisions
    const sonyCollidingProductIds = new Set<string>()
    sonyCollisions.forEach((g) => {
      g.products.forEach((p) => sonyCollidingProductIds.add(p.id))
    })

    const skippedCollisions: SkippedCollisionItem[] = []
    const mergedGroups: MergeResultItem[] = []
    const renamedItems: RenamedSkuItem[] = []
    const errors: { id?: string; sku?: string; error: string }[] = []

    const loserProductIds = new Set<string>()
    const preferredProductIds = new Set<string>()

    // ETAPA 1: Processar Colisões e Mesclagens
    if (onProgress)
      onProgress({ stage: 'Processando mesclagens e desativações...', current: 10, total: 100 })

    for (let i = 0; i < sonyCollisions.length; i++) {
      const group = sonyCollisions[i]
      const dec = group.decision

      if (!dec || dec.decision_type === 'undecided') {
        skippedCollisions.push({
          normalizedSku: group.normalizedSku,
          brand: group.brand,
          reason: 'undecided',
          productIds: group.products.map((p) => p.id),
          productSkus: group.products.map((p) => p.sku),
        })
        continue
      }

      if (dec.decision_type === 'distinct_products') {
        skippedCollisions.push({
          normalizedSku: group.normalizedSku,
          brand: group.brand,
          reason: 'distinct_products',
          productIds: group.products.map((p) => p.id),
          productSkus: group.products.map((p) => p.sku),
        })
        continue
      }

      if (dec.decision_type === 'keep_preferred') {
        const prefId = dec.preferred_product_id
        const preferred = group.products.find((p) => p.id === prefId)
        if (!preferred) {
          skippedCollisions.push({
            normalizedSku: group.normalizedSku,
            brand: group.brand,
            reason: 'missing_preferred',
            productIds: group.products.map((p) => p.id),
            productSkus: group.products.map((p) => p.sku),
          })
          continue
        }

        preferredProductIds.add(preferred.id)
        const secondaries = group.products.filter((p) => p.id !== preferred.id)
        secondaries.forEach((s) => loserProductIds.add(s.id))

        // Comparar dados e preparar mesclagem não destrutiva
        const mergedFields: MergedFieldDetail[] = []
        const updatesForPreferred: Database['public']['Tables']['products']['Update'] = {}

        // Campos a comparar e aproveitar do perdedor se o prevalente não tiver
        const candidateFields: ('website_url' | 'image_url' | 'description' | 'technical_info')[] =
          ['website_url', 'image_url', 'description', 'technical_info']

        // Também verificar se o perdedor tem conferência mais recente
        let mostRecentReview = preferred.last_reviewed_at || ''

        for (const sec of secondaries) {
          for (const f of candidateFields) {
            const prefVal = (preferred as any)[f]
            const secVal = (sec as any)[f]
            const isPrefEmpty = prefVal == null || String(prefVal).trim() === ''
            const isSecFilled = secVal != null && String(secVal).trim() !== ''

            if (isPrefEmpty && isSecFilled && !(f in updatesForPreferred)) {
              ;(updatesForPreferred as any)[f] = secVal
              mergedFields.push({
                field: f,
                previousValue: prefVal,
                mergedValue: secVal,
                sourceProductId: sec.id,
                sourceSku: sec.sku,
              })
            }
          }

          // Tratar ncm separadamente por tipagem
          const prefNcm = preferred.ncm
          const secNcm = sec.ncm
          if (
            (!prefNcm || !String(prefNcm).trim()) &&
            secNcm &&
            String(secNcm).trim() &&
            !updatesForPreferred.ncm
          ) {
            updatesForPreferred.ncm = secNcm
            mergedFields.push({
              field: 'ncm',
              previousValue: prefNcm,
              mergedValue: secNcm,
              sourceProductId: sec.id,
              sourceSku: sec.sku,
            })
          }

          if (
            sec.last_reviewed_at &&
            (!mostRecentReview || new Date(sec.last_reviewed_at) > new Date(mostRecentReview))
          ) {
            mostRecentReview = sec.last_reviewed_at
          }
        }

        // Se o preferred precisar de SKU padronizado (sem traço), já padroniza junto
        const standardSku = formatSonyStandardSku(preferred.sku)
        let newPreferredSku = preferred.sku
        if (standardSku && standardSku !== preferred.sku) {
          updatesForPreferred.sku = standardSku
          newPreferredSku = standardSku
        }

        // Se houver atualizações para o preferred, executa com regra de datas
        const nowIso = new Date().toISOString()
        if (Object.keys(updatesForPreferred).length > 0) {
          updatesForPreferred.updated_at = nowIso
          updatesForPreferred.last_reviewed_at = nowIso

          try {
            const { error: prefErr } = await supabase
              .from('products')
              .update(updatesForPreferred)
              .eq('id', preferred.id)

            if (prefErr) {
              errors.push({
                id: preferred.id,
                sku: preferred.sku,
                error: `Erro ao atualizar prevalente: ${prefErr.message}`,
              })
            }
          } catch (err: any) {
            errors.push({
              id: preferred.id,
              sku: preferred.sku,
              error: `Exceção ao atualizar prevalente: ${err.message}`,
            })
          }
        }

        // Desativar secundários (perdedores): is_discontinued = true, com regra de datas
        const deactivatedList: MergeResultItem['deactivatedProducts'] = []
        for (const sec of secondaries) {
          try {
            const wasDiscontinued = sec.is_discontinued
            const { error: secErr } = await supabase
              .from('products')
              .update({
                is_discontinued: true,
                updated_at: nowIso,
                last_reviewed_at: nowIso,
              })
              .eq('id', sec.id)

            if (secErr) {
              errors.push({
                id: sec.id,
                sku: sec.sku,
                error: `Erro ao desativar produto perdedor: ${secErr.message}`,
              })
            } else {
              deactivatedList.push({
                id: sec.id,
                sku: sec.sku,
                name: sec.name,
                wasAlreadyDiscontinued: wasDiscontinued,
              })
            }
          } catch (err: any) {
            errors.push({
              id: sec.id,
              sku: sec.sku,
              error: `Exceção ao desativar perdedor: ${err.message}`,
            })
          }
        }

        mergedGroups.push({
          preferredProductId: preferred.id,
          preferredSkuBefore: preferred.sku,
          preferredSkuAfter: newPreferredSku,
          preferredName: preferred.name,
          mergedFields,
          deactivatedProducts: deactivatedList,
          normalizedSku: group.normalizedSku,
        })
      }
    }

    // ETAPA 2: Backfill de SKUs Sony com traço (Produtos restantes)
    if (onProgress)
      onProgress({ stage: 'Executando renomeação dos SKUs Sony...', current: 40, total: 100 })

    const toRename: SkuProductItem[] = []
    for (const p of diag.sonyDashProducts) {
      // Ignorar perdedor já desativado
      if (loserProductIds.has(p.id)) continue

      // Se fazia parte de colisão
      if (sonyCollidingProductIds.has(p.id)) {
        // Se era o preferred, já foi tratado no passo anterior
        continue
      }

      const standardSku = formatSonyStandardSku(p.sku)
      if (standardSku && standardSku !== p.sku) {
        toRename.push(p)
      }
    }

    const totalToRename = toRename.length
    for (let i = 0; i < totalToRename; i++) {
      const p = toRename[i]
      const standardSku = formatSonyStandardSku(p.sku)
      const nowIso = new Date().toISOString()

      try {
        const { error: updateErr } = await supabase
          .from('products')
          .update({
            sku: standardSku,
            updated_at: nowIso,
            last_reviewed_at: nowIso,
          })
          .eq('id', p.id)

        if (updateErr) {
          errors.push({ id: p.id, sku: p.sku, error: `Erro ao renomear SKU: ${updateErr.message}` })
        } else {
          renamedItems.push({
            id: p.id,
            name: p.name,
            oldSku: p.sku || '',
            newSku: standardSku,
            lastReviewedAtBefore: p.last_reviewed_at,
            lastReviewedAtAfter: nowIso,
            updatedAtAfter: nowIso,
          })
        }
      } catch (err: any) {
        errors.push({ id: p.id, sku: p.sku, error: `Exceção ao renomear SKU: ${err.message}` })
      }

      if (onProgress && i % 10 === 0) {
        const currentPct = 40 + Math.floor(((i + 1) / (totalToRename || 1)) * 55)
        onProgress({
          stage: `Renomeando SKUs Sony (${i + 1}/${totalToRename})...`,
          current: currentPct,
          total: 100,
        })
      }
    }

    if (onProgress) onProgress({ stage: 'Finalizando execução...', current: 100, total: 100 })

    const finishedAt = new Date().toISOString()
    const totalLosers = mergedGroups.reduce((acc, g) => acc + g.deactivatedProducts.length, 0)

    return {
      success: errors.length === 0,
      startedAt,
      finishedAt,
      totalSonyRenamed: renamedItems.length,
      renamedItems,
      totalLosersDeactivated: totalLosers,
      mergedGroups,
      skippedCollisions,
      errors,
    }
  },
}
