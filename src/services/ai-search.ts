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
        error: new Error(`Erro na busca: ${response.statusText} - ${errText}`),
      }
    }

    const data = await response.json()
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err }
  }
}
