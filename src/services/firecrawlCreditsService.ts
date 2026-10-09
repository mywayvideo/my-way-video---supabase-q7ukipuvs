import { supabase } from '@/lib/supabase/client'

export interface FirecrawlCreditsData {
  remainingCredits: number
  planCredits: number
  usedCredits: number
  percentUsed: number
  percentRemaining: number
  billingPeriodStart: string | null
  billingPeriodEnd: string | null
  fetchedAt: string
}

export interface FirecrawlCreditsResponse {
  success: boolean
  data?: FirecrawlCreditsData
  error?: string
}

export const firecrawlCreditsService = {
  /**
   * Consulta o saldo e consumo de créditos da API Firecrawl
   * via edge function firecrawl-credits protegida por sessão admin
   */
  async getCredits(): Promise<FirecrawlCreditsData> {
    const { data, error } = await supabase.functions.invoke<FirecrawlCreditsResponse>(
      'firecrawl-credits',
      {
        method: 'GET',
      },
    )

    if (error) {
      // Quando a edge function devolve erro HTTP (401, 403, 500, etc.), o Supabase SDK
      // encapsula no error. Se a function retornou JSON com `error`, tentamos extrair.
      const errorMsg =
        (error as any)?.context?.json?.error ||
        (error as any)?.message ||
        'Não foi possível obter os créditos do Firecrawl.'
      throw new Error(errorMsg)
    }

    if (!data) {
      throw new Error('Resposta vazia da função de créditos.')
    }

    if (data.error) {
      throw new Error(data.error)
    }

    if (!data.success || !data.data) {
      throw new Error('Não foi possível identificar o saldo de créditos do Firecrawl.')
    }

    return data.data
  },
}
