import { useState, useEffect, useCallback, useRef } from 'react'
import { getProxiedImageUrl, isStorageImageUrl } from '@/lib/image-proxy'

export function useImageFallback(imageUrl: string | null | undefined, _productId?: string) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const retry = useCallback(() => {
    if (retryCount < 3) {
      setRetryCount((prev) => prev + 1)
    }
  }, [retryCount])

  useEffect(() => {
    let isActive = true

    if (!imageUrl || !imageUrl.trim()) {
      setDisplayUrl(null)
      setIsLoading(false)
      setHasError(true)
      return
    }

    const resolvedPrimary = isStorageImageUrl(imageUrl)
      ? imageUrl
      : getProxiedImageUrl(imageUrl) || imageUrl

    const loadImage = async () => {
      setIsLoading(true)
      setHasError(false)

      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      abortControllerRef.current = new AbortController()
      const signal = abortControllerRef.current.signal

      try {
        // Try resolved primary URL (Storage or Proxied)
        const isValid = await testImage(resolvedPrimary, signal)
        if (isValid) {
          if (isActive) {
            setDisplayUrl(resolvedPrimary)
            setIsLoading(false)
          }
          return
        }

        // If primary was proxied and failed, try original URL as secondary attempt
        if (resolvedPrimary !== imageUrl) {
          const isOriginalValid = await testImage(imageUrl, signal)
          if (isOriginalValid) {
            if (isActive) {
              setDisplayUrl(imageUrl)
              setIsLoading(false)
            }
            return
          }
        }

        throw new Error('All image sources failed')
      } catch (err: any) {
        if (err.name === 'AbortError') return
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
  }, [imageUrl, retryCount])

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
