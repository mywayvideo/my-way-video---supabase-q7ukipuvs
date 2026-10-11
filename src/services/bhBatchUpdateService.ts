import {
  PriceCheckResult,
  PriceCheckStatus,
  priceCheckService,
  extractRebateInfo,
  resolvePairedEvaluation,
} from './priceCheckService'
import { ExistingRebateRule } from './rebateDiscountService'
import { supabase } from '@/lib/supabase/client'

export interface ProductBatchItem {
  id: string
  name: string
  sku: string | null
  category?: string | null
  price_usd: number | null
  price_cost?: number | null
  price_usa_rebate?: number | null
  price_cost_rebate?: number | null
  date_rebate?: string | null
  website_url: string | null
  is_discontinued: boolean
  updated_at: string
  last_reviewed_at: string
  manufacturer?: {
    id?: string
    name?: string
  } | null
  // Estado do processamento em lote
  batchStatus?: 'idle' | 'processing' | 'done' | 'error'
  checkResult?: PriceCheckResult | null
  errorMessage?: string | null
  manualUrlDraft?: string
  isApplyingPrice?: boolean
  isSavingUrl?: boolean
  isReviewing?: boolean
  isAnalyzingUrl?: boolean
  isUpdatingDiscontinued?: boolean
}

export interface BatchProcessingStats {
  totalSelected: number
  processedCount: number
  okCount: number
  divergenceCount: number
  urlDiscoveredCount: number
  doubtfulLinkCount: number
  discontinuedCount: number
  errorCount: number
  rebateDetectedCount: number
}

export interface BatchFilterOptions {
  filterType: 'all' | 'without_link' | 'with_link' | 'discontinued'
  searchQuery: string
  sortBy: 'updated_at_asc' | 'updated_at_desc' | 'name_asc' | 'price_desc'
}

export interface BhBatchJobRecord {
  id: string
  user_id?: string | null
  status: 'in_progress' | 'paused' | 'completed' | 'cancelled' | 'error'
  total_items: number
  processed_items: number
  current_product_id?: string | null
  product_ids: string[]
  processed_ids: string[]
  stats: BatchProcessingStats
  results: Record<
    string,
    {
      checkResult?: PriceCheckResult | null
      batchStatus: 'idle' | 'processing' | 'done' | 'error'
      errorMessage?: string | null
      website_url?: string | null
      price_usd?: number | null
    }
  >
  metadata?: {
    cooldownSeconds?: number
    batchSize?: number
    started_at?: string
  }
  created_at?: string
  updated_at?: string
  completed_at?: string | null
}

