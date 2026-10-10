/**
 * Serviço de Diagnóstico de Padronização de SKU e Colisões (Rodada 1 - Modo Dry-Run)
 *
 * Princípios fundamentais:
 * - Somente leitura da tabela public.products.
 * - NUNCA altera products.price_usd nem qualquer outro campo de products nesta rodada.
 * - Suporta persistência de decisões do usuário na tabela de apoio `sku_collision_decisions`.
 */

import { supabase } from '@/lib/supabase/client'
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
  created_at: string
  updated_at: string
  last_reviewed_at: string
  normalizedSku: string
  hasDash: boolean
  isSony: boolean
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
      const { data: decData, error: decError } = await (supabase as any)
        .from('sku_collision_decisions')
        .select('*')
      if (!decError && decData) {
        existingDecisions = decData
      }
    } catch (e) {
      // Tabela pode ainda estar sendo criada via migração
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
          'id, name, sku, manufacturer_id, price_usd, price_cost, is_discontinued, is_special, image_url, created_at, updated_at, last_reviewed_at',
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
    const { error } = await (supabase as any).from('sku_collision_decisions').upsert(
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
}
