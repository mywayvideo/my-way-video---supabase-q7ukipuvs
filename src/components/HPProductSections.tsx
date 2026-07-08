import { ProductCard } from '@/components/ProductCard'

interface HPProductSectionsProps {
  section1Ids: string[]
  section2Results: any[]
  allProductsData: any[]
}

export function HPProductSections({
  section1Ids,
  section2Results,
  allProductsData,
}: HPProductSectionsProps) {
  const section1Products = allProductsData.filter((p) => section1Ids.includes(p.id))

  const section2Ids = section2Results.map((p) => p.id).filter(Boolean)
  const section2FilteredIds = section2Ids.filter((id) => !section1Ids.includes(id))
  const section2Products = allProductsData.filter((p) => section2FilteredIds.includes(p.id))

  if (section1Products.length === 0 && section2Products.length === 0) {
    return null
  }

  return (
    <div className="space-y-10">
      {section1Products.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <span className="w-8 h-[1px] bg-green-900/50" />
            <h3 className="text-xs font-bold tracking-widest text-zinc-500 uppercase">
              Produtos Mencionados
            </h3>
            <span className="flex-1 h-[1px] bg-green-900/30" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {section1Products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}

      {section2Products.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <span className="w-8 h-[1px] bg-green-900/50" />
            <h3 className="text-xs font-bold tracking-widest text-zinc-500 uppercase">
              Mais resultados para sua busca
            </h3>
            <span className="flex-1 h-[1px] bg-green-900/30" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {section2Products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
