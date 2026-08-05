import { safeJsonResponse, SafeFetchError } from '@/lib/safe-fetch'

export interface AISearchResponse {
  success: boolean
  response: string
  data?: any
  error?: string
}

export const performAISearch = async (query: string): Promise<{ data: any; error: any }> => {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-search`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return {
        data: null,
        error: new Error(
          errText.trim().startsWith('<')
            ? 'O serviço de busca está temporariamente indisponível. Tente novamente em instantes.'
            : `Erro na busca: ${response.statusText} - ${errText.slice(0, 200)}`,
        ),
      }
    }

    const data = await safeJsonResponse(response)
    return { data, error: null }
  } catch (err: any) {
    if (err instanceof SafeFetchError) {
      return { data: null, error: new Error(err.message) }
    }
    return { data: null, error: err }
  }
}
