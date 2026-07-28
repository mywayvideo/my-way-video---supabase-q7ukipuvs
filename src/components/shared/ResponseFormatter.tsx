import { useMemo } from 'react'
import { ProductImages } from '@/components/shared/ProductImages'
import { ReferencedProducts } from '@/components/ReferencedProducts'
import MarkdownWithTables from '@/components/MarkdownWithTables'
import { Button } from '@/components/ui/button'
import { MessageCircle } from 'lucide-react'

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface ResponseFormatterProps {
  content: string
  products?: any[]
  referenced_internal_products?: Array<string | Record<string, any>>
  currentProductId?: string
  showWhatsApp?: boolean
  onWhatsAppClick?: () => void
  onProductClick?: () => void
  hideProductImages?: boolean
}

export function ResponseFormatter({
  content,
  products = [],
  referenced_internal_products = [],
  currentProductId,
  showWhatsApp = false,
  onWhatsAppClick,
  onProductClick,
  hideProductImages = false,
}: ResponseFormatterProps) {
  const { cleanedContent, parsedProductIds } = useMemo(() => {
    const idRegex = /\[PRODUCT:([0-9a-fA-F-]{36})\]/g
    const ids: string[] = []
    let match: RegExpExecArray | null
    while ((match = idRegex.exec(content)) !== null) {
      ids.push(match[1])
    }
    const cleaned = content.replace(idRegex, '').trim()
    return { cleanedContent: cleaned, parsedProductIds: ids }
  }, [content])

  const allReferencedIds = useMemo(() => {
    const refIds = (referenced_internal_products || [])
      .map((item: any) => (typeof item === 'object' && item !== null ? item.id : item))
      .filter((id: any): id is string => typeof id === 'string' && id.trim() !== '')
    return [...new Set([...parsedProductIds, ...refIds])].filter((id) => id !== currentProductId)
  }, [parsedProductIds, referenced_internal_products, currentProductId])

  const filteredProducts = useMemo(() => {
    return (products || []).filter((p: any) => p?.id && p.id !== currentProductId)
  }, [products, currentProductId])

  return (
    <div className="space-y-4 w-full">
      <div className="prose prose-sm prose-invert max-w-none break-words">
        <MarkdownWithTables markdown={cleanedContent} />
      </div>

      {!hideProductImages && allReferencedIds.length > 0 && filteredProducts.length > 0 && (
        <ProductImages products={filteredProducts} referencedInternalProducts={allReferencedIds} />
      )}

      {allReferencedIds.length > 0 && (
        <div onClick={onProductClick} className="not-prose">
          <ReferencedProducts ids={allReferencedIds} currentProductId={currentProductId} />
        </div>
      )}

      {showWhatsApp && onWhatsAppClick && (
        <div className="pt-2">
          <Button
            onClick={onWhatsAppClick}
            className="bg-green-600 hover:bg-green-700 text-white"
            size="sm"
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Falar com Especialista
          </Button>
        </div>
      )}
    </div>
  )
}
