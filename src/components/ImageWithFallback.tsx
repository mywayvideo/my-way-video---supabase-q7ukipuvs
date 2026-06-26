import { useImageFallback } from '@/hooks/useImageFallback'
import { Skeleton } from '@/components/ui/skeleton'
import { Camera, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ImageWithFallbackProps {
  src?: string | null
  alt?: string
  productId: string
  className?: string
  width?: number
  height?: number
}

export function ImageWithFallback({
  src,
  alt,
  productId,
  className,
  width,
  height,
}: ImageWithFallbackProps) {
  const { displayUrl, isLoading, hasError, retryCount, retry } = useImageFallback(src, productId)

  if (isLoading) {
    return <Skeleton className={cn('w-full h-full rounded', className)} style={{ width, height }} />
  }

  if (hasError || !displayUrl) {
    return (
      <img
        src="https://img.usecurling.com/p/400/400?q=professional%20camera&color=gray"
        alt={alt || 'Imagem indisponível'}
        loading="lazy"
        width={width}
        height={height}
        className={cn('rounded', className)}
      />
    )
  }

  return (
    <img
      src={displayUrl}
      alt={alt || 'Product Image'}
      loading="lazy"
      width={width}
      height={height}
      className={cn('rounded', className)}
      onError={() => retry()}
    />
  )
}
