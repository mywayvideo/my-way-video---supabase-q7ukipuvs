import { useState, useMemo } from 'react'
import { ProductCard } from '@/components/ProductCard'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Search as SearchIcon, SlidersHorizontal } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

type SortOption = 'relevance' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc'

interface Props {
  products: any[]
  query: string
}

export function DatabaseSearchResults({ products, query }: Props) {
  const [sortBy, setSortBy] = useState<SortOption>('relevance')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  const maxAvailablePrice = Math.max(...products.map((p) => p.price_usd || 0), 1000)
  const [priceRange, setPriceRange] = useState<number[]>([0, maxAvailablePrice])

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[],
    [products],
  )

  const displayedProducts = useMemo(() => {
    let filtered = products.filter((p) => {
      const price = p.price_usd || 0
      return (
        price >= priceRange[0] &&
        price <= priceRange[1] &&
        (selectedCategories.length === 0 || selectedCategories.includes(p.category))
      )
    })

    return filtered.sort((a, b) => {
      if (sortBy === 'price_asc') return (a.price_usd || 0) - (b.price_usd || 0)
      if (sortBy === 'price_desc') return (b.price_usd || 0) - (a.price_usd || 0)
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name)
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name)
      return (b._relevanceScore || 0) - (a._relevanceScore || 0)
    })
  }, [products, selectedCategories, priceRange, sortBy])

  const Filters = () => (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-medium mb-4 uppercase tracking-wider text-muted-foreground">
          Categorias
        </h3>
        <div className="space-y-3">
          {categories.map((cat) => (
            <div key={cat} className="flex items-center space-x-2">
              <Checkbox
                id={`cat-${cat}`}
                checked={selectedCategories.includes(cat)}
                onCheckedChange={() =>
                  setSelectedCategories((p) =>
                    p.includes(cat) ? p.filter((c) => c !== cat) : [...p, cat],
                  )
                }
              />
              <Label
                htmlFor={`cat-${cat}`}
                className="text-sm font-normal cursor-pointer leading-none"
              >
                {cat}
              </Label>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-4 uppercase tracking-wider text-muted-foreground">
          Preço (USD)
        </h3>
        <div className="px-2">
          <Slider
            max={maxAvailablePrice}
            step={10}
            value={priceRange}
            onValueChange={setPriceRange}
            className="my-6"
          />
          <div className="flex items-center justify-between text-sm text-muted-foreground font-medium">
            <span>${priceRange[0]}</span>
            <span>${priceRange[1]}</span>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="animate-in fade-in flex flex-col items-start gap-6 mt-4 w-full">
      <div className="w-full flex justify-end gap-4 items-center mb-2">
        <div className="hidden md:flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ordenar por:</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Relevância" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevância</SelectItem>
              <SelectItem value="price_asc">Menor Preço</SelectItem>
              <SelectItem value="price_desc">Maior Preço</SelectItem>
              <SelectItem value="name_asc">Nome (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="md:hidden">
              <SlidersHorizontal className="w-4 h-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[300px]">
            <SheetHeader className="mb-6">
              <SheetTitle>Filtros</SheetTitle>
            </SheetHeader>
            <Filters />
          </SheetContent>
        </Sheet>
      </div>
      <div className="flex w-full gap-8">
        <aside className="hidden md:block w-64 shrink-0">
          <div className="bg-card border border-border/50 rounded-xl p-6">
            <Filters />
          </div>
        </aside>
        <div className="flex-1 w-full">
          {displayedProducts.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
              {displayedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 border border-dashed rounded-xl bg-secondary/20">
              <SearchIcon className="w-12 h-12 text-muted-foreground/50" />
              <p className="text-muted-foreground uppercase max-w-md">
                Nenhum produto encontrado para "{query}" com os filtros atuais.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedCategories([])
                  setPriceRange([0, maxAvailablePrice])
                }}
              >
                Limpar Filtros
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
