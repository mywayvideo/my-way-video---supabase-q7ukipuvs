import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { ProductCard } from '@/components/ProductCard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, RefreshCcw } from 'lucide-react'
import { SEO } from '@/components/SEO'

export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const navigate = useNavigate()

  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchResults = async () => {
    if (!query) {
      setProducts([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const searchTerm = `%${query}%`
      const { data, error: dbError } = await supabase
        .from('products')
        .select('*')
        .eq('is_discontinued', false)
        .or(`name.ilike.${searchTerm},sku.ilike.${searchTerm}`)
        .limit(100)

      if (dbError) throw dbError

      const sortedData = (data || []).sort((a, b) => {
        const aName = a.name.toLowerCase()
        const bName = b.name.toLowerCase()
        const term = query.toLowerCase()

        let scoreA = 0
        let scoreB = 0

        if (a.sku?.toLowerCase() === term) scoreA += 100
        else if (a.sku?.toLowerCase().includes(term)) scoreA += 50
        if (aName === term) scoreA += 100
        else if (aName.includes(term)) scoreA += 10

        if (b.sku?.toLowerCase() === term) scoreB += 100
        else if (b.sku?.toLowerCase().includes(term)) scoreB += 50
        if (bName === term) scoreB += 100
        else if (bName.includes(term)) scoreB += 10

        if (scoreA !== scoreB) return scoreB - scoreA
        return a.name.localeCompare(b.name)
      })

      setProducts(sortedData)
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao buscar os produtos na base MY WAY.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchResults()
  }, [query])

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-7xl min-h-[70vh]">
      <SEO title={`Resultados para "${query}"`} />
      <div className="flex items-center gap-4 mb-8 border-b border-border pb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="shrink-0 rounded-full"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-wide flex items-center gap-3">
          RESULTADOS DA BUSCA PARA <span className="text-primary font-bold">"{query}"</span>
        </h1>
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-[350px] w-full rounded-xl bg-white/5" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <p className="text-destructive font-medium text-lg uppercase tracking-wide">
            ERRO AO BUSCAR RESULTADOS NA BASE MY WAY.
          </p>
          <p className="text-muted-foreground uppercase">{error}</p>
          <Button onClick={fetchResults} className="gap-2 mt-4 uppercase font-bold tracking-wide">
            <RefreshCcw className="w-4 h-4" /> TENTAR NOVAMENTE
          </Button>
        </div>
      )}

      {!loading && !error && products.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 max-w-lg mx-auto border border-dashed border-border rounded-xl p-8">
          <p className="text-muted-foreground text-lg uppercase tracking-wide">
            NENHUM PRODUTO ENCONTRADO PARA <strong className="text-foreground">"{query}"</strong> EM
            NOSSA BASE MY WAY. USE NOSSA IA PARA UMA BUSCA CONSULTIVA.
          </p>
        </div>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  )
}
