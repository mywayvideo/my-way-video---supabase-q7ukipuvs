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

  if (hasError) {
    return (
      <div
        className={cn(
          'w-full h-full bg-gray-200 flex flex-col items-center justify-center p-4 text-center rounded',
          className,
        )}
        style={{ width, height }}
      >
        <Camera className="w-12 h-12 text-gray-400 mb-2" />
        <span className="text-sm font-medium text-gray-600 mb-3">Imagem indisponível</span>
        {retryCount < 3 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.preventDefault()
              retry()
            }}
            className="h-8 text-xs gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Tentar novamente
          </Button>
        )}
      </div>
    )
  }

  if (!displayUrl) return null

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
