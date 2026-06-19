import { supabase } from '@/lib/supabase/client'

export interface AISearchResponse {
  success: boolean
  response: string
  data?: {
    stock: any[]
    pc: any[]
    psc: any[]
    mi: any[]
  }
  error?: string
}

export const performAISearch = async (query: string): Promise<AISearchResponse> => {
  const { data, error } = await supabase.rpc('execute_ai_search_v3', {
    search_term: query,
  })

  if (error) {
    throw error
  }

  return {
    success: true,
    response: 'Busca processada com sucesso',
    data: data as any,
  }
}
