import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ProductCard } from '@/components/ProductCard'
import { cn } from '@/lib/utils'

interface ResponseFormatterProps {
  content: string
  products?: any[]
  stock?: any[]
  referenced_internal_products?: string[]
  nabData?: any[]
  intel?: any[]
}

export function ResponseFormatter({
  content,
  products,
  stock,
  referenced_internal_products,
}: ResponseFormatterProps) {
  // SOBERANIA DE DADOS: Só exibimos o que a IA validou explicitamente por ID
  const finalProducts = useMemo(() => {
    let prods: any[] = products || []

    if (prods.length === 0 && stock && stock.length > 0 && referenced_internal_products) {
      const refs = referenced_internal_products
      prods = stock.filter((p: any) => refs.includes(p.id))
    }

    // Remove duplicatas por ID
    return prods.filter((v: any, i: number, a: any[]) => a.findIndex((t) => t.id === v.id) === i)
  }, [products, stock, referenced_internal_products])

  return (
    <div className="space-y-8 w-full max-w-full overflow-hidden">
      {/* RENDERIZAÇÃO SHOW: Estilo unificado com o Modal */}
      {content && (
        <div className="prose prose-invert max-w-none text-lg leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="overflow-x-auto w-full my-6">
                  <table className="border border-gray-700 border-collapse min-w-max text-sm">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => <thead className="[&>tr]:bg-gray-800">{children}</thead>,
              th: ({ children }) => (
                <th className="border border-gray-700 px-3 py-2 whitespace-nowrap">{children}</th>
              ),
              td: ({ children }) => (
                <td className="border border-gray-700 px-3 py-2 whitespace-nowrap">{children}</td>
              ),
              tr: ({ children }) => <tr className="even:bg-gray-900">{children}</tr>,
              // 1. Hierarquia Corrigida (text-xl) e Anti-Glare (zinc-200)
              h2: ({ children }) => (
                <h2 className="text-xl font-bold mt-8 mb-4 text-zinc-200 tracking-tight border-b border-white/5 pb-2">
                  {children}
                </h2>
              ),
              // 2. Conforto Visual (zinc-300) para o corpo do texto
              p: ({ children }) => (
                <p className="mb-4 last:mb-0 text-zinc-300 leading-relaxed">{children}</p>
              ),
              // 3. Bullets e Listas suavizados (zinc-300)
              li: ({ children }) => (
                <li className="mb-1 leading-normal text-zinc-300">{children}</li>
              ),
              ul: ({ children }) => (
                <ul className="list-disc ml-6 space-y-2 my-4 text-zinc-300">{children}</ul>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}

      {/* GRID DE PRODUTOS: Apenas produtos de elite validados */}
      {finalProducts && finalProducts.length > 0 && (
        <div className="mt-12 animate-fade-in-up border-t border-white/5 pt-8">
          <h3 className="text-sm font-bold tracking-widest text-zinc-500 uppercase mb-6">
            Produtos Relacionados MY WAY
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {finalProducts.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
