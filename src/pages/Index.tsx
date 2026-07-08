import { useState, useEffect, useMemo } from 'react'
import { Sparkles, Search as SearchIcon, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { ProductCard } from '@/components/ProductCard'
import { cn } from '@/lib/utils'
import { useAiSearch } from '@/hooks/use-ai-search'
import { AISearchResults } from '@/components/AISearchResults'
import { HPProductSections } from '@/components/HPProductSections'
import { SEO } from '@/components/SEO'

export default function Index() {
  const [query, setQuery] = useState('')
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([])
  const [aiProducts, setAiProducts] = useState<any[]>([])
  const [section2Products, setSection2Products] = useState<any[]>([])
  const { search, isLoading, results, error, clearResults } = useAiSearch()

  useEffect(() => {
    const fetchReferencedProducts = async () => {
      if (!results) {
        setAiProducts([])
        return
      }

      const refIds: string[] = Array.from(
        new Set(
          [
            ...(results.referenced_internal_products || []),
            ...(results.related_product_ids || []),
            ...(results.search_results?.referenced_internal_products || []),
            ...(results.search_results?.related_product_ids || []),
          ]
            .map((item: any) => (typeof item === 'object' && item !== null ? item.id : item))
            .filter((id) => typeof id === 'string' && id.trim() !== ''),
        ),
      )

      if (refIds.length > 0) {
        const { data } = await supabase
          .from('products')
          .select('*, manufacturer:manufacturers(*)')
          .in('id', refIds)

        if (data) {
          setAiProducts(data)
        }
      } else {
        setAiProducts([])
      }
    }

    fetchReferencedProducts()
  }, [results])

  useEffect(() => {
    const fetchSection2Products = async () => {
      if (
        !results?.full_search_results ||
        !Array.isArray(results.full_search_results) ||
        results.full_search_results.length === 0
      ) {
        setSection2Products([])
        return
      }

      const section2Ids = results.full_search_results
        .map((p: any) => p?.id)
        .filter((id: any) => typeof id === 'string' && id.trim() !== '')

      if (section2Ids.length === 0) {
        setSection2Products(results.full_search_results)
        return
      }

      const { data: complementary } = await supabase
        .from('products')
        .select('id, image_url, weight, technical_info, is_discontinued')
        .in('id', section2Ids)

      if (complementary) {
        const compMap = new Map(complementary.map((p: any) => [p.id, p]))
        const merged = results.full_search_results.map((p: any) => ({
          ...p,
          ...compMap.get(p.id),
        }))
        setSection2Products(merged)
      } else {
        setSection2Products(results.full_search_results)
      }
    }

    fetchSection2Products()
  }, [results?.full_search_results])

  const section1Ids = useMemo(() => {
    const aiRefs = (results?.ai_referenced_products || []) as any[]
    return aiRefs
      .map((item: any) => (typeof item === 'object' && item !== null ? item.id : item))
      .filter((id: any) => typeof id === 'string' && id.trim() !== '')
  }, [results?.ai_referenced_products])

  const allProductsData = useMemo(() => {
    const merged = [...aiProducts]
    for (const sp of section2Products) {
      if (sp?.id && !merged.some((mp) => mp.id === sp.id)) {
        merged.push(sp)
      }
    }
    return merged
  }, [aiProducts, section2Products])

  const enrichedResults = results
    ? {
        ...results,
        referenced_internal_products: [],
        products: [],
        stock: [],
        search_results: {
          ...(results.search_results || {}),
          stock: [],
        },
      }
    : null

  useEffect(() => {
    supabase
      .from('products')
      .select('*, manufacturer:manufacturers(*)')
      .eq('is_discontinued', false)
      .eq('is_special', true)
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data }) => setFeaturedProducts(data || []))
      .catch((err) => console.error('Error fetching featured products:', err))
  }, [])

  const handleSearch = () => {
    if (!query.trim()) return
    search(query)
    // Scroll para as mensagens transitórias
    setTimeout(() => {
      document
        .getElementById('ai-search-results')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSearch()
    }
  }

  const handleClear = () => {
    setQuery('')
    clearResults()
  }

  return (
    <div className="flex-1 flex flex-col">
      <SEO title="Home" />
      {/* Hero Section */}
      <section className="relative w-full flex flex-col items-center justify-center px-4 overflow-hidden pt-24 pb-20 md:pt-32 md:pb-32">
        {/* Intensified Radial Glow Effect */}
        <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[600px] md:w-[800px] md:h-[800px] bg-amber-500/20 rounded-full blur-[100px] opacity-80 mix-blend-screen" />
        </div>

        <div className="relative z-10 w-full max-w-4xl flex flex-col items-center gap-10 text-center">
          <div className="space-y-6">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter flex flex-col items-center gap-2">
              <span className="text-white">Inteligência em</span>
              <span className="text-[#E1AD01] text-[clamp(2rem,8vw,4.2rem)] leading-tight whitespace-nowrap">
                Audiovisual PRO
              </span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-light">
              Pesquise os produtos que precisa. Informe o modelo ou as suas características. Nossa
              Inteligência Artificial encontrará tudo que você precisa.
            </p>
          </div>

          {/* Refined Prompt Component */}
          <div className="w-full relative group max-w-3xl mx-auto">
            {/* Outer subtle glow for the input */}
            <div className="absolute -inset-1 bg-gradient-to-r from-accent/20 via-primary/10 to-accent/20 rounded-[2.5rem] blur-xl transition-all duration-500 group-hover:blur-2xl group-focus-within:blur-2xl group-focus-within:opacity-100 opacity-70" />

            <div
              className={cn(
                'relative flex items-center bg-card/60 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-3 transition-all duration-500',
                isLoading
                  ? 'border-orange-500/50 bg-card/80'
                  : 'focus-within:border-orange-500/70 focus-within:ring-2 focus-within:ring-orange-500/15 focus-within:bg-card/80 shadow-[0_0_15px_rgba(255,255,255,0.05)] focus-within:shadow-[0_0_12px_rgba(249,115,22,0.12)]',
              )}
            >
              <div className="pl-5 pr-3 text-accent shrink-0 flex items-center justify-center h-full">
                <Sparkles className={cn('w-6 h-6', isLoading ? 'animate-spin' : 'animate-pulse')} />
              </div>

              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder="Ex.: Câmera PTZ 4K com zoom óptico 20x"
                className={cn(
                  'flex-1 bg-transparent border-0 focus:ring-0 resize-none h-24 py-3 text-[16px] md:text-[18px] placeholder:text-muted-foreground/60 text-muted-foreground font-light outline-none leading-normal disabled:opacity-50',
                  query ? 'overflow-y-auto' : 'overflow-hidden',
                )}
              />

              {query && !isLoading && (
                <button
                  onClick={handleClear}
                  className="p-2 mr-1 text-muted-foreground hover:text-white transition-colors flex items-center justify-center shrink-0 h-full"
                >
                  <X className="w-5 h-5" />
                </button>
              )}

              {/* Orange Pill-shaped Button */}
              <Button
                className="h-14 w-16 md:w-24 rounded-full bg-orange-500 hover:bg-orange-600 text-white shrink-0 ml-1 transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(249,115,22,0.3)] flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
                onClick={handleSearch}
                disabled={isLoading || !query.trim()}
              >
                {isLoading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <SearchIcon className="w-6 h-6" />
                )}
              </Button>
            </div>
          </div>
        </div>
        {/* AI Results — DENTRO da Hero Section, sobre o brilho */}
        <div className="relative z-10 w-full max-w-4xl mt-2 md:mt-4">
          {(isLoading || enrichedResults || error) && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <AISearchResults isLoading={isLoading} result={enrichedResults} error={error} />
            </div>
          )}
        </div>
      </section>

      {!isLoading && results && (section1Ids.length > 0 || section2Products.length > 0) && (
        <section className="container mx-auto px-4 pb-16">
          <HPProductSections
            section1Ids={section1Ids}
            section2Results={section2Products}
            allProductsData={allProductsData}
          />
        </section>
      )}

      {/* Featured Products */}
      {featuredProducts.length > 0 && !enrichedResults && !isLoading && (
        <section className="container mx-auto px-4 pb-16 mt-10 md:mt-10">
          <h2 className="text-2xl font-semibold mb-8 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" /> Novidades e Destaques
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {featuredProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