export const bhBatchUpdateService = {
  /**
   * Avalia um item individual no contexto do lote aplicando a lógica pareada compartilhada.
   * Se houver rebate ativo no cadastro e na B&H, avalia par cheio e par desconto.
   */
  resolveItemPairedEvaluation(
    item: ProductBatchItem,
    rebateRule?: ExistingRebateRule | null,
  ): {
    effectiveStatus: PriceCheckStatus | null
    effectiveMessage: string | null
    rebateInfo: ReturnType<typeof extractRebateInfo>
    pairedEval: ReturnType<typeof resolvePairedEvaluation>['pairedEval']
  } {
    const checkRes = item.checkResult
    if (!checkRes && !item.batchStatus) {
      return {
        effectiveStatus: null,
        effectiveMessage: null,
        rebateInfo: extractRebateInfo({}),
        pairedEval: null,
      }
    }

    const rebateInfo = extractRebateInfo({
      checkResult: checkRes,
      message: checkRes?.message || item.errorMessage,
      catalogPriceUsd: item.price_usd,
    })

    const resolved = resolvePairedEvaluation({
      status: checkRes?.status || (item.batchStatus === 'error' ? 'erro' : null),
      catalogPriceUsd: item.price_usd,
      catalogPriceRebate: item.price_usa_rebate,
      catalogDateRebate: item.date_rebate,
      rebateRule: rebateRule || null,
      priceBh: checkRes?.price_bh ?? null,
      priceFull: rebateInfo.rebatePriceFull,
      priceWithRebate: rebateInfo.rebatePriceWithDiscount,
      isBhRebateActive: rebateInfo.isBhRebateActive,
      defaultMessage: checkRes?.message || item.errorMessage,
    })

    return {
      effectiveStatus: resolved.effectiveStatus,
      effectiveMessage: resolved.effectiveMessage,
      rebateInfo,
      pairedEval: resolved.pairedEval,
    }
  },

  /**
   * Estima o consumo de créditos Firecrawl da lista de produtos selecionados
   * Custos reais pós-otimização:
   * - Raspagem direta (com link validado): 1 crédito (scrape comum markdown/html)
   * - Busca + raspagem direta (sem link): 2 créditos de busca + 1 crédito de scrape do 1º candidato = 3 créditos
   *   (se o 1º não confirmar, testa até 3 candidatos, +1 a +2 créditos; fallback JSON extremo = 5 créditos)
   * Mantém métricas detalhadas com link e sem link.
   */
  estimateFirecrawlCredits(items: Array<{ website_url?: string | null }>): {
    totalCredits: number
    withLinkCount: number
    withoutLinkCount: number
    creditsDirectScrape: number
    creditsSearchFlow: number
  } {
    let withLinkCount = 0
    let withoutLinkCount = 0

    for (const item of items) {
      if (item.website_url && item.website_url.trim().startsWith('http')) {
        withLinkCount++
      } else {
        withoutLinkCount++
      }
    }

    // Com link: 1 crédito (scrape comum)
    // Sem link: 2 créditos (busca) + 1 crédito (scrape do primeiro candidato) = 3 créditos no caso ideal de 1º acerto
    const creditsDirectScrape = withLinkCount * 1
    const creditsSearchFlow = withoutLinkCount * 3
    const totalCredits = creditsDirectScrape + creditsSearchFlow

    return {
      totalCredits,
      withLinkCount,
      withoutLinkCount,
      creditsDirectScrape,
      creditsSearchFlow,
    }
  },

  /**
   * Confirmação manual de revisão em lote: atualiza SOMENTE last_reviewed_at = agora
   * (conforme regra vinculante de auditoria de datas, NUNCA alterando updated_at)
   */
  async confirmBatchReview(productIds: string[]): Promise<string> {
    if (!productIds || productIds.length === 0) {
      throw new Error('Nenhum produto selecionado para confirmação de revisão.')
    }

    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('products')
      .update({ last_reviewed_at: nowIso } as any)
      .in('id', productIds)

    if (error) {
      throw new Error(`Falha ao confirmar revisão em lote: ${error.message}`)
    }

    return nowIso
  },

  /**
   * Confirmação manual de revisão individual: atualiza SOMENTE last_reviewed_at = agora
   */
  async confirmSingleReview(productId: string): Promise<string> {
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('products')
      .update({ last_reviewed_at: nowIso } as any)
      .eq('id', productId)

    if (error) {
      throw new Error(`Falha ao confirmar revisão: ${error.message}`)
    }

    return nowIso
  },

  /**
   * Confirma descontinuação em lote para múltiplos produtos:
   * Grava is_discontinued = true, updated_at = last_reviewed_at = agora (mesmo valor)
   * para todos os IDs informados. NUNCA altera price_usd.
   */
  async confirmBatchDiscontinued(productIds: string[]): Promise<string> {
    if (!productIds || productIds.length === 0) {
      throw new Error('Nenhum produto selecionado para confirmação de descontinuação.')
    }

    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('products')
      .update({
        is_discontinued: true,
        updated_at: nowIso,
        last_reviewed_at: nowIso,
      } as any)
      .in('id', productIds)

    if (error) {
      throw new Error(`Falha ao confirmar descontinuação em lote: ${error.message}`)
    }

    return nowIso
  },

  /**
   * Reativa produtos em lote que estavam descontinuados:
   * Grava is_discontinued = false, updated_at = last_reviewed_at = agora (mesmo valor)
   * para todos os IDs informados. NUNCA altera price_usd.
   */
  async reactivateBatchProducts(productIds: string[]): Promise<string> {
    if (!productIds || productIds.length === 0) {
      throw new Error('Nenhum produto selecionado para reativação.')
    }

    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('products')
      .update({
        is_discontinued: false,
        updated_at: nowIso,
        last_reviewed_at: nowIso,
      } as any)
      .in('id', productIds)

    if (error) {
      throw new Error(`Falha ao reativar produtos em lote: ${error.message}`)
    }

    return nowIso
  },

  /**
   * Constrói e filtra os produtos do catálogo para a tabela de atualização B&H
   */
  async fetchProductsForBatch(limit = 1500): Promise<ProductBatchItem[]> {
    const { data, error } = await supabase
      .from('products')
      .select(
        'id, name, sku, category, price_usd, price_cost, price_usa_rebate, price_cost_rebate, date_rebate, website_url, is_discontinued, updated_at, last_reviewed_at, manufacturer:manufacturers(id, name)',
      )
      .order('updated_at', { ascending: true }) // Mais desatualizados primeiro como padrão do banco
      .limit(limit)

    if (error) {
      throw new Error(error.message || 'Erro ao carregar lista de produtos.')
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      sku: row.sku || null,
      category: row.category || null,
      price_usd: row.price_usd != null ? Number(row.price_usd) : null,
      price_cost: row.price_cost != null ? Number(row.price_cost) : null,
      price_usa_rebate: row.price_usa_rebate != null ? Number(row.price_usa_rebate) : null,
      price_cost_rebate: row.price_cost_rebate != null ? Number(row.price_cost_rebate) : null,
      date_rebate: row.date_rebate || null,
      website_url: row.website_url || null,
      is_discontinued: Boolean(row.is_discontinued),
      updated_at: row.updated_at || '',
      last_reviewed_at: row.last_reviewed_at || '',
      manufacturer: row.manufacturer
        ? {
            id: row.manufacturer.id,
            name: row.manufacturer.name,
          }
        : null,
      batchStatus: 'idle',
      checkResult: null,
      errorMessage: null,
      manualUrlDraft: row.website_url || '',
    }))
  },

  /**
   * Processa uma única unidade no contexto do lote via edge function
   */
  async processSingleItem(productId: string): Promise<PriceCheckResult> {
    return await priceCheckService.checkBhPrice(productId, 'batch')
  },

  /**
   * Analisa e valida uma URL manual da B&H para qualquer produto (sem link ou com link duvidoso),
   * checando MFR # contra SKU e obtendo dados completos de preço e rebate.
   */
  async analyzeManualUrl(productId: string, manualUrl: string): Promise<PriceCheckResult> {
    return await priceCheckService.checkBhPrice(productId, 'manual', manualUrl)
  },

  /**
   * Calcula as estatísticas acumuladas dos itens processados, aplicando pareamento
   * de regras de rebate ativas quando o mapa de regras for fornecido.
   */
  calculateStats(
    items: ProductBatchItem[],
    activeRebatesMap?: Record<string, ExistingRebateRule>,
  ): BatchProcessingStats {
    let okCount = 0
    let divergenceCount = 0
    let urlDiscoveredCount = 0
    let doubtfulLinkCount = 0
    let discontinuedCount = 0
    let errorCount = 0
    let rebateDetectedCount = 0
    let processedCount = 0

    for (const item of items) {
      if (item.batchStatus === 'done' || item.batchStatus === 'error') {
        processedCount++
      }

      if (item.checkResult) {
        const res = item.checkResult
        // Regra ativa vem primariamente dos campos nativos do item, com fallback para o mapa se fornecido
        const rule = activeRebatesMap ? activeRebatesMap[item.id] : null
        const evaluated = this.resolveItemPairedEvaluation(item, rule)
        const effectiveStatus = evaluated.effectiveStatus || res.status

        if (effectiveStatus === 'ok') okCount++
        if (effectiveStatus === 'divergente') divergenceCount++
        if (effectiveStatus === 'descontinuado') discontinuedCount++
        if (effectiveStatus === 'sem_url_confirmada') doubtfulLinkCount++
        if (effectiveStatus === 'erro') errorCount++

        if (res.url_discovered) urlDiscoveredCount++
        if (evaluated.rebateInfo.isBhRebateActive) rebateDetectedCount++
      } else if (item.batchStatus === 'error') {
        errorCount++
      }
    }

    return {
      totalSelected: items.length,
      processedCount,
      okCount,
      divergenceCount,
      urlDiscoveredCount,
      doubtfulLinkCount,
      discontinuedCount,
      errorCount,
      rebateDetectedCount,
    }
  },

  /**
   * Mapeia status operacional amigável e cor de badge
   */
  getStatusLabel(
    status?: PriceCheckStatus | null,
    batchStatus?: string,
  ): {
    label: string
    variant: 'default' | 'outline' | 'secondary' | 'destructive'
    className: string
  } {
    if (batchStatus === 'processing') {
      return {
        label: 'Verificando...',
        variant: 'outline',
        className: 'border-blue-500/40 bg-blue-500/10 text-blue-400 animate-pulse',
      }
    }

    switch (status) {
      case 'ok':
        return {
          label: 'Preço OK',
          variant: 'outline',
          className: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
        }
      case 'divergente':
        return {
          label: 'Divergente',
          variant: 'outline',
          className: 'border-amber-500/30 bg-amber-500/15 text-amber-400',
        }
      case 'descontinuado':
        return {
          label: 'Descontinuado',
          variant: 'destructive',
          className: 'border-red-500/30 bg-red-500/15 text-red-400',
        }
      case 'sem_url_confirmada':
        return {
          label: 'Link Duvidoso / Ausente',
          variant: 'outline',
          className: 'border-yellow-500/30 bg-yellow-500/15 text-yellow-400',
        }
      case 'erro':
        return {
          label: 'Falha / Erro',
          variant: 'destructive',
          className: 'border-rose-500/30 bg-rose-500/15 text-rose-400',
        }
      default:
        return {
          label: 'Pendente',
          variant: 'outline',
          className: 'border-border/50 text-muted-foreground',
        }
    }
  },

  /**
   * -------------------------------------------------------------------------
   * PERSISTÊNCIA DE JOBS EM BANCO (bh_batch_jobs)
   * Checkpoints a cada item processado, permitindo retomar de onde parou
   * mesmo recarregando ou trocando de navegador.
   * -------------------------------------------------------------------------
   */

  /**
   * Busca o job mais recente ativo ou pausado (não completado/cancelado)
   */
  async getActiveBatchJob(): Promise<BhBatchJobRecord | null> {
    try {
      const { data, error } = await supabase
        .from('bh_batch_jobs' as any)
        .select('*')
        .in('status', ['in_progress', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        // Se a tabela ainda não foi criada no banco remoto, degrada suavemente sem quebrar
        console.warn('bhBatchUpdateService.getActiveBatchJob:', error.message)
        return null
      }

      return data as unknown as BhBatchJobRecord | null
    } catch (err: any) {
      console.warn('bhBatchUpdateService.getActiveBatchJob unexpected error:', err?.message)
      return null
    }
  },

  /**
   * Cria um novo registro de batch job no banco
   */
  async createBatchJob(params: {
    productIds: string[]
    batchSize?: number
    cooldownSeconds?: number
  }): Promise<BhBatchJobRecord | null> {
    try {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id || null

      const initialStats: BatchProcessingStats = {
        totalSelected: params.productIds.length,
        processedCount: 0,
        okCount: 0,
        divergenceCount: 0,
        urlDiscoveredCount: 0,
        doubtfulLinkCount: 0,
        discontinuedCount: 0,
        errorCount: 0,
        rebateDetectedCount: 0,
      }

      const payload = {
        user_id: userId,
        status: 'in_progress',
        total_items: params.productIds.length,
        processed_items: 0,
        current_product_id: null,
        product_ids: params.productIds,
        processed_ids: [],
        stats: initialStats,
        results: {},
        metadata: {
          batchSize: params.batchSize || 10,
          cooldownSeconds: params.cooldownSeconds || 60,
          started_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('bh_batch_jobs' as any)
        .insert(payload)
        .select('*')
        .single()

      if (error) {
        console.warn('bhBatchUpdateService.createBatchJob:', error.message)
        return null
      }

      return data as unknown as BhBatchJobRecord
    } catch (err: any) {
      console.warn('bhBatchUpdateService.createBatchJob unexpected error:', err?.message)
      return null
    }
  },

  /**
   * Registra checkpoint no banco a cada item concluído (ou com erro), atualizando
   * processed_items, processed_ids, stats e results.
   */
  async recordItemCheckpoint(params: {
    jobId: string
    productId: string
    batchStatus: 'done' | 'error'
    checkResult?: PriceCheckResult | null
    errorMessage?: string | null
    websiteUrl?: string | null
    priceUsd?: number | null
    currentStats: BatchProcessingStats
    existingResults: Record<string, any>
    isLastItem?: boolean
  }): Promise<void> {
    try {
      const now = new Date().toISOString()
      const updatedResults = {
        ...params.existingResults,
        [params.productId]: {
          checkResult: params.checkResult || null,
          batchStatus: params.batchStatus,
          errorMessage: params.errorMessage || null,
          website_url: params.websiteUrl || null,
          price_usd: params.priceUsd ?? null,
        },
      }

      const processedIds = Object.keys(updatedResults)
      const isComplete =
        params.isLastItem || processedIds.length >= params.currentStats.totalSelected

      const updatePayload: Record<string, any> = {
        processed_items: processedIds.length,
        current_product_id: params.productId,
        processed_ids: processedIds,
        stats: params.currentStats,
        results: updatedResults,
        updated_at: now,
      }

      if (isComplete) {
        updatePayload.status = 'completed'
        updatePayload.completed_at = now
      }

      const { error } = await supabase
        .from('bh_batch_jobs' as any)
        .update(updatePayload)
        .eq('id', params.jobId)

      if (error) {
        console.warn('bhBatchUpdateService.recordItemCheckpoint:', error.message)
      }
    } catch (err: any) {
      console.warn('bhBatchUpdateService.recordItemCheckpoint unexpected error:', err?.message)
    }
  },

  /**
   * Atualiza o status do lote (ex: 'paused', 'completed', 'cancelled')
   */
  async updateJobStatus(
    jobId: string,
    status: 'in_progress' | 'paused' | 'completed' | 'cancelled' | 'error',
  ): Promise<void> {
    try {
      const updatePayload: Record<string, any> = {
        status,
        updated_at: new Date().toISOString(),
      }
      if (status === 'completed') {
        updatePayload.completed_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('bh_batch_jobs' as any)
        .update(updatePayload)
        .eq('id', jobId)

      if (error) {
        console.warn('bhBatchUpdateService.updateJobStatus:', error.message)
      }
    } catch (err: any) {
      console.warn('bhBatchUpdateService.updateJobStatus unexpected error:', err?.message)
    }
  },
}
