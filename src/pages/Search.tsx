import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { ProductCard } from '@/components/ProductCard'
import { Button } from '@/components/ui/button'
import {
  Loader2,
  MessageCircle,
  Bot,
  Search as SearchIcon,
  Sparkles,
  AlertTriangle,
  Database,
} from 'lucide-react'
import { performAISearch } from '@/services/ai-search'
import { searchProducts } from '@/services/database-search'

export default function Search() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const searchType = searchParams.get('type') || 'database'
  const [loading, setLoading] = useState(false)
  const [aiResponse, setAiResponse] = useState<any>(null)
  const [products, setProducts] = useState<any[]>([])

  useEffect(() => {
    const handleClear = () => {
      setAiResponse(null)
      setProducts([])
    }
    window.addEventListener('clear-search-response', handleClear)
    return () => window.removeEventListener('clear-search-response', handleClear)
  }, [])

  useEffect(() => {
    async function doSearch() {
      if (!query.trim()) {
        setAiResponse(null)
        setProducts([])
        return
      }
      setLoading(true)
      setAiResponse(null)
      setProducts([])

      try {
        if (searchType === 'ai') {
          const { data, error } = await performAISearch(query)
          if (error) throw error
          if (data) {
            const message = data.message
            const referenced_internal_products = (data as any).referenced_internal_products || []
            const confidence_level = data.confidence_level

            setAiResponse({
              message,
              referenced_internal_products,
              confidence_level,
              should_show_whatsapp_button: data.should_show_whatsapp_button,
              whatsapp_reason: data.whatsapp_reason,
              type: data.type,
            })

            if (referenced_internal_products.length > 0) {
              if (typeof referenced_internal_products[0] === 'object') {
                setProducts(referenced_internal_products)
              } else {
                const { data: pData } = await supabase
                  .from('products')
                  .select('*, manufacturers(*)')
                  .in('id', referenced_internal_products)
                if (pData) setProducts(pData)
              }
            }
          }
        } else {
          // Direct Database Search
          const data = await searchProducts(query)
          setProducts(data || [])
        }
      } catch (error) {
        console.error('Error:', error)
      } finally {
        setLoading(false)
      }
    }
    doSearch()
  }, [query, searchType])

  const showWhatsAppButton =
    aiResponse?.should_show_whatsapp_button ||
    aiResponse?.confidence_level === 'low' ||
    aiResponse?.type === 'not_found'

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-6xl min-h-[70vh]">
      {query && (
        <div className="flex items-center gap-3 mb-8 pb-4 border-b border-border/50">
          {searchType === 'ai' ? (
            <Sparkles className="w-6 h-6 text-accent" />
          ) : (
            <SearchIcon className="w-6 h-6 text-primary" />
          )}
          <h1 className="text-2xl font-bold">
            {searchType === 'ai' ? 'Análise IA para' : 'Resultados para'} "{query}"
          </h1>
        </div>
      )}

      {loading && (
        <div className="flex flex-col justify-center items-center py-24 space-y-6">
          <div className="relative">
            <Loader2 className="w-14 h-14 animate-spin text-primary" />
            {searchType === 'ai' && (
              <Sparkles className="w-6 h-6 absolute -top-2 -right-2 text-accent animate-pulse" />
            )}
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-xl font-semibold text-primary animate-pulse">
              {searchType === 'ai'
                ? 'A IA está analisando especificações e integrando dados...'
                : 'Buscando no catálogo...'}
            </h3>
          </div>
        </div>
      )}

      {!loading && searchType === 'ai' && aiResponse && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mb-8">
          <div className="bg-card border border-primary/20 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start shadow-sm">
            <div className="bg-primary/10 p-4 rounded-full shrink-0">
              <Bot className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 w-full">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <h3 className="font-semibold text-xl">Consultor Técnico IA</h3>
                {aiResponse.confidence_level && (
                  <span
                    className={`text-xs px-3 py-1 rounded-full uppercase font-semibold flex items-center gap-1 ${
                      aiResponse.confidence_level === 'high'
                        ? 'bg-green-100 text-green-700'
                        : aiResponse.confidence_level === 'medium'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {aiResponse.confidence_level === 'low' && <AlertTriangle className="w-3 h-3" />}
                    Confiança: {aiResponse.confidence_level}
                  </span>
                )}
              </div>

              <div className="prose prose-invert max-w-none text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {aiResponse.message}
              </div>

              {showWhatsAppButton && (
                <div className="pt-6 mt-6 border-t border-border/50">
                  <div className="mb-4 text-sm text-muted-foreground bg-secondary/30 p-4 rounded-lg border border-border/50 flex items-start gap-3">
                    <MessageCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>
                      {aiResponse.whatsapp_reason ||
                        'Recomendamos o contato direto com um especialista humano para validar as especificações complexas deste projeto e garantir total compatibilidade.'}
                    </span>
                  </div>
                  <Button
                    size="lg"
                    className="bg-[#25D366] hover:bg-[#1DA851] text-white shadow-md hover:shadow-lg transition-all"
                    onClick={() =>
                      window.open(
                        `https://wa.me/17867161170?text=${encodeURIComponent(`Dúvida técnica: "${query}"`)}`,
                        '_blank',
                      )
                    }
                  >
                    <MessageCircle className="w-5 h-5 mr-2" /> Falar com Especialista
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && products.length > 0 && (
        <div className="animate-in fade-in slide-in-from-bottom-4 mt-12">
          {searchType === 'ai' && (
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" /> Equipamentos Recomendados
            </h2>
          )}
          {searchType === 'database' && (
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" /> Resultados Encontrados
            </h2>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}

      {!loading && products.length === 0 && searchType === 'database' && query && (
        <div className="text-center py-20 text-muted-foreground animate-in fade-in">
          <Database className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg">Nenhum equipamento encontrado para "{query}".</p>
        </div>
      )}
    </div>
  )
}
