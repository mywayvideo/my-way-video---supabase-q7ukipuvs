import { useMemo } from 'react'
import { ProductImages } from '@/components/shared/ProductImages'
import { ReferencedProducts } from '@/components/ReferencedProducts'
import MarkdownWithTables from '@/components/MarkdownWithTables'
import { Button } from '@/components/ui/button'
import { MessageCircle } from 'lucide-react'
import {
  processProductImages,
  type ProductImageInfo,
  type ProcessProductImagesResult,
} from '@/utils/productImageProcessor'
import { debugLog, debugGroup, debugGroupEnd, safeLen } from '@/utils/debug-front'

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
  const { cleanedContent, mentionedProductIds } = useMemo(() => {
    debugGroup('ResponseFormatter:process')
    debugLog(
      'ResponseFormatter:rawContent',
      `len=${safeLen(content)} products=${products?.length || 0} hideProductImages=${hideProductImages}`,
    )
    const productImageInfos: ProductImageInfo[] = (products || [])
      .filter((p: any) => p?.id && p?.name && p?.image_url)
      .map((p: any) => ({
        name: p.name,
        image_url: p.image_url,
        id: p.id,
      }))
    debugLog(
      'ResponseFormatter:preparedImages',
      `count=${productImageInfos.length} names=[${productImageInfos.map((p) => p.name).join(', ')}]`,
    )
    const result = processProductImages(content, hideProductImages ? [] : productImageInfos)
    debugLog(
      'ResponseFormatter:processedContent',
      `inputLen=${safeLen(content)} outputLen=${safeLen(result.content)} insertedIds=${result.insertedProductIds.length} mentionedIds=${result.mentionedProductIds.length}`,
    )
    debugGroupEnd()
    // REGRA (13/11/2026): hideProductImages significa SEM imagens inline no texto.
    // O processador não injeta (lista vazia), mas o modelo pode ter emitido
    // ![imagem](url) por conta própria e placeholders [PRODUCT:uuid] podem ter
    // sobrado — tudo isso é removido aqui. Os cards ReferencedProducts continuam.
    let finalContent = result.content
    if (hideProductImages) {
      finalContent = finalContent
        .replace(/<!--\s*PRODUCT(?:_IMAGE)?:([0-9a-fA-F-]{36})\s*-->/g, '')
        .replace(/\[PRODUCT:([0-9a-fA-F-]{36})\]/g, '')
        .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    }
    return {
      cleanedContent: finalContent,
      mentionedProductIds: result.mentionedProductIds,
    }
  }, [content, products, hideProductImages])

  const allReferencedIds = useMemo(() => {
    return [...new Set(mentionedProductIds)].filter((id) => id !== currentProductId)
  }, [mentionedProductIds, currentProductId])

  const filteredProducts = useMemo(() => {
    const idSet = new Set(allReferencedIds)
    return (products || []).filter(
      (p: any) => p?.id && idSet.has(p.id) && p.id !== currentProductId,
    )
  }, [products, allReferencedIds, currentProductId])

  return (
    <div className="space-y-4 w-full">
      <div className="prose prose-sm prose-invert max-w-none break-words">
        <MarkdownWithTables markdown={cleanedContent} />
      </div>

      {!hideProductImages && allReferencedIds.length > 0 && filteredProducts.length > 0 && (
        <ProductImages products={filteredProducts} referencedInternalProducts={allReferencedIds} />
      )}

      {allReferencedIds.length > 0 && (
        <div onClick={onProductClick} className="not-prose overflow-hidden max-w-full">
          <ReferencedProducts products={filteredProducts} currentProductId={currentProductId} />
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
