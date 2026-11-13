import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loader2, ArrowLeft, PackageX } from 'lucide-react'
import { ProductCard } from '@/components/ProductCard'
import { supabase } from '@/lib/supabase/client'
import {
  catalogBrowseService,
  type CatalogProduct,
  type ManufacturerWithCount,
} from '@/services/catalog-browse-service'
import '@/styles/catalog-browse.css'

type Ordem = 'asc' | 'desc'

export default function CategoryPage() {
  const { id } = useParams<{ id: string }>()
  const [nomeCategoria, setNomeCategoria] = useState('')
  const [fabricantes, setFabricantes] = useState<ManufacturerWithCount[]>([])
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [ordem, setOrdem] = useState<Ordem>('asc')
  const [produtos, setProdutos] = useState<CatalogProduct[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // nome da categoria + fabricantes disponíveis (só os desta categoria)
  useEffect(() => {
    if (!id) return
    let cancelado = false
    ;(async () => {
      try {
        const { data } = await (supabase.from('categories') as any)
          .select('name')
          .eq('id', id)
          .maybeSingle()
        if (!cancelado && data?.name) setNomeCategoria(data.name)

        const mfrs = await catalogBrowseService.getManufacturersForCategory(id)
        if (!cancelado) setFabricantes(mfrs)
      } catch (e: any) {
        if (!cancelado) setErro(e?.message || 'Não foi possível carregar a categoria.')
      }
    })()
    return () => {
      cancelado = true
    }
  }, [id])

  // produtos: refaz a consulta quando filtro ou ordem mudam
  useEffect(() => {
    if (!id) return
    let cancelado = false
    setCarregando(true)
    ;(async () => {
      try {
        const lista = await catalogBrowseService.getProductsByCategory({
          categoryId: id,
          manufacturerIds: selecionados,
          order: ordem,
        })
        if (!cancelado) {
          setProdutos(lista)
          setErro(null)
        }
      } catch (e: any) {
        if (!cancelado) setErro(e?.message || 'Não foi possível carregar os produtos.')
      } finally {
        if (!cancelado) setCarregando(false)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [id, selecionados, ordem])

  const totalFabricantes = useMemo(() => fabricantes.length, [fabricantes])

  const alternarFabricante = (mid: string) => {
    setSelecionados((atual) =>
      atual.includes(mid) ? atual.filter((x) => x !== mid) : [...atual, mid],
    )
  }

  if (!id) return null

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para a home
      </Link>

      <div className="cat-page-head">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          {nomeCategoria || 'Categoria'}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {carregando ? 'Carregando…' : `${produtos.length} produto(s) nesta seleção`}
        </p>
      </div>

      {totalFabricantes > 1 && (
        <div className="cat-toolbar">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Fabricante
          </span>
          {fabricantes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => alternarFabricante(m.id)}
              className={`cat-chip ${selecionados.includes(m.id) ? 'cat-chip-on' : ''}`}
            >
              {m.name} <span className="opacity-60">({m.productCount})</span>
            </button>
          ))}
          {selecionados.length > 0 && (
            <button
              type="button"
              onClick={() => setSelecionados([])}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              limpar
            </button>
          )}
        </div>
      )}

      <div className="cat-toolbar">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Ordem
        </span>
        <button
          type="button"
          onClick={() => setOrdem('asc')}
          className={`cat-chip ${ordem === 'asc' ? 'cat-chip-on' : ''}`}
        >
          Menor preço (US$)
        </button>
        <button
          type="button"
          onClick={() => setOrdem('desc')}
          className={`cat-chip ${ordem === 'desc' ? 'cat-chip-on' : ''}`}
        >
          Maior preço (US$)
        </button>
      </div>

      {erro && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="flex justify-center items-center py-24">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : produtos.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <PackageX className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">Nenhum produto nesta seleção.</p>
          {selecionados.length > 0 && (
            <button
              type="button"
              onClick={() => setSelecionados([])}
              className="mt-3 text-sm underline hover:text-foreground"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
          {produtos.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  )
}
