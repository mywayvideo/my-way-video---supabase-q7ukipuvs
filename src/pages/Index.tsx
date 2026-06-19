import { useState, useEffect } from 'react'
import { Sparkles, Search as SearchIcon, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { ProductCard } from '@/components/ProductCard'
import { cn } from '@/lib/utils'
import { useAiSearch } from '@/hooks/use-ai-search'
import { AISearchResults } from '@/components/AISearchResults'
import { SEO } from '@/components/SEO'

export default function Index() {
  const [query, setQuery] = useState('')
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([])
  const { search, isLoading, results, error, clearResults } = useAiSearch()

  useEffect(() => {
    supabase
      .from('products')
      .select('*, manufacturers(*)')
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
              Descreva seu projeto ou busque o equipamento ideal. Nossa inteligência artificial
              encontrará as melhores soluções para você.
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
                placeholder="Ex. Camera PTZ 4K... (utilize a barra superiora para pesquisar diretamente no nosso banco de dados)"
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
          {(isLoading || results || error) && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <AISearchResults isLoading={isLoading} result={results} error={error} />
            </div>
          )}
        </div>
      </section>

      {/* Featured Products */}
      {featuredProducts.length > 0 && !results && !isLoading && (
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
