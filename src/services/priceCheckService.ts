import { supabase } from '@/lib/supabase/client'

export type PriceCheckStatus = 'ok' | 'divergente' | 'descontinuado' | 'sem_url_confirmada' | 'erro'

export interface PriceCheckResult {
  status: PriceCheckStatus
  price_usd_cadastrado?: number | null
  price_bh?: number | null
  diff_usd?: number | null
  diff_pct?: number | null
  is_discontinued?: boolean
  url_used?: string | null
  url_discovered?: boolean
  message?: string
  checked_at?: string
  error?: string
  rebate_active?: boolean
  price_full?: number | null
  price_with_rebate?: number | null
  rebate_savings?: number | null
  rebate_end_date?: string | null
}

export interface PriceCheckRecord {
  id: string
  product_id: string
  checked_at: string
  price_db: number | null
  price_bh: number | null
  diff_usd: number | null
  diff_pct: number | null
  status: PriceCheckStatus
  source: 'manual' | 'batch'
  url_used: string | null
  url_discovered: boolean
  message: string | null
  raw?: any
}

export const priceCheckService = {
  /**
   * Dispara a verificação unitária em tempo real na B&H via edge function check-price-bhphoto
   */
  async checkBhPrice(
    productId: string,
    source: 'manual' | 'batch' = 'manual',
  ): Promise<PriceCheckResult> {
    const { data, error } = await supabase.functions.invoke('check-price-bhphoto', {
      body: {
        product_id: productId,
        source,
      },
    })

    if (error) {
      throw new Error(error.message || 'Falha ao conectar com o serviço de verificação da B&H.')
    }

    if (!data) {
      throw new Error('Nenhuma resposta retornada pelo serviço de verificação.')
    }

    return {
      status: data.status || (data.error ? 'erro' : 'ok'),
      price_usd_cadastrado: data.price_usd_cadastrado,
      price_bh: data.price_bh,
      diff_usd: data.diff_usd,
      diff_pct: data.diff_pct,
      is_discontinued: data.is_discontinued,
      url_used: data.url_used,
      url_discovered: data.url_discovered,
      message: data.message || data.error,
      checked_at: new Date().toISOString(),
      error: data.error,
      rebate_active: Boolean(data.rebate_active),
      price_full: data.price_full ?? null,
      price_with_rebate: data.price_with_rebate ?? null,
      rebate_savings: data.rebate_savings ?? null,
      rebate_end_date: data.rebate_end_date ?? null,
    }
  },

  /**
   * Busca a última verificação registrada para o produto
   */
  async getLatestCheck(productId: string): Promise<PriceCheckRecord | null> {
    const { data, error } = await supabase
      .from('price_checks' as any)
      .select('*')
      .eq('product_id', productId)
      .order('checked_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn('Erro ao buscar última verificação de preço:', error)
      return null
    }

    return (data as unknown as PriceCheckRecord) || null
  },

  /**
   * Aplica o preço B&H ao produto:
   * Atualiza price_usd no cadastro de produtos.
   * O banco de dados recalcula automaticamente price_brl via trigger trg_calculate_product_price_brl.
   */
  async applyBhPrice(productId: string, newPriceUsd: number): Promise<void> {
    if (!newPriceUsd || newPriceUsd <= 0) {
      throw new Error('Preço B&H inválido para aplicação.')
    }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('products')
      .update({
        price_usd: newPriceUsd,
        updated_at: now,
        last_reviewed_at: now,
      } as any)
      .eq('id', productId)

    if (error) {
      throw new Error(error.message || 'Erro ao atualizar o preço do produto.')
    }
  },

  /**
   * Salva uma URL manual da B&H em products.website_url
   * Atualiza updated_at e last_reviewed_at de acordo com as regras de auditoria
   */
  async updateWebsiteUrl(productId: string, websiteUrl: string): Promise<void> {
    const cleanUrl = websiteUrl.trim()
    if (!cleanUrl || !cleanUrl.startsWith('http')) {
      throw new Error('URL da B&H inválida. Deve começar com http:// ou https://')
    }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('products')
      .update({
        website_url: cleanUrl,
        updated_at: now,
        last_reviewed_at: now,
      } as any)
      .eq('id', productId)

    if (error) {
      throw new Error(error.message || 'Erro ao atualizar a URL do produto.')
    }
  },
}
