import { PriceCheckResult, PriceCheckStatus, priceCheckService } from './priceCheckService'
import { supabase } from '@/lib/supabase/client'

export interface ProductBatchItem {
  id: string
  name: string
  sku: string | null
  price_usd: number | null
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

export const bhBatchUpdateService = {
  /**
   * Estima o consumo de créditos Firecrawl da lista de produtos selecionados
   * Regra de bolso: 1 crédito se tiver link direto (raspagem), 2 créditos se não tiver link (busca + raspagem)
   */
  estimateFirecrawlCredits(items: Array<{ website_url?: string | null }>): {
    totalCredits: number
    withLinkCount: number
    withoutLinkCount: number
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

    const totalCredits = withLinkCount * 1 + withoutLinkCount * 2
    return {
      totalCredits,
      withLinkCount,
      withoutLinkCount,
    }
  },

  /**
   * Constrói e filtra os produtos do catálogo para a tabela de atualização B&H
   */
  async fetchProductsForBatch(limit = 1500): Promise<ProductBatchItem[]> {
    const { data, error } = await supabase
      .from('products')
      .select(
        'id, name, sku, price_usd, website_url, is_discontinued, updated_at, last_reviewed_at, manufacturer:manufacturers(id, name)',
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
      price_usd: row.price_usd != null ? Number(row.price_usd) : null,
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
   * Calcula as estatísticas acumuladas dos itens processados
   */
  calculateStats(items: ProductBatchItem[]): BatchProcessingStats {
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
        if (res.status === 'ok') okCount++
        if (res.status === 'divergente') divergenceCount++
        if (res.status === 'descontinuado') discontinuedCount++
        if (res.status === 'sem_url_confirmada') doubtfulLinkCount++
        if (res.status === 'erro') errorCount++

        if (res.url_discovered) urlDiscoveredCount++
        if (res.rebate_active) rebateDetectedCount++
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
}
