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

/**
 * Se o texto da resposta veio como envelope JSON (o modelo devolveu
 * {"message": "...", "should_show_whatsapp_button": true}), devolve só o
 * conteúdo. Aplica também quando o JSON está dentro de ```json.
 * Devolve o texto original quando não reconhece envelope.
 */
function unwrapJsonEnvelope(raw: string): string {
  if (!raw || typeof raw !== 'string') return raw
  const trimmed = raw.trim()
  const looksJson =
    trimmed.startsWith('{') || trimmed.startsWith('```json') || trimmed.startsWith('```')
  if (!looksJson) return raw
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').trim()
  const start = unfenced.indexOf('{')
  if (start === -1) return raw
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < unfenced.length; i++) {
    const ch = unfenced[i]
    if (esc) {
      esc = false
      continue
    }
    if (ch === '\\') {
      esc = true
      continue
    }
    if (ch === '"') {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          const parsed = JSON.parse(unfenced.slice(start, i + 1))
          const body = parsed?.message ?? parsed?.content
          if (typeof body === 'string' && body.trim()) return body
        } catch {
          /* não é envelope: devolve como veio */
        }
        return raw
      }
    }
  }
  return raw
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

    // REDE DE SEGURANÇA (13/11/2026): o modelo às vezes vaza as chaves do
    // contrato JSON como texto ("**should_show_whatsapp_button:** true"),
    // que aparecia para o cliente. Remove em qualquer resposta.
    finalContent = finalContent
      .replace(
        /^[\s\-*_`]*(should_show_whatsapp_button|confidence_level|referenced_internal_products|ai_referenced_products)\s*[*_`]*\s*:\s*[\s\S]{0,40}?$/gim,
        '',
      )
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    // REDE DE SEGURANÇA (13/11/2026): se o modelo devolveu o envelope JSON como
    // texto (vazava na tela como {"should_show_whatsapp_button": true} ...),
    // extrai o campo de conteúdo e descarta o resto. A causa foi corrigida nas
    // edge functions; isto protege o que já estiver em cache/em voo.
    finalContent = unwrapJsonEnvelope(finalContent)
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
      <div
        className="prose prose-sm prose-invert max-w-none break-words
          [&_h1]:text-[15px] [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:mb-2
          [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:mt-5 [&_h2]:mb-2
          [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5
          [&_p]:my-2.5 [&_p]:leading-relaxed [&_p]:text-zinc-200
          [&_ul]:my-2.5 [&_ol]:my-2.5 [&_li]:my-1 [&_li]:leading-relaxed
          [&_hr]:my-4 [&_hr]:border-zinc-800
          [&_strong]:text-zinc-100 [&_strong]:font-semibold"
      >
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
