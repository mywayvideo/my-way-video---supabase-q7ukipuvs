import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

interface EnrichmentResult {
  enrichedData: any | null
  isLoading: boolean
  error: string | null
  confidenceLevel: string | null
  aiModelUsed: string | null
}

export function useProductEnrichment(
  productId: string | undefined,
  productName: string | undefined,
  productDescription: string | undefined,
): EnrichmentResult {
  const [enrichedData, setEnrichedData] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [confidenceLevel, setConfidenceLevel] = useState<string | null>(null)
  const [aiModelUsed, setAiModelUsed] = useState<string | null>(null)

  useEffect(() => {
    // Only run if all required data is available
    if (!productId || !productName || !productDescription) {
      return
    }

    let isMounted = true
    const abortController = new AbortController()

    const enrichProduct = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Implement 15-second timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            abortController.abort()
            reject(new Error('Timeout ao enriquecer dados.'))
          }, 15000)
        })

        // Call Supabase Edge Function
        const fetchPromise = supabase.functions.invoke('enrich-product-specs', {
          body: {
            product_id: productId,
            product_name: productName,
            product_description: productDescription,
          },
          // @ts-expect-error - pass signal down to underlying fetch
          signal: abortController.signal,
        })

        const response = (await Promise.race([fetchPromise, timeoutPromise])) as any

        if (!isMounted) return

        if (response.error) {
          setError(response.error.message || 'Erro ao enriquecer dados.')
        } else if (response.data?.error) {
          setError(response.data.error)
        } else if (response.data?.data) {
          setEnrichedData(response.data.data.enriched_data)
          setConfidenceLevel(response.data.data.confidence_level)
          setAiModelUsed(response.data.data.ai_model_used)
        }
      } catch (err: any) {
        if (!isMounted) return

        // Handle abort/timeout errors specifically
        if (err.name === 'AbortError' || err.message === 'Timeout ao enriquecer dados.') {
          setError('Timeout ao enriquecer dados.')
        } else {
          setError(err.message || 'Erro ao processar solicitacao.')
        }

        // Log silently as requested
        console.error('[useProductEnrichment] Error:', err)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    enrichProduct()

    // Cleanup: abort any pending requests on unmount
    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [productId, productName, productDescription])

  return { enrichedData, isLoading, error, confidenceLevel, aiModelUsed }
}
