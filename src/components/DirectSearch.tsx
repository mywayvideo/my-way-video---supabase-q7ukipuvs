import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Search, Loader2, Package } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Link, useNavigate } from 'react-router-dom'
import { useDebounce } from '@/hooks/use-debounce'

export function DirectSearch() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (debouncedQuery.trim().length >= 2) {
      setLoading(true)
      supabase
        .rpc('search_products_v2', { search_term: debouncedQuery, boost_multiplier: 1.0 })
        .then(async ({ data: rpcData }) => {
          if (!rpcData || rpcData.length === 0) {
            setResults([])
            setLoading(false)
            setOpen(true)
            return
          }
          const ids = rpcData.slice(0, 6).map((r: any) => r.id)
          const { data: products } = await supabase
            .from('products')
            .select('id, name, sku, category, image_url, is_discontinued')
            .in('id', ids)

          if (products) {
            const sorted = ids.map((id) => products.find((p) => p.id === id)).filter(Boolean)
            setResults(sorted)
          } else {
            setResults([])
          }
          setLoading(false)
          setOpen(true)
        })
        .catch(() => {
          setResults([])
          setLoading(false)
          setOpen(true)
        })
    } else {
      setResults([])
      setOpen(false)
    }
  }, [debouncedQuery])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={wrapperRef} className="w-full relative">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Buscar produto (Nome, SKU)..."
          className="w-full pl-11 pr-10 rounded-full bg-muted/30 border-transparent focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/20 hover:bg-muted/50 transition-all h-11 md:h-12 text-base shadow-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && query.trim()) {
              setOpen(false)
              navigate(`/search?q=${encodeURIComponent(query)}&type=database`)
            }
          }}
          onFocus={() => {
            if (results.length > 0) setOpen(true)
          }}
        />
        {loading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-3 bg-background border border-border rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 max-h-[60vh] overflow-y-auto">
          {results.map((p) => (
            <Link
              key={p.id}
              to={`/product/${p.id}`}
              onClick={() => {
                setOpen(false)
                setQuery('')
              }}
              className="flex items-center gap-4 p-4 hover:bg-muted/80 transition-colors border-b border-border/50 last:border-0"
            >
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt=""
                  className="w-12 h-12 object-contain rounded bg-white/5"
                />
              ) : (
                <div className="w-12 h-12 flex items-center justify-center bg-white/5 rounded">
                  <Package className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex flex-col flex-1 overflow-hidden gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm md:text-base font-medium truncate">{p.name}</span>
                  {p.is_discontinued && (
                    <span className="bg-yellow-100 text-yellow-700 rounded-md px-2 py-0.5 font-[600] text-[10px] shrink-0">
                      DESCONTINUADO
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground font-mono truncate">
                  SKU: {p.sku || 'N/A'} • {p.category || 'Geral'}
                </span>
              </div>
            </Link>
          ))}
          <button
            onClick={() => {
              setOpen(false)
              navigate(`/search?q=${encodeURIComponent(query)}&type=database`)
            }}
            className="w-full p-4 text-sm text-center text-primary font-medium hover:bg-muted/50 transition-colors"
          >
            Ver todos os resultados
          </button>
        </div>
      )}
      {open && !loading && debouncedQuery.length >= 2 && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-3 bg-background border border-border rounded-xl shadow-xl p-6 text-center text-base text-muted-foreground z-50">
          Nenhum equipamento encontrado.
        </div>
      )}
    </div>
  )
}
