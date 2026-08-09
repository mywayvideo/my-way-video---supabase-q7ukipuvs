import { useState, useRef, useCallback, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { safeJsonResponse, SafeFetchError } from '@/lib/safe-fetch'

const AI_SEARCH_TIMEOUT_MS = 60000
const AI_SEARCH_TIMEOUT_MESSAGE = 'A resposta demorou demais, tente reformular sua busca'

export interface AIResult {
  message?: string
  content?: string
  confidence_level?: 'high' | 'medium' | 'low'
  referenced_internal_products?: any[]
  should_show_whatsapp_button?: boolean
  whatsapp_reason?: string
  is_intermediate?: boolean
  products?: any[]
  ai_referenced_count?: number
  ai_referenced_products?: string[]
  full_search_results?: any[]
}

const STOP_WORDS = new Set([
  'camera',
  'cinema',
  'body',
  'lens',
  'lenses',
  'sony',
  'canon',
  'nikon',
  'panasonic',
  'blackmagic',
  'fuji',
  'fujifilm',
  'lumix',
  'alpha',
  'mirrorless',
  'dslr',
  'full',
  'frame',
  'pro',
  'professional',
  'kit',
  'set',
  'series',
  'model',
  'modelo',
  'produto',
  'product',
  'the',
  'and',
  'for',
  'with',
  'video',
  'audio',
  'light',
  'lighting',
  'tripod',
  'microphone',
  'mic',
  'drone',
  'gimbal',
  'monitor',
  'recorder',
  'cable',
  'cabo',
])

const BRAND_KEYWORDS = new Set([
  'sony',
  'canon',
  'nikon',
  'panasonic',
  'blackmagic',
  'fuji',
  'fujifilm',
  'lumix',
  'alpha',
  'sigma',
  'tamron',
  'zeiss',
  'godox',
  'dji',
  'sennheiser',
  'rode',
  'shure',
  'atomos',
  'aputure',
  'red',
  'kowa',
  'samyang',
  'fujinon',
  'cabrio',
  'venice',
  'ursa',
])

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSignificantWords(text: string): string[] {
  const normalized = normalizeText(text)
  const words = normalized.split(' ').filter(Boolean)
  return words.filter((w) => (w.length > 2 || /\d/.test(w)) && !STOP_WORDS.has(w))
}

function hasBrandKeyword(text: string): boolean {
  const normalized = normalizeText(text)
  const words = normalized.split(' ').filter(Boolean)
  return words.some((w) => BRAND_KEYWORDS.has(w))
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
  const abortControllerRef = useRef<AbortController | null>(null)
  const recentProductIdsRef = useRef<string[]>([])
  const productReferenceRef = useRef<string>('')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const search = useCallback(
    async (query: string, currentProductId?: string) => {
      if (!query.trim()) return

      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      const timeoutId = setTimeout(() => {
        controller.abort()
      }, AI_SEARCH_TIMEOUT_MS)
      timeoutRef.current = timeoutId

      setIsLoading(true)
      setError(null)
      setResults(null)

      try {
        let finalQuery = query

        if (!currentProductId) {
          const reference = productReferenceRef.current

          if (!reference) {
            productReferenceRef.current = query
          } else {
            const normalizedQuery = normalizeText(query)
            const significantWords = getSignificantWords(reference)
            const hasSignificantWord =
              significantWords.length > 0 &&
              significantWords.some((word) => normalizedQuery.includes(word))

            if (hasSignificantWord) {
              // Same product context — no injection, no update
            } else if (hasBrandKeyword(query)) {
              // New product search — no injection, update reference
              productReferenceRef.current = query
            } else {
              // Continuation — inject stored reference
              finalQuery = `${query} (considerando: ${reference})`
            }
          }
        }

        const functionName = 'ai-search'
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            query: finalQuery,
            currentProductId,
            session_id: sessionIdRef.current,
            ...(currentProductId ? {} : { recentProductIds: recentProductIdsRef.current }),
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const errText = await response.text()
          throw new Error(
            errText.trim().startsWith('<')
              ? 'O serviço de IA está temporariamente indisponível. Tente novamente em instantes.'
              : `Erro na busca: ${response.statusText} - ${errText.slice(0, 200)}`,
          )
        }

        const data = await safeJsonResponse(response)

        let contentStr = data.content
        if (typeof contentStr === 'object' && contentStr !== null) {
          contentStr = contentStr.content || contentStr.message || JSON.stringify(contentStr)
        } else if (typeof contentStr === 'string') {
          const trimmed = contentStr.trim()
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              const parsed = JSON.parse(trimmed)
              if (typeof parsed.content === 'string') contentStr = parsed.content
              else if (typeof parsed.message === 'string') contentStr = parsed.message
            } catch {
              /* intentionally ignored */
            }
          }
        }

        contentStr = typeof contentStr === 'string' ? contentStr.replace(/\\n/g, '\n') : contentStr

        const rawRefs = Array.isArray(data.referenced_internal_products)
          ? data.referenced_internal_products
          : []
        const refIds = rawRefs
          .map((item: any) => (typeof item === 'object' && item !== null ? item.id : item))
          .filter(Boolean)

        const aiRefIds = Array.isArray(data.ai_referenced_products)
          ? data.ai_referenced_products.filter((id: any) => typeof id === 'string')
          : []
        if (aiRefIds.length > 0) {
          recentProductIdsRef.current = aiRefIds.slice(0, 5)
        }

        const fullSearchIds = Array.isArray(data.full_search_results)
          ? data.full_search_results.map((p: any) => p?.id).filter(Boolean)
          : []

        const allIds = Array.from(new Set([...refIds, ...aiRefIds, ...fullSearchIds]))

        let enrichedProducts = data.products || []
        if (allIds.length > 0) {
          const fetched = await fetchProductDetails(allIds)
          if (fetched.length > 0) {
            const fetchedIds = new Set(fetched.map((p: any) => p.id))
            const existing = enrichedProducts.filter((p: any) => !fetchedIds.has(p.id))
            enrichedProducts = [...fetched, ...existing]
          }
        }

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

        const citedIdsSet = new Set(refIds)
        const citedProducts = enrichedProducts.filter((p: any) => citedIdsSet.has(p.id))

        const enrichedIdSet = new Set(enrichedProducts.map((p: any) => p.id))
        const rawCitedObjects = rawRefs
          .filter(
            (item: any) =>
              typeof item === 'object' && item !== null && item.id && !enrichedIdSet.has(item.id),
          )
          .map((p: any) => ({
            ...p,
            image_url: p.image_url || p.imageUrl,
            manufacturer:
              p.manufacturer?.name ||
              p.manufacturers?.name ||
              (typeof p.manufacturer === 'object' && p.manufacturer !== null
                ? p.manufacturer.name
                : p.manufacturer),
          }))

        const finalReferencedProducts = [...citedProducts, ...rawCitedObjects]

        setResults({
          ...data,
          content: contentStr,
          referenced_internal_products:
            finalReferencedProducts.length > 0 ? finalReferencedProducts : refIds,
          ai_referenced_products: aiRefIds,
          full_search_results: data.full_search_results || [],
          products: enrichedProducts,
        })
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          console.error('AI Search Timeout:', err)
          setError(AI_SEARCH_TIMEOUT_MESSAGE)
          setResults({
            content: AI_SEARCH_TIMEOUT_MESSAGE,
            is_intermediate: false,
          })
        } else {
          console.error('AI Search Error:', err)
          const errorMessage =
            err instanceof SafeFetchError
              ? err.message
              : err.message || 'Ocorreu um erro ao processar sua busca.'
          setError(errorMessage)
          toast({
            title: 'Erro na busca',
            description: errorMessage,
            variant: 'destructive',
          })
          setResults(null)
        }
      } finally {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        abortControllerRef.current = null
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
