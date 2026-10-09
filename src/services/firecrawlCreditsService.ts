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

export interface FirecrawlCreditsErrorDetails {
  message: string
  isNotDeployed?: boolean
  isUnauthorized?: boolean
}

export const firecrawlCreditsService = {
  /**
   * Consulta o saldo e consumo de créditos da API Firecrawl
   * via edge function firecrawl-credits protegida por sessão admin
   */
  async getCredits(): Promise<FirecrawlCreditsData> {
    let result: { data: FirecrawlCreditsResponse | null; error: any }

    try {
      result = await supabase.functions.invoke<FirecrawlCreditsResponse>('firecrawl-credits', {
        method: 'GET',
      })
    } catch (networkErr: unknown) {
      const netMsg = (networkErr as Error)?.message || ''
      if (
        netMsg.includes('Failed to fetch') ||
        netMsg.includes('NetworkError') ||
        netMsg.includes('Load failed')
      ) {
        throw new Error(
          'Função edge firecrawl-credits indisponível ou não publicada no projeto Supabase. Verifique se a função foi deployada.',
        )
      }
      throw new Error(netMsg || 'Falha de conexão ao consultar créditos do Firecrawl.')
    }

    const { data, error } = result

    if (error) {
      // Supabase FunctionsHttpError / FunctionsRelayError / FunctionsFetchError
      const serverJsonError = (error as any)?.context?.json?.error
      const errorMsg = (error as any)?.message || ''
      const status = (error as any)?.context?.status || (error as any)?.status

      // Quando a edge function não está deployada no Supabase (404 / NOT_FOUND)
      // ou falha no relay da plataforma Supabase
      if (
        status === 404 ||
        errorMsg.includes('404') ||
        errorMsg.includes('NOT_FOUND') ||
        errorMsg.includes('Failed to send a request') ||
        errorMsg.includes('Failed to fetch') ||
        errorMsg.includes('FunctionsFetchError')
      ) {
        throw new Error(
          'A edge function firecrawl-credits ainda não está publicada neste projeto Supabase. É necessário realizar o deploy da função no painel do Supabase.',
        )
      }

      if (serverJsonError) {
        throw new Error(serverJsonError)
      }

      if (status === 401 || status === 403) {
        throw new Error(
          'Acesso não autorizado. Apenas administradores podem consultar créditos Firecrawl.',
        )
      }

      throw new Error(errorMsg || 'Não foi possível obter os créditos do Firecrawl.')
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
