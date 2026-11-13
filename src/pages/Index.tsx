import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Search as SearchIcon, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { ProductCard } from '@/components/ProductCard'
import { useAiSearch } from '@/hooks/use-ai-search'
import { AISearchResults } from '@/components/AISearchResults'
import { HPProductSections } from '@/components/HPProductSections'
import { useMultipleProductDiscounts } from '@/hooks/useProductDiscount'
import { SEO } from '@/components/SEO'
import { debugLog, debugGroup, debugGroupEnd, safeLen } from '@/utils/debug-front'
import { AccessCard, type AccessKind } from '@/components/catalog/AccessCard'
import { CategoryCard, type CategoryCardData } from '@/components/catalog/CategoryCard'
import { LiveDbSearch } from '@/components/catalog/LiveDbSearch'
import { catalogBrowseService } from '@/services/catalog-browse-service'
import '@/styles/catalog-browse.css'

type Access = AccessKind | null

/**
 * Leva o cursor e a tela direto ao campo de digitação do acesso escolhido.
 * `block: 'center'` funciona com o cabeçalho fixo em qualquer largura (o
 * cabeçalho dobra em duas linhas no celular), e `preventScroll` no focus
 * evita que o navegador role por conta própria e brigue com a animação.
 */
function focarCampo(el: HTMLElement | null) {
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  window.setTimeout(() => {
    el.focus({ preventScroll: true })
    if (el instanceof HTMLTextAreaElement) {
      const fim = el.value.length
      el.setSelectionRange(fim, fim)
    }
  }, 320)
}

export default function Index() {
  const [access, setAccess] = useState<Access>('cat')

  const [query, setQuery] = useState('')
  const { search, isLoading, results, error, clearResults } = useAiSearch()

  const [categorias, setCategorias] = useState<CategoryCardData[]>([])
  const [catLoading, setCatLoading] = useState(true)

  const [featuredProducts, setFeaturedProducts] = useState<any[]>([])
  const featuredDiscounts = useMultipleProductDiscounts(featuredProducts)

  const aiInputRef = useRef<HTMLTextAreaElement>(null)
  const dbInputRef = useRef<HTMLInputElement>(null)
  const painelRef = useRef<HTMLDivElement>(null)

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

  /**
   * Escolher um acesso: abre o painel e já posiciona o cursor no campo.
   * Categorias não tem campo — nesse caso a tela vai para o início do painel.
   */
  const escolherAcesso = (kind: AccessKind) => {
    const jaEstavaAberto = access === kind
    setAccess(kind)

    if (kind === 'ia') {
      window.setTimeout(() => focarCampo(aiInputRef.current), jaEstavaAberto ? 0 : 60)
      return
    }
    if (kind === 'bd') {
      window.setTimeout(() => focarCampo(dbInputRef.current), jaEstavaAberto ? 0 : 60)
      return
    }
    painelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSearch = () => {
    if (!query.trim()) return
    search(query)
    setTimeout(() => {
      document
        .getElementById('ai-search-results')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
    aiInputRef.current?.focus({ preventScroll: true })
  }

  const painelIA = (
    <div className="catalog-panel">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="min-w-0">
          <div className="relative rounded-3xl border border-white/10 bg-card/60 backdrop-blur-xl p-4 sm:p-5 flex flex-col gap-4 min-h-[180px]">
            <textarea
              ref={aiInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder="Descreva o que você precisa. Pode falar de uso, orçamento ou característica — não precisa saber o modelo. Ex.: preciso de um switcher com 4 saídas para estúdio pequeno."
              className="w-full flex-1 bg-transparent border-0 focus:ring-0 resize-none text-base placeholder:text-muted-foreground/60 outline-none leading-relaxed disabled:opacity-50"
              rows={3}
            />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-2 flex-wrap">
                {['Câmera PTZ 4K com zoom 20x', 'Lente full-frame para entrevista'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setQuery(s)
                      aiInputRef.current?.focus({ preventScroll: true })
                    }}
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
                    aria-label="Limpar pergunta"
                    className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
                <Button
                  className="h-14 w-14 rounded-full bg-[#FF9F1A] hover:bg-[#FF9F1A]/90 text-[#111111]"
                  onClick={handleSearch}
                  disabled={isLoading || !query.trim()}
                  aria-label="Buscar com a IA"
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
          itens · resultado enquanto digita
        </span>
      </div>
      <LiveDbSearch inputRef={dbInputRef} />
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

      <section className="relative w-full flex flex-col items-center px-3 sm:px-4 overflow-hidden pt-10 sm:pt-20 pb-10">
        <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[600px] md:w-[800px] md:h-[800px] bg-amber-500/15 rounded-full blur-[100px] opacity-70 mix-blend-screen" />
        </div>

        <div className="relative z-10 w-full max-w-5xl flex flex-col items-center text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
            Três caminhos, um catálogo
          </span>
          <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter mt-3">
            <span className="text-white block">Inteligência em</span>
            <span className="text-[#E1AD01] block">Audiovisual PRO</span>
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mt-3 font-light px-2">
            Escolha por onde entrar: converse com a IA, busque direto no banco ou navegue pelas
            categorias.
          </p>

          <div className="w-full catalog-access-grid">
            <AccessCard kind="ia" ativo={access === 'ia'} onClick={() => escolherAcesso('ia')} />
            <AccessCard kind="bd" ativo={access === 'bd'} onClick={() => escolherAcesso('bd')} />
            <AccessCard kind="cat" ativo={access === 'cat'} onClick={() => escolherAcesso('cat')} />
          </div>
        </div>

        <div ref={painelRef} className="relative z-10 w-full max-w-5xl mt-5 sm:mt-6 scroll-mt-28">
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
        <section className="container mx-auto px-3 sm:px-4 pb-16">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
            <h2 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" /> Novidades e Destaques
            </h2>
            <Link to="/search" className="text-sm text-accent font-semibold hover:underline">
              Ver catálogo →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {featuredProducts.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} discountData={featuredDiscounts[p.id] ?? null} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
