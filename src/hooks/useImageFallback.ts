import { useState, useEffect, useCallback, useRef } from 'react'

export function useImageFallback(imageUrl: string | null | undefined, productId: string) {
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

    const loadImage = async () => {
      setIsLoading(true)
      setHasError(false)

      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      abortControllerRef.current = new AbortController()
      const signal = abortControllerRef.current.signal

      try {
        if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
          const isValid = await testImage(imageUrl, signal)
          if (isValid) {
            if (isActive) {
              setDisplayUrl(imageUrl)
              setIsLoading(false)
            }
            return
          }
          throw new Error('Direct image URL failed')
        }

        if (imageUrl) {
          const isValid = await testImage(imageUrl, signal)
          if (isValid) {
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
