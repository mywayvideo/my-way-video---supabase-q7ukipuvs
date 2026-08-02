import { useImageFallback } from '@/hooks/useImageFallback'
import { Skeleton } from '@/components/ui/skeleton'
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
  const { displayUrl, isLoading, hasError, retry } = useImageFallback(src, productId)

  if (isLoading) {
    return <Skeleton className={cn('w-full h-full rounded', className)} style={{ width, height }} />
  }

  if (hasError || !displayUrl) {
    return (
      <div
        className={cn('flex items-center justify-center rounded bg-zinc-800/60', className)}
        style={{ width, height }}
      >
        <span className="text-zinc-500 text-xs">Sem imagem</span>
      </div>
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
