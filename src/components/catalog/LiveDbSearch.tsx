import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useDebounce } from '@/hooks/use-debounce'
import { ProductCard } from '@/components/ProductCard'

/**
 * Busca direto no banco, ao vivo — MESMO comportamento da barra do cabeçalho
 * (DirectSearch): o resultado aparece enquanto se digita, sem clicar em buscar.
 * Regras copiadas do cabeçalho: debounce de 300 ms, mínimo de 2 caracteres e o
 * mesmo RPC `search_products_v2`. Enter leva para /search, igual ao cabeçalho.
 */
export function LiveDbSearch({ inputRef }: { inputRef?: React.RefObject<HTMLInputElement> }) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [buscou, setBuscou] = useState(false)
  const navigate = useNavigate()
  const internoRef = useRef<HTMLInputElement>(null)
  const ref = inputRef || internoRef

  useEffect(() => {
    const termo = debouncedQuery.trim()
    if (termo.length < 2) {
      setResults([])
      setLoading(false)
      setBuscou(false)
      return
    }

    let cancelado = false
    setLoading(true)

    supabase.rpc('search_products_v2', { search_term: termo, boost_multiplier: 1.0 }).then(
      async ({ data: rpcData }) => {
        if (cancelado) return
        if (!rpcData || rpcData.length === 0) {
          setResults([])
          setLoading(false)
          setBuscou(true)
          return
        }
        const ids = rpcData.slice(0, 12).map((r: any) => r.id)
        const { data: products } = await supabase
          .from('products')
          .select('*, manufacturer:manufacturers(*)')
          .in('id', ids)

        if (cancelado) return
        if (products) {
          // preserva a ordem de relevância do RPC
          const ordenados = ids.map((id) => products.find((p: any) => p.id === id)).filter(Boolean)
          setResults(ordenados)
        } else {
          setResults([])
        }
        setLoading(false)
        setBuscou(true)
      },
      () => {
        if (cancelado) return
        setResults([])
        setLoading(false)
        setBuscou(true)
      },
    )

    return () => {
      cancelado = true
    }
  }, [debouncedQuery])

  const limpar = () => {
    setQuery('')
    setResults([])
    setBuscou(false)
    ref.current?.focus()
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/25 px-4 py-3">
        <Search className="w-[19px] h-[19px] text-muted-foreground shrink-0" />
        <input
          ref={ref}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && query.trim()) {
              navigate(`/search?q=${encodeURIComponent(query)}&type=database`)
            }
          }}
          placeholder="Nome, modelo ou SKU — ex.: ATEM 4 M/E Constellation, ILME-FX5"
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] text-foreground placeholder:text-muted-foreground/60"
          autoComplete="off"
          spellCheck={false}
        />
        {loading && (
          <Loader2 className="w-[18px] h-[18px] animate-spin text-muted-foreground shrink-0" />
        )}
        {!loading && query && (
          <button
            type="button"
            onClick={limpar}
            aria-label="Limpar busca"
            className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : results.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground mt-6 mb-4">
            {results.length} resultado(s) para “{query.trim()}”
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {results.map((p: any) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </>
      ) : buscou ? (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-base">Nenhum equipamento encontrado.</p>
        </div>
      ) : (
        <div className="text-center py-12 px-5 mt-5 rounded-2xl border border-dashed border-border bg-secondary/15">
          <Search className="w-8 h-8 mx-auto text-muted-foreground/25" />
          <p className="text-sm font-semibold text-muted-foreground mt-4">
            Digite o nome, o modelo ou o SKU — o resultado aparece enquanto você digita
          </p>
          <p className="text-xs text-muted-foreground/70 mt-2 max-w-md mx-auto leading-relaxed">
            Consulta direta à tabela de produtos, sem passar pela IA. Mesmo mecanismo da barra de
            busca do topo do site.
          </p>
          <div className="flex gap-2 justify-center flex-wrap mt-4">
            {['ILME-FX5', 'ATEM 4 M/E', 'Canon EOS R5'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQuery(s)}
                className="text-xs border border-border bg-secondary/40 text-muted-foreground px-3 py-1.5 rounded-full hover:text-foreground hover:border-accent/50 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
