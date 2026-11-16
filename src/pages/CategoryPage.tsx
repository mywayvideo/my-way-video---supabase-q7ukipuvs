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
import { compatibilityService } from '@/services/compatibilityService'
import '@/styles/catalog-browse.css'

type Ordem = 'asc' | 'desc'
type Aba = 'produtos' | 'acessorios'

export default function CategoryPage() {
  const { id } = useParams<{ id: string }>()
  const [nomeCategoria, setNomeCategoria] = useState('')
  const [fabricantes, setFabricantes] = useState<ManufacturerWithCount[]>([])
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [ordem, setOrdem] = useState<Ordem>('asc')
  const [aba, setAba] = useState<Aba>('produtos')
  const [produtos, setProdutos] = useState<CatalogProduct[]>([])
  const [acessorios, setAcessorios] = useState<CatalogProduct[]>([])
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

  // produtos + acessórios: refaz a consulta quando filtro ou ordem mudam
  useEffect(() => {
    if (!id) return
    let cancelado = false
    setCarregando(true)
    ;(async () => {
      try {
        const [lista, accs] = await Promise.all([
          catalogBrowseService.getProductsByCategory({
            categoryId: id,
            manufacturerIds: selecionados,
            order: ordem,
            isAccessory: false,
          }),
          catalogBrowseService.getProductsByCategory({
            categoryId: id,
            manufacturerIds: selecionados,
            order: ordem,
            isAccessory: true,
          }),
        ])
        if (!cancelado) {
          setProdutos(lista)
          setAcessorios(accs)
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

  // Fase 3 (real): selo "tem acessórios" vem da tabela product_compatibilities
  // (vínculos aprovados), consultada em LOTE — um SELECT para a lista inteira,
  // sem N+1. Substitui a heurística provisória por referência de nome.
  const [idsComAcessorios, setIdsComAcessorios] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (produtos.length === 0) {
      setIdsComAcessorios(new Set())
      return
    }
    let cancelado = false
    compatibilityService
      .fetchProductIdsWithApprovedLinks(produtos.map((p) => p.id))
      .then((ids) => {
        if (!cancelado) setIdsComAcessorios(ids)
      })
      .catch(() => {
        if (!cancelado) setIdsComAcessorios(new Set())
      })
    return () => {
      cancelado = true
    }
  }, [produtos])

  const alternarFabricante = (mid: string) => {
    setSelecionados((atual) =>
      atual.includes(mid) ? atual.filter((x) => x !== mid) : [...atual, mid],
    )
  }

  const listaAtual = aba === 'produtos' ? produtos : acessorios

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
          {carregando
            ? 'Carregando…'
            : `${listaAtual.length} ${aba === 'produtos' ? 'produto(s)' : 'acessório(s)'} nesta seleção`}
        </p>
      </div>

      {/* Abas Produtos / Acessórios (Fase 3) */}
      <div className="cat-tabs">
        <button
          type="button"
          onClick={() => setAba('produtos')}
          className={`cat-tab ${aba === 'produtos' ? 'cat-tab-on' : ''}`}
        >
          Produtos ({produtos.length.toLocaleString('pt-BR')})
        </button>
        <button
          type="button"
          onClick={() => setAba('acessorios')}
          className={`cat-tab ${aba === 'acessorios' ? 'cat-tab-on' : ''}`}
        >
          Acessórios ({acessorios.length.toLocaleString('pt-BR')})
        </button>
      </div>

      {aba === 'produtos' && totalFabricantes > 1 && (
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
      ) : listaAtual.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <PackageX className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">
            {aba === 'produtos'
              ? 'Nenhum produto nesta seleção.'
              : 'Nenhum acessório nesta seleção.'}
          </p>
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
          {listaAtual.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              temAcessorios={aba === 'produtos' ? idsComAcessorios.has(p.id) : false}
            />
          ))}
        </div>
      )}
    </div>
  )
}
