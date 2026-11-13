import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Search as SearchIcon, X, Loader2, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { ProductCard } from '@/components/ProductCard'
import { cn } from '@/lib/utils'
import { useAiSearch } from '@/hooks/use-ai-search'
import { AISearchResults } from '@/components/AISearchResults'
import { HPProductSections } from '@/components/HPProductSections'
import { useMultipleProductDiscounts } from '@/hooks/useProductDiscount'
import { SEO } from '@/components/SEO'
import { debugLog, debugGroup, debugGroupEnd, safeLen } from '@/utils/debug-front'
import { AccessCard, type AccessKind } from '@/components/catalog/AccessCard'
import { CategoryCard, type CategoryCardData } from '@/components/catalog/CategoryCard'
import { catalogBrowseService } from '@/services/catalog-browse-service'
import { searchProducts } from '@/services/database-search'
import '@/styles/catalog-browse.css'

type Access = AccessKind | null

export default function Index() {
  const [access, setAccess] = useState<Access>('cat')

  // IA — lógica original preservada
  const [query, setQuery] = useState('')
  const { search, isLoading, results, error, clearResults } = useAiSearch()

  // Banco de dados
  const [dbQuery, setDbQuery] = useState('')
  const [dbResults, setDbResults] = useState<any[]>([])
  const [dbLoading, setDbLoading] = useState(false)
  const [dbBuscaFeita, setDbBuscaFeita] = useState(false)

  // Categorias
  const [categorias, setCategorias] = useState<CategoryCardData[]>([])
  const [catLoading, setCatLoading] = useState(true)

  // Destaques
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([])
  const featuredDiscounts = useMultipleProductDiscounts(featuredProducts)

  const section1Ids = useMemo(() => {
    if (!results?.content) return []
    const markerRegex = /<!--\s*PRODUCT_IMAGE:([0-9a-fA-F-]{36})\s*-->/g
    const ids: string[] = []
    let match: RegExpExecArray | null
    while ((match = markerRegex.exec(results.content)) !== null) {
      if (match[1] && !ids.includes(match[1])) {
        ids.push(match[1])
      }
    }
    return ids
  }, [results?.content])

  const section2Products = useMemo(() => {
    if (!results?.full_search_results || !Array.isArray(results.full_search_results)) return []
    const productMap = new Map((results.products || []).map((p: any) => [p.id, p]))
    return results.full_search_results.map((p: any) => {
      const dbProduct = productMap.get(p.id)
      return dbProduct ? { ...p, ...dbProduct } : p
    })
  }, [results?.full_search_results, results?.products])

  const allProductsData = useMemo(() => {
    const products = results?.products || []
    const merged = [...products]
    for (const sp of section2Products) {
      if (sp?.id && !merged.some((mp) => mp.id === sp.id)) {
        merged.push(sp)
      }
    }
    return merged
  }, [results?.products, section2Products])

  const enrichedResults = results
    ? {
        ...results,
        stock: [],
        search_results: {
          ...((results as any).search_results || {}),
          stock: [],
        },
      }
    : null

  useEffect(() => {
    ;(async () => {
      try {
        const cats = await catalogBrowseService.getCategoriesWithCounts()
        setCategorias(cats.map((c) => ({ id: c.id, name: c.name, productCount: c.productCount })))
      } catch (err) {
        console.error('Error fetching categories:', err)
      } finally {
        setCatLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await supabase
          .from('products')
          .select('*, manufacturer:manufacturers(*)')
          .eq('is_discontinued', false)
          .eq('is_special', true)
          .order('created_at', { ascending: false })
          .limit(8)
        setFeaturedProducts(data || [])
      } catch (err) {
        console.error('Error fetching featured products:', err)
      }
    })()
  }, [])

  useEffect(() => {
    if (results) {
      debugGroup('Index:AIResultReceived')
      debugLog(
        'Index:rawResult',
        `contentLen=${safeLen(results.content)} products=${results.products?.length || 0} referenced=${results.referenced_internal_products?.length || 0} confidence=${results.confidence_level || 'none'} shouldShowWhatsApp=${results.should_show_whatsapp_button || false}`,
      )
      debugLog('Index:forwarding', 'Data forwarded to AISearchResults component')
      debugGroupEnd()
    }
  }, [results])

  const totalProdutos = useMemo(
    () => categorias.reduce((s, c) => s + c.productCount, 0),
    [categorias],
  )
  const maiorCategoria = useMemo(
    () => categorias.reduce((m, c) => Math.max(m, c.productCount), 0),
    [categorias],
  )

  const handleSearch = () => {
    if (!query.trim()) return
    search(query)
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

  const handleDbSearch = useCallback(async () => {
    if (!dbQuery.trim()) return
    setDbLoading(true)
    setDbBuscaFeita(true)
    try {
      const data = await searchProducts(dbQuery)
      setDbResults(data || [])
    } catch (err) {
      console.error('Database search error:', err)
      setDbResults([])
    } finally {
      setDbLoading(false)
    }
  }, [dbQuery])

  const painelIA = (
    <div className="catalog-panel">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div>
          <div className="relative rounded-3xl border border-white/10 bg-card/60 backdrop-blur-xl p-5 flex flex-col gap-4 min-h-[180px]">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder="Descreva o que você precisa. Pode falar de uso, orçamento ou característica — não precisa saber o modelo. Ex.: preciso de um switcher com 4 saídas para estúdio pequeno."
              className="flex-1 bg-transparent border-0 focus:ring-0 resize-none text-base placeholder:text-muted-foreground/60 outline-none leading-relaxed disabled:opacity-50"
              rows={3}
            />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-2 flex-wrap">
                {['Câmera PTZ 4K com zoom 20x', 'Lente full-frame para entrevista'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setQuery(s)}
                    className="text-xs border border-border bg-secondary/40 text-muted-foreground px-3 py-2 rounded-full hover:text-foreground hover:border-accent/50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {query && !isLoading && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
                <Button
                  className="h-14 w-14 rounded-full bg-[#FF9F1A] hover:bg-[#FF9F1A]/90 text-[#111111]"
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
          <div id="ai-search-results" className="mt-4">
            {(isLoading || enrichedResults || error) && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <AISearchResults isLoading={isLoading} result={enrichedResults} error={error} />
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-secondary/25 p-5 h-fit">
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground/80 mb-4">
            Como funciona
          </h4>
          <ol className="space-y-3.5 text-xs text-muted-foreground leading-relaxed">
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-accent/15 text-accent font-bold grid place-items-center shrink-0">
                1
              </span>
              Você descreve a necessidade.
            </li>
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-accent/15 text-accent font-bold grid place-items-center shrink-0">
                2
              </span>
              A IA procura no nosso banco e cita os modelos reais.
            </li>
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-accent/15 text-accent font-bold grid place-items-center shrink-0">
                3
              </span>
              Compare preço USA e Brasil e adicione ao carrinho.
            </li>
          </ol>
          <p className="text-xs text-muted-foreground/70 mt-4 pt-4 border-t border-border leading-relaxed">
            Dúvida técnica complexa? A IA oferece falar com um especialista.
          </p>
        </div>
      </div>
    </div>
  )

  const painelBD = (
    <div className="catalog-panel">
      <div className="catalog-pbar">
        <span className="catalog-pill">Sem IA</span>
        <span>
          Consulta direta à tabela de produtos · <b>{totalProdutos.toLocaleString('pt-BR')}</b>{' '}
          itens · resposta imediata
        </span>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/25 px-4 py-3">
        <SearchIcon className="w-[19px] h-[19px] text-muted-foreground shrink-0" />
        <input
          value={dbQuery}
          onChange={(e) => setDbQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleDbSearch()
          }}
          placeholder="Nome, modelo ou SKU — ex.: ATEM 4 M/E Constellation, ILME-FX5"
          className="flex-1 bg-transparent border-0 outline-none text-[15px] text-foreground placeholder:text-muted-foreground/60"
        />
        <button
          type="button"
          onClick={handleDbSearch}
          disabled={dbLoading || !dbQuery.trim()}
          className="bg-[#FF9F1A] hover:bg-[#FF9F1A]/90 disabled:opacity-50 text-[#111111] font-extrabold text-xs px-4 py-2 rounded-lg transition-colors"
        >
          {dbLoading ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {dbLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : dbResults.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground mt-6 mb-4">
            {dbResults.length} resultado(s) para “{dbQuery}”
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {dbResults.map((p: any) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </>
      ) : dbBuscaFeita ? (
        <div className="text-center py-16 text-muted-foreground">
          <Database className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-base">Nenhum produto encontrado para “{dbQuery}”.</p>
        </div>
      ) : (
        <div className="text-center py-12 px-5 mt-5 rounded-2xl border border-dashed border-border bg-secondary/15">
          <SearchIcon className="w-8 h-8 mx-auto text-muted-foreground/25" />
          <p className="text-sm font-semibold text-muted-foreground mt-4">
            Digite o nome, o modelo ou o SKU para ver os produtos
          </p>
          <p className="text-xs text-muted-foreground/70 mt-2 max-w-md mx-auto leading-relaxed">
            Esta busca consulta a tabela de produtos diretamente, sem passar pela IA. O resultado
            traz preço na moeda de origem e o SKU para conferência.
          </p>
          <div className="flex gap-2 justify-center flex-wrap mt-4">
            {['ILME-FX5', 'ATEM 4 M/E', 'Canon EOS R5'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDbQuery(s)}
                className="text-xs border border-border bg-secondary/40 text-muted-foreground px-3 py-1.5 rounded-full hover:text-foreground hover:border-accent/50 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const painelCat = (
    <div className="catalog-panel">
      <div className="catalog-pbar">
        <span className="catalog-pill">Acesso direto ao banco</span>
        <span>
          <b>{categorias.length}</b> categorias · filtro por fabricante · ordenação por preço
        </span>
      </div>

      {catLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="cat-grid">
          {categorias.map((c, i) => (
            <CategoryCard key={c.id} category={c} index={i} maxCount={maiorCategoria} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap mt-5 pt-4 border-t border-border text-sm text-muted-foreground">
        <span>
          Clique numa categoria para ver os produtos, com filtro de fabricante e ordem de preço.
        </span>
        <Link to="/search" className="text-accent font-semibold hover:underline">
          Buscar por texto →
        </Link>
      </div>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col">
      <SEO title="Home" />

      <section className="relative w-full flex flex-col items-center px-4 overflow-hidden pt-20 pb-10">
        <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[600px] md:w-[800px] md:h-[800px] bg-amber-500/15 rounded-full blur-[100px] opacity-70 mix-blend-screen" />
        </div>

        <div className="relative z-10 w-full max-w-5xl flex flex-col items-center text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
            Três caminhos, um catálogo
          </span>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter mt-3">
            <span className="text-white block">Inteligência em</span>
            <span className="text-[#E1AD01] block">Audiovisual PRO</span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mt-3 font-light">
            Escolha por onde entrar: converse com a IA, busque direto no banco ou navegue pelas
            categorias.
          </p>

          <div className="w-full catalog-access-grid">
            <AccessCard kind="ia" ativo={access === 'ia'} onClick={() => setAccess('ia')} />
            <AccessCard kind="bd" ativo={access === 'bd'} onClick={() => setAccess('bd')} />
            <AccessCard kind="cat" ativo={access === 'cat'} onClick={() => setAccess('cat')} />
          </div>
        </div>

        <div className="relative z-10 w-full max-w-5xl mt-6">
          {access === 'ia' && painelIA}
          {access === 'bd' && painelBD}
          {access === 'cat' && painelCat}
        </div>
      </section>

      {!isLoading && results && section2Products.length > 0 && access === 'ia' && (
        <section className="container mx-auto px-4 pb-16">
          <HPProductSections
            section1Ids={section1Ids}
            section2Results={section2Products}
            allProductsData={allProductsData}
          />
        </section>
      )}

      {featuredProducts.length > 0 ? (
        <section className="container mx-auto px-4 pb-16">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" /> Novidades e Destaques
            </h2>
            <Link to="/search" className="text-sm text-accent font-semibold hover:underline">
              Ver catálogo →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {featuredProducts.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} discountData={featuredDiscounts[p.id] ?? null} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
