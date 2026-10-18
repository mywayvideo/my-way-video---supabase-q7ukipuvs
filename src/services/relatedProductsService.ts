import { supabase } from '@/lib/supabase/client'

// In-memory debounce cache para evitar chamadas repetidas (<10 min por produto)
const recentTriggers = new Map<string, number>()
const TEN_MINUTES_MS = 10 * 60 * 1000

export interface RelatedGenerationResult {
  success: boolean
  productId?: string
  ai_related_ids?: string[]
  ai_related_meta?: Record<
    string,
    { confidence: 'alta' | 'media' | 'baixa'; reason: string; rule_id?: string | null }
  >
  skipped?: boolean
  error?: string
}

export const relatedProductsService = {
  /**
   * Dispara a Edge Function generate-related-products em segundo plano (fire-and-forget).
   * Não bloqueia a resposta da UI e ignora chamadas recentes (<10 min) a menos que force=true.
   */
  triggerBackgroundGeneration(productId: string, options?: { force?: boolean }): void {
    if (!productId) return

    const now = Date.now()
    const lastRun = recentTriggers.get(productId)

    if (!options?.force && lastRun && now - lastRun < TEN_MINUTES_MS) {
      console.log(
        `[RelatedProducts] Disparo ignorado para ${productId}: executado há menos de 10 min.`,
      )
      return
    }

    recentTriggers.set(productId, now)

    // Fire-and-forget: chamada assíncrona desacoplada
    setTimeout(async () => {
      try {
        console.log(`[RelatedProducts] Disparando pipeline para produto ${productId}...`)
        const { data, error } = await supabase.functions.invoke('generate-related-products', {
          body: { productId, force: options?.force || false },
        })

        if (error) {
          console.warn(`[RelatedProducts] Erro na geração para ${productId}:`, error.message)
        } else {
          console.log(
            `[RelatedProducts] Sucesso para ${productId}:`,
            data?.ai_related_ids?.length || 0,
            'itens sugeridos.',
          )
        }
      } catch (err: any) {
        console.warn(`[RelatedProducts] Falha de rede/execução para ${productId}:`, err.message)
      }
    }, 100)
  },

  /**
   * Executa diretamente com await (útil no importador CSV ou em filas de revisão quando se precisa do retorno).
   */
  async generateForProduct(
    productId: string,
    options?: { force?: boolean },
  ): Promise<RelatedGenerationResult> {
    if (!productId) return { success: false, error: 'productId ausente' }

    const now = Date.now()
    const lastRun = recentTriggers.get(productId)
    if (!options?.force && lastRun && now - lastRun < TEN_MINUTES_MS) {
      return { success: true, skipped: true, productId }
    }

    recentTriggers.set(productId, now)

    try {
      const { data, error } = await supabase.functions.invoke('generate-related-products', {
        body: { productId, force: options?.force || false },
      })

      if (error) {
        return { success: false, productId, error: error.message }
      }

      return {
        success: true,
        productId,
        ai_related_ids: data?.ai_related_ids || [],
        ai_related_meta: data?.ai_related_meta || {},
      }
    } catch (err: any) {
      return { success: false, productId, error: err.message }
    }
  },
}
