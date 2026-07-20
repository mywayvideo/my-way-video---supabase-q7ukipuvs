import React, { useMemo } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Phone } from 'lucide-react'
import { ProductCard } from '@/components/ProductCard'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import { WhatsAppButton } from '@/components/WhatsAppButton'
import { Button } from '@/components/ui/button'

interface ResponseFormatterProps {
  content: string
  products?: any[]
  stock?: any[]
  referenced_internal_products?: string[]
  currentProductId?: string
  showWhatsApp?: boolean
  onWhatsAppClick?: () => void
  onProductClick?: () => void
}

export function ResponseFormatter({
  content,
  products,
  stock,
  referenced_internal_products,
  currentProductId,
  showWhatsApp,
  onWhatsAppClick,
  onProductClick,
}: ResponseFormatterProps) {
  const { id: routeId } = useParams()
  const location = useLocation()

  const isProductRoute = location.pathname.startsWith('/product/')
  // Normalize both IDs to strings for comparison to avoid type mismatches
  const activeProductId = String(currentProductId || (isProductRoute ? routeId : '') || '')

  // SOBERANIA DE DADOS: Só exibimos o que a IA validou explicitamente por ID
  const finalProducts = useMemo(() => {
    let prods: any[] = products || []

    if (prods.length === 0 && stock && stock.length > 0 && referenced_internal_products) {
      const refs = referenced_internal_products.map((item: any) =>
        typeof item === 'object' && item !== null ? item.id : item,
      )
      prods = stock.filter((p: any) => refs.includes(p.id))
    }

    // Remove duplicatas por ID e apenas mantém objetos válidos com ID
    let filtered = prods.filter(
      (v: any, i: number, a: any[]) =>
        v?.id && typeof v === 'object' && a.findIndex((t) => String(t?.id) === String(v.id)) === i,
    )

    return filtered
  }, [products, stock, referenced_internal_products])

  // Detect and extract markdown content if the AI returned a JSON string
  const extractContent = (raw: string): string => {
    if (!raw) return ''
    const trimmed = raw.trim()
    // If it looks like a JSON object, try to parse and extract the "content" field
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (typeof parsed === 'object' && parsed !== null) {
          if (typeof parsed.content === 'string') return parsed.content
          if (typeof parsed.message === 'string') return parsed.message
          if (typeof parsed.response === 'string') return parsed.response
        }
      } catch {
        // Not valid JSON, return as-is
      }
    }
    return raw
  }

  // Extract inline WhatsApp triggers to ensure they only appear at the bottom
  const cleanContent = extractContent(content || '')
    ?.replace(/<WhatsAppButton[^>]*\/>/gi, '')
    ?.replace(/\[WHATSAPP_BUTTON\]/gi, '')
    ?.replace(/\[WHATSAPP\]/gi, '')
    // Also cleanup some leftover AI tokens
    ?.replace(/realizando busca profunda my way/gi, '')
    ?.trim()

  const hasWhatsAppTrigger =
    showWhatsApp || /<WhatsAppButton/i.test(content || '') || /\[WHATSAPP/i.test(content || '')

  return (
    <div className="flex flex-col space-y-6 w-full max-w-full overflow-hidden">
      {/* 1. AI Text/Markdown Response */}
      {cleanContent && (
        <div className="order-1 prose prose-invert max-w-none text-base leading-relaxed w-full break-words">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="overflow-x-auto w-full my-6">
                  <table className="border border-zinc-800/60 border-collapse min-w-max text-sm">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => <thead className="[&>tr]:bg-zinc-800/40">{children}</thead>,
              th: ({ children }) => (
                <th className="border border-zinc-800/60 px-4 py-3 whitespace-nowrap text-left font-semibold text-zinc-200">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-zinc-800/60 px-4 py-3 whitespace-nowrap text-zinc-300">
                  {children}
                </td>
              ),
              tr: ({ children }) => (
                <tr className="even:bg-zinc-900/40 hover:bg-zinc-800/20 transition-colors">
                  {children}
                </tr>
              ),
              h1: ({ children }) => (
                <h1 className="text-2xl font-bold mt-8 mb-4 text-green-400 tracking-tight border-b border-green-900/30 pb-2">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl font-bold mt-6 mb-3 text-green-400 tracking-tight">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-lg font-bold mt-4 mb-2 text-green-400">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="mb-4 last:mb-0 text-white/90 leading-relaxed">{children}</p>
              ),
              li: ({ children }) => (
                <li className="mb-1 leading-normal text-white/90">{children}</li>
              ),
              ul: ({ children }) => (
                <ul className="list-disc ml-6 space-y-2 my-4 text-white/90">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal ml-6 space-y-2 my-4 text-white/90">{children}</ol>
              ),
              strong: ({ children }) => (
                <strong className="font-bold text-white">{children}</strong>
              ),
              em: ({ children }) => <em className="text-green-100/80 italic">{children}</em>,
              a: ({ children, href }) => (
                <a
                  href={href}
                  className="text-green-400 hover:text-green-300 underline underline-offset-4 decoration-green-900/50"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),
              img: ({ src, alt }) => {
                const srcStr = typeof src === 'string' ? src : ''
                const needsProxy =
                  srcStr.startsWith('https://www.bhphotovideo.com') ||
                  srcStr.startsWith('https://static.bhphoto.com') ||
                  srcStr.startsWith('https://bhphotovideo.com') ||
                  srcStr.startsWith('https://www.bhphoto.com')
                const finalSrc = needsProxy
                  ? `/api/image-proxy?url=${encodeURIComponent(srcStr)}`
                  : srcStr
                return (
                  <img
                    src={finalSrc}
                    alt={alt || ''}
                    className="mx-auto block w-full max-w-sm rounded-lg object-contain bg-zinc-900 border border-zinc-800/60 p-2 my-6"
                  />
                )
              },
              whatsappbutton: () => null,
            }}
          >
            {cleanContent}
          </ReactMarkdown>
        </div>
      )}

      {/* 2. Product Cards Section — PP vs HP */}
      {finalProducts && finalProducts.length > 0 && (
        <div className="order-2 mt-8 animate-fade-in-up">
          {/* PP: "Produtos Referenciados" — produto origem incluso */}
          {isProductRoute && (
            <>
              <h3 className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-4 flex items-center gap-3">
                <span className="w-8 h-[1px] bg-green-900/50" />
                Produtos Referenciados
                <span className="flex-1 h-[1px] bg-green-900/30" />
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {finalProducts
                  .filter((p: any) => {
                    // PP: mostra o produto atual + os produtos que a IA referenciou por ID
                    if (!isProductRoute) return true // HP: mostra todos
                    if (!referenced_internal_products) return false // PP sem referências: não mostra nada
                    return (
                      referenced_internal_products.includes(p.id) ||
                      p.id === (activeProductId || currentProductId)
                    )
                  })
                  .map((p: any) => (
                    <div
                      key={p.id}
                      onClick={onProductClick}
                      className={onProductClick ? 'cursor-pointer' : ''}
                    >
                      <ProductCard product={p} />
                    </div>
                  ))}
              </div>
            </>
          )}

          {/* HP: "Produtos Relacionados" — NUNCA aparece na PP */}
          {!isProductRoute && (
            <>
              <h3 className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-4 flex items-center gap-3">
                <span className="w-8 h-[1px] bg-green-900/50" />
                Produtos Relacionados MY WAY
                <span className="flex-1 h-[1px] bg-green-900/30" />
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {finalProducts.map((p: any) => (
                  <div
                    key={p.id}
                    onClick={onProductClick}
                    className={onProductClick ? 'cursor-pointer' : ''}
                  >
                    <ProductCard product={p} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 3. WhatsApp Button */}
      {hasWhatsAppTrigger && (
        <div className="order-3 mt-6 animate-fade-in-up w-full">
          <div className="pt-6 border-t border-green-900/30">
            {onWhatsAppClick ? (
              <Button
                variant="default"
                onClick={onWhatsAppClick}
                className="w-full sm:w-auto bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-sm border border-green-600/20 group transition-all duration-300"
              >
                <Phone className="w-4 h-4 mr-2 group-hover:rotate-12 transition-transform" />
                Falar com Especialista
              </Button>
            ) : (
              <WhatsAppButton />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
