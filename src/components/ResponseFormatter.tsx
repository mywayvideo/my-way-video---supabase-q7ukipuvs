import React from 'react'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ReferencedProducts } from '@/components/ReferencedProducts'
import { ProductCard } from '@/components/ProductCard'
import { Product } from '@/types'

interface ResponseFormatterProps {
  content: string
  products?: Product[]
  stock?: Product[]
  referenced_internal_products?: string[]
  className?: string
}

export function ResponseFormatter({
  content,
  products,
  stock,
  className,
  referenced_internal_products,
}: ResponseFormatterProps) {
  if (!content) return null

  const formattedContent = content.replace(/my way/gi, 'MY WAY')

  const itemsToRender = stock && stock.length > 0 ? stock : products
  const productIds =
    referenced_internal_products && referenced_internal_products.length > 0
      ? referenced_internal_products
      : itemsToRender?.map((p: any) => p.id)

  return (
    <div className={cn('flex flex-col w-full space-y-8', className)}>
      <div className="prose prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {formattedContent}
        </ReactMarkdown>
      </div>

      {itemsToRender && itemsToRender.length > 0 && typeof itemsToRender[0] === 'object' ? (
        <div className="mt-8 animate-fade-in-up not-prose">
          <h3 className="text-sm font-bold tracking-widest text-zinc-500 uppercase mb-6 pl-3 border-l-4 border-primary">
            Equipamentos Localizados
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {itemsToRender.map((p: any) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      ) : productIds && productIds.length > 0 ? (
        <div className="mt-8 animate-fade-in-up not-prose">
          <h3 className="text-sm font-bold tracking-widest text-zinc-500 uppercase mb-6 pl-3 border-l-4 border-primary">
            Equipamentos Localizados
          </h3>
          <ReferencedProducts ids={productIds as string[]} />
        </div>
      ) : null}
    </div>
  )
}

const markdownComponents = {
  table: ({ children }: any) => (
    <div className="overflow-x-auto w-full my-6">
      <table className="border border-gray-700 border-collapse min-w-max text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="[&>tr]:bg-gray-800">{children}</thead>,
  th: ({ children }: any) => (
    <th className="border border-gray-700 px-3 py-2 whitespace-nowrap">{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="border border-gray-700 px-3 py-2 whitespace-nowrap">{children}</td>
  ),
  tr: ({ children }: any) => <tr className="even:bg-gray-900">{children}</tr>,
  h2: ({ node, ...props }: any) => (
    <h2
      className="text-xl font-bold mt-8 mb-4 text-zinc-200 border-b border-white/5 pb-2"
      {...props}
    />
  ),
  h3: ({ node, ...props }: any) => (
    <h3 className="text-lg font-semibold mt-6 mb-3 text-zinc-300" {...props} />
  ),
  strong: ({ node, ...props }: any) => <strong className="font-bold text-primary" {...props} />,
  ul: ({ node, ...props }: any) => (
    <ul className="ml-6 mt-4 mb-4 list-disc marker:text-primary/70 space-y-2" {...props} />
  ),
  li: ({ node, ...props }: any) => <li className="text-zinc-300 leading-relaxed" {...props} />,
  p: ({ node, ...props }: any) => (
    <p className="mb-4 last:mb-0 text-zinc-300 leading-relaxed" {...props} />
  ),
  a: ({ node, ...props }: any) => (
    <a className="text-primary underline underline-offset-4" {...props} />
  ),
}
