import { useState, useRef, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'

export interface AIResult {
  message?: string
  content?: string
  confidence_level?: 'high' | 'medium' | 'low'
  referenced_internal_products?: any[]
  should_show_whatsapp_button?: boolean
  whatsapp_reason?: string
  is_intermediate?: boolean
  products?: any[]
}

const fetchProductDetails = async (ids: string[]): Promise<any[]> => {
  if (!ids || ids.length === 0) return []
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*, manufacturer:manufacturers(*)')
      .in('id', ids)
    if (error) throw error
    return data || []
  } catch {
    return []
  }
}

export function useAiSearch() {
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<AIResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sessionIdRef = useRef<string>(
    (() => {
      let id = sessionStorage.getItem('mw_ai_session_id')
      if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()
        sessionStorage.setItem('mw_ai_session_id', id)
      }
      return id
    })(),
  )
  const { toast } = useToast()

  const search = useCallback(
    async (query: string, currentProductId?: string) => {
      if (!query.trim()) return

      setIsLoading(true)
      setError(null)
      setResults(null)

      try {
        const functionName = 'ai-search'
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            query,
            currentProductId,
            session_id: sessionIdRef.current,
          }),
        })

        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`Erro na busca: ${response.statusText} - ${errText}`)
        }

        const data = await response.json()

        const rawRefs = Array.isArray(data.referenced_internal_products)
          ? data.referenced_internal_products
          : []
        const refIds = rawRefs
          .map((item: any) => (typeof item === 'object' && item !== null ? item.id : item))
          .filter(Boolean)

        let enrichedProducts = data.products || []
        if (enrichedProducts.length === 0 && refIds.length > 0) {
          enrichedProducts = await fetchProductDetails(refIds)
        }

        // Ensure manufacturer mapping matches what frontend expects
        enrichedProducts = enrichedProducts.map((p: any) => ({
          ...p,
          image_url: p.image_url || p.imageUrl,
          manufacturer:
            p.manufacturer?.name ||
            p.manufacturers?.name ||
            (typeof p.manufacturer === 'object' && p.manufacturer !== null
              ? p.manufacturer.name
              : p.manufacturer),
        }))

        setResults({
          ...data,
          referenced_internal_products: enrichedProducts.length > 0 ? enrichedProducts : refIds,
          products: enrichedProducts,
        })
      } catch (err: any) {
        console.error('AI Search Error:', err)
        setError(err.message || 'Ocorreu um erro ao processar sua busca.')
        toast({
          title: 'Erro na busca',
          description: 'Não foi possível completar a análise. Tente novamente.',
          variant: 'destructive',
        })
        setResults(null)
      } finally {
        setIsLoading(false)
      }
    },
    [toast],
  )

  const clearResults = useCallback(() => {
    setResults(null)
    setError(null)
  }, [])

  return {
    search,
    isLoading,
    results,
    error,
    clearResults,
  }
}
