import { useState, useEffect, useCallback, useRef } from 'react'
import { getProxiedImageUrl } from '@/lib/image-proxy'

export function useImageFallback(imageUrl: string | null | undefined, productId: string) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

  const retry = useCallback(() => {
    if (retryCount < 3) {
      setRetryCount((prev) => prev + 1)
    }
  }, [retryCount])

  useEffect(() => {
    let isActive = true

    const loadImage = async () => {
      setIsLoading(true)
      setHasError(false)

      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      abortControllerRef.current = new AbortController()
      const signal = abortControllerRef.current.signal

      try {
        // 1. Se a URL for externa (http/https), tenta direto primeiro — igual ao Testador de Busca
        if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
          const isDirectValid = await testImage(imageUrl, signal)
          if (isDirectValid) {
            if (isActive) {
              setDisplayUrl(imageUrl)
              setIsLoading(false)
            }
            return
          }

          // Se direto falhou, tenta via proxy (pode ser B&H que precisa de proxy)
          const proxiedUrl = getProxiedImageUrl(imageUrl) || imageUrl
          if (proxiedUrl !== imageUrl) {
            const isProxyValid = await testImage(proxiedUrl, signal)
            if (isProxyValid) {
              if (isActive) {
                setDisplayUrl(proxiedUrl)
                setIsLoading(false)
              }
              return
            }
          }

          // URL externa falhou direto e via proxy
          throw new Error('All image sources failed')
        }

        // 2. Para URLs relativas (armazenadas no Supabase Storage), tenta Storage primeiro
        if (productId) {
          const supabaseUrl = `${SUPABASE_URL}/storage/v1/object/public/products/${productId}`
          const isSupabaseValid = await testImage(supabaseUrl, signal)

          if (isSupabaseValid) {
            if (isActive) {
              setDisplayUrl(supabaseUrl)
              setIsLoading(false)
            }
            return
          }
        }

        // 3. Fallback: tenta a URL original (relativa ou via proxy)
        if (imageUrl) {
          const proxiedUrl = getProxiedImageUrl(imageUrl) || imageUrl
          const isOriginalValid = await testImage(proxiedUrl, signal)
          if (isOriginalValid) {
            if (isActive) {
              setDisplayUrl(proxiedUrl)
              setIsLoading(false)
            }
            return
          }
        }

        // 4. Tudo falhou
        throw new Error('All image sources failed')
      } catch (err: any) {
        if (err.name === 'AbortError') return
        if (import.meta.env.DEV) {
          console.error(`[useImageFallback] Error loading image for product ${productId}:`, err)
        }
        if (isActive) {
          setHasError(true)
          setIsLoading(false)
        }
      }
    }

    loadImage()

    return () => {
      isActive = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [imageUrl, productId, SUPABASE_URL, retryCount])

  const testImage = (url: string, signal: AbortSignal): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(true)
      img.onerror = () => resolve(false)

      signal.addEventListener('abort', () => {
        img.src = ''
        reject(new DOMException('Aborted', 'AbortError'))
      })

      img.src = url
    })
  }

  return { displayUrl, isLoading, hasError, retryCount, retry }
}
