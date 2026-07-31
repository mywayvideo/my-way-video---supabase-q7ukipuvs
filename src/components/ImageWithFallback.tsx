import { useImageFallback } from '@/hooks/useImageFallback'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getProxiedImageUrl } from '@/lib/image-proxy'

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
  const proxiedSrc = getProxiedImageUrl(src)
  const { displayUrl, isLoading, hasError, retry } = useImageFallback(proxiedSrc, productId)

  if (isLoading) {
    return <Skeleton className={cn('w-full h-full rounded', className)} style={{ width, height }} />
  }

  if (hasError || !displayUrl) {
    return (
      <img
        src="https://img.usecurling.com/p/400/400?q=professional%20camera&color=gray"
        alt={alt || 'Imagem indisponível'}
        loading="lazy"
        crossOrigin="anonymous"
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
      crossOrigin="anonymous"
      width={width}
      height={height}
      className={cn('rounded', className)}
      onError={() => retry()}
    />
  )
}
