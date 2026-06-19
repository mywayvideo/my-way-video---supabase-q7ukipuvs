import { useState, useEffect, useCallback, useRef } from 'react'

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
        // 1. Try Supabase Storage first
        const supabaseUrl = `${SUPABASE_URL}/storage/v1/object/public/products/${productId}`
        const isSupabaseValid = await testImage(supabaseUrl, signal)

        if (isSupabaseValid) {
          if (isActive) {
            setDisplayUrl(supabaseUrl)
            setIsLoading(false)
          }
          return
        }

        // 2. If fails, try original imageUrl
        if (imageUrl) {
          const isOriginalValid = await testImage(imageUrl, signal)
          if (isOriginalValid) {
            if (isActive) {
              setDisplayUrl(imageUrl)
              setIsLoading(false)
            }
            return
          }
        }

        // 3. Both failed
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
