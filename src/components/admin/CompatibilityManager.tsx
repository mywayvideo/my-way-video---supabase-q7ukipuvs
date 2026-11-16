import { useCallback, useEffect, useState } from 'react'
import { Link2, Loader2, Plus, Search, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import {
  compatibilityService,
  type CatalogSearchItem,
  type CompatibilityLink,
} from '@/services/compatibilityService'

type LinkMode = 'accessory' | 'main'

/**
 * Vínculo MANUAL de compatibilidade (Fase 2). Dois modos:
 *  - "A partir do acessório": o admin escolhe um acessório (is_accessory = true) e aponta
 *    os produtos principais com que ele funciona (fluxo original).
 *  - "A partir do produto principal": o admin escolhe o principal (is_accessory = false) e
 *    designa QUALQUER produto como acessório dele, marcado como acessório ou não.
 * Não há IA nem sugestão automática aqui.
 */
export function CompatibilityManager() {
  const [mode, setMode] = useState<LinkMode>('accessory')

  // Modo "a partir do acessório" (fluxo original)
  const [accessoryTerm, setAccessoryTerm] = useState('')
  const [accessoryResults, setAccessoryResults] = useState<CatalogSearchItem[]>([])
  const [searchingAccessory, setSearchingAccessory] = useState(false)
  const [accessory, setAccessory] = useState<CatalogSearchItem | null>(null)

  // Modo "a partir do produto principal"
  const [mainTerm, setMainTerm] = useState('')
  const [mainResults, setMainResults] = useState<CatalogSearchItem[]>([])
  const [searchingMain, setSearchingMain] = useState(false)
  const [mainProduct, setMainProduct] = useState<CatalogSearchItem | null>(null)

  const [mainDesignatedTerm, setMainDesignatedTerm] = useState('')
  const [mainDesignatedResults, setMainDesignatedResults] = useState<CatalogSearchItem[]>([])
  const [searchingMainDesignated, setSearchingMainDesignated] = useState(false)

  const [links, setLinks] = useState<CompatibilityLink[]>([])
  const [reverseLinks, setReverseLinks] = useState<CompatibilityLink[]>([])
  const [tableUnavailable, setTableUnavailable] = useState(false)
  const [loadingLinks, setLoadingLinks] = useState(false)

  const [productTerm, setProductTerm] = useState('')
  const [productResults, setProductResults] = useState<CatalogSearchItem[]>([])
  const [searchingProduct, setSearchingProduct] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  /** Produto em edição no modo atual. */
  const activeProduct = mode === 'accessory' ? accessory : mainProduct

  const runAccessorySearch = async () => {
    setSearchingAccessory(true)
    try {
      setAccessoryResults(await compatibilityService.searchAccessories(accessoryTerm))
    } catch (err: any) {
      toast({ title: 'Erro na busca', description: err?.message, variant: 'destructive' })
    } finally {
      setSearchingAccessory(false)
    }
  }

  const runMainSearch = async () => {
    setSearchingMain(true)
    try {
      setMainResults(await compatibilityService.searchMainProducts(mainTerm))
    } catch (err: any) {
      toast({ title: 'Erro na busca', description: err?.message, variant: 'destructive' })
    } finally {
      setSearchingMain(false)
    }
  }

  const loadLinks = useCallback(async (productId: string) => {
    setLoadingLinks(true)
    try {
      const result = await compatibilityService.fetchLinks(productId)
      setLinks(result.links)
      setReverseLinks(result.reverseLinks)
      setTableUnavailable(result.unavailable)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar vínculos',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setLoadingLinks(false)
    }
  }, [])

  useEffect(() => {
    if (activeProduct) void loadLinks(activeProduct.id)
    else {
      setLinks([])
      setReverseLinks([])
    }
  }, [activeProduct, loadLinks])

  const runProductSearch = async () => {
    if (!accessory) return
    setSearchingProduct(true)
    try {
      setProductResults(
        await compatibilityService.searchCompatibleCandidates(productTerm, accessory.id),
      )
    } catch (err: any) {
      toast({ title: 'Erro na busca', description: err?.message, variant: 'destructive' })
    } finally {
      setSearchingProduct(false)
    }
  }

  /** Modo principal: busca livre de candidatos a acessório (sem filtro is_accessory). */
  const runMainDesignatedSearch = async () => {
    if (!mainProduct) return
    setSearchingMainDesignated(true)
    try {
      setMainDesignatedResults(
        await compatibilityService.searchAccessoryCandidates(mainDesignatedTerm, mainProduct.id),
      )
    } catch (err: any) {
      toast({ title: 'Erro na busca', description: err?.message, variant: 'destructive' })
    } finally {
      setSearchingMainDesignated(false)
    }
  }

  const handleAddAccessoryMode = async (product: CatalogSearchItem) => {
    if (!accessory) return
    setBusyId(product.id)
    try {
      await compatibilityService.addManualLink(accessory.id, product.id)
      toast({ title: 'Vínculo criado', description: product.name })
      await loadLinks(accessory.id)
    } catch (err: any) {
      toast({ title: 'Erro ao vincular', description: err?.message, variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const handleAddMainMode = async (candidate: CatalogSearchItem) => {
    if (!mainProduct) return
    setBusyId(candidate.id)
    try {
      await compatibilityService.addMainProductLink(mainProduct.id, candidate.id)
      toast({ title: 'Vínculo criado', description: candidate.name })
      // Mantém a lista de candidatos visível (como no fluxo legado): o item designado
      // passa a aparecer marcado como "Já designado" via reverseIds após o loadLinks.
      await loadLinks(mainProduct.id)
    } catch (err: any) {
      toast({ title: 'Erro ao vincular', description: err?.message, variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const handleRemove = async (link: CompatibilityLink, isReverse: boolean) => {
    if (!activeProduct) return
    setBusyId(link.id)
    try {
      await compatibilityService.removeLink(link.id)
      toast({ title: 'Vínculo removido', description: link.name })
      await loadLinks(activeProduct.id)
      void isReverse
    } catch (err: any) {
      toast({ title: 'Erro ao remover', description: err?.message, variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const handleModeChange = (next: LinkMode) => {
    setMode(next)
    setLinks([])
    setReverseLinks([])
    setAccessory(null)
    setMainProduct(null)
    setProductResults([])
    setMainDesignatedResults([])
    setProductTerm('')
    setMainDesignatedTerm('')
  }

  const linkedIds = new Set(links.map((l) => l.productId))
  const reverseIds = new Set(reverseLinks.map((l) => l.productId))

  return (
    <div className="bg-card border border-border/50 rounded-xl shadow-sm p-4 space-y-6">
      <div>
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Link2 className="w-4 h-4" /> Compatibilidade de acessórios
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Vínculo técnico: indique com quais produtos cada acessório funciona. Não confundir com
          "produtos relacionados" (sugestão comercial). Os vínculos são criados manualmente aqui.
        </p>
      </div>

      {tableUnavailable && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            A tabela de compatibilidade ainda não existe no banco. Aplique a migração
            <code className="mx-1">20261115130000_product_compatibilities.sql</code> no SQL Editor
            do Supabase para habilitar esta tela.
          </span>
        </div>
      )}

      {/* Alternador de modo */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Modo de vínculo</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={mode === 'accessory' ? 'default' : 'outline'}
            onClick={() => handleModeChange('accessory')}
          >
            A partir do acessório
          </Button>
          <Button
            size="sm"
            variant={mode === 'main' ? 'default' : 'outline'}
            onClick={() => handleModeChange('main')}
          >
            A partir do produto principal
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {mode === 'accessory'
            ? 'Escolha um acessório (is_accessory = true) e aponte os produtos principais com que ele funciona.'
            : 'Escolha o produto principal (is_accessory = false) e designe QUALQUER produto do sistema como acessório dele — inclusive baterias, memórias e itens de outras categorias.'}
        </p>
      </section>

      {mode === 'accessory' ? (
        <>
          {/* 1. Escolher o acessório */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium">1. Escolha o acessório</h3>
            <div className="flex gap-2">
              <Input
                value={accessoryTerm}
                onChange={(e) => setAccessoryTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runAccessorySearch()}
                placeholder="Nome ou SKU do acessório (somente is_accessory = true, mín. 2 letras)"
                className="h-9"
              />
              <Button size="sm" onClick={runAccessorySearch} disabled={searchingAccessory}>
                {searchingAccessory ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span className="ml-2">Buscar</span>
              </Button>
            </div>
            {accessoryResults.length > 0 && (
              <ul className="divide-y divide-border/50 border border-border/50 rounded-md">
                {accessoryResults.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 p-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        SKU {item.sku || '—'} · {item.category || 'sem categoria'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={accessory?.id === item.id ? 'default' : 'outline'}
                      onClick={() => setAccessory(item)}
                    >
                      {accessory?.id === item.id ? 'Selecionado' : 'Selecionar'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {accessory && (
              <p className="text-xs text-muted-foreground">
                Acessório em edição: <span className="text-foreground">{accessory.name}</span>
              </p>
            )}
          </section>

          {accessory && (
            <>
              {/* 2. Vínculos atuais */}
              <section className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  2. Produtos compatíveis vinculados
                  <Badge variant="secondary">{links.length + reverseLinks.length}</Badge>
                  {loadingLinks && <Loader2 className="w-3 h-3 animate-spin" />}
                </h3>
                <CompatibilityLinksList
                  links={links}
                  reverseLinks={reverseLinks}
                  emptyText="Nenhum vínculo gravado para este acessório."
                  linkedIds={linkedIds}
                  reverseIds={reverseIds}
                  busyId={busyId}
                  onRemove={handleRemove}
                />
              </section>

              {/* 3. Adicionar produtos compatíveis */}
              <section className="space-y-3">
                <h3 className="text-sm font-medium">3. Vincule um produto compatível</h3>
                <div className="flex gap-2">
                  <Input
                    value={productTerm}
                    onChange={(e) => setProductTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runProductSearch()}
                    placeholder="Nome ou SKU do produto principal (somente is_accessory = false, mín. 2 letras)"
                    className="h-9"
                  />
                  <Button size="sm" onClick={runProductSearch} disabled={searchingProduct}>
                    {searchingProduct ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span className="ml-2">Buscar</span>
                  </Button>
                </div>
                {productResults.length > 0 && (
                  <ul className="divide-y divide-border/50 border border-border/50 rounded-md">
                    {productResults.map((item) => {
                      const already = linkedIds.has(item.id)
                      return (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-3 p-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="truncate">{item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              SKU {item.sku || '—'} · {item.category || 'sem categoria'}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={already || busyId === item.id}
                            onClick={() => handleAddAccessoryMode(item)}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            {already ? 'Já vinculado' : 'Vincular'}
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </>
      ) : (
        <>
          {/* 1. Escolher o produto principal */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium">1. Escolha o produto principal</h3>
            <div className="flex gap-2">
              <Input
                value={mainTerm}
                onChange={(e) => setMainTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runMainSearch()}
                placeholder="Nome ou SKU do produto principal (somente is_accessory = false, mín. 2 letras)"
                className="h-9"
              />
              <Button size="sm" onClick={runMainSearch} disabled={searchingMain}>
                {searchingMain ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span className="ml-2">Buscar</span>
              </Button>
            </div>
            {mainResults.length > 0 && (
              <ul className="divide-y divide-border/50 border border-border/50 rounded-md">
                {mainResults.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 p-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        SKU {item.sku || '—'} · {item.category || 'sem categoria'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={mainProduct?.id === item.id ? 'default' : 'outline'}
                      onClick={() => setMainProduct(item)}
                    >
                      {mainProduct?.id === item.id ? 'Selecionado' : 'Selecionar'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {mainProduct && (
              <p className="text-xs text-muted-foreground">
                Produto principal em edição:{' '}
                <span className="text-foreground">{mainProduct.name}</span>
              </p>
            )}
          </section>

          {mainProduct && (
            <>
              {/* 2. Vínculos atuais (bidirecionais) */}
              <section className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  2. Acessórios designados
                  <Badge variant="secondary">{links.length + reverseLinks.length}</Badge>
                  {loadingLinks && <Loader2 className="w-3 h-3 animate-spin" />}
                </h3>
                <CompatibilityLinksList
                  links={links}
                  reverseLinks={reverseLinks}
                  emptyText="Nenhum acessório designado para este produto principal."
                  linkedIds={linkedIds}
                  reverseIds={reverseIds}
                  busyId={busyId}
                  onRemove={handleRemove}
                />
              </section>

              {/* 3. Designar acessórios — busca livre, sem filtro is_accessory */}
              <section className="space-y-3">
                <h3 className="text-sm font-medium">3. Designe um acessório para este produto</h3>
                <div className="flex gap-2">
                  <Input
                    value={mainDesignatedTerm}
                    onChange={(e) => setMainDesignatedTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runMainDesignatedSearch()}
                    placeholder="Nome ou SKU de qualquer produto (sem filtro de acessório; mín. 2 letras)"
                    className="h-9"
                  />
                  <Button
                    size="sm"
                    onClick={runMainDesignatedSearch}
                    disabled={searchingMainDesignated}
                  >
                    {searchingMainDesignated ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span className="ml-2">Buscar</span>
                  </Button>
                </div>
                {mainDesignatedResults.length > 0 && (
                  <ul className="divide-y divide-border/50 border border-border/50 rounded-md">
                    {mainDesignatedResults.map((item) => {
                      // O vínculo designado fica no lado reverso (principal como product_id),
                      // então checar reverseIds além de linkedIds.
                      const already = linkedIds.has(item.id) || reverseIds.has(item.id)
                      return (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-3 p-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="truncate">{item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              SKU {item.sku || '—'} · {item.category || 'sem categoria'}
                              {item.is_accessory ? ' · acessório' : ' · principal'}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={already || busyId === item.id}
                            onClick={() => handleAddMainMode(item)}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            {already ? 'Já designado' : 'Designar'}
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}

/** Lista dos vínculos gravados, nos dois sentidos (como acessório e como principal). */
function CompatibilityLinksList({
  links,
  reverseLinks,
  emptyText,
  linkedIds,
  reverseIds,
  busyId,
  onRemove,
}: {
  links: CompatibilityLink[]
  reverseLinks: CompatibilityLink[]
  emptyText: string
  linkedIds: Set<string>
  reverseIds: Set<string>
  busyId: string | null
  onRemove: (link: CompatibilityLink, isReverse: boolean) => void
}) {
  if (links.length === 0 && reverseLinks.length === 0 && !busyId) {
    return <p className="text-xs text-muted-foreground">{emptyText}</p>
  }

  return (
    <ul className="divide-y divide-border/50 border border-border/50 rounded-md">
      {links.map((link) => (
        <li key={link.id} className="flex items-center justify-between gap-3 p-2 text-sm">
          <div className="min-w-0">
            <div className="truncate">{link.name}</div>
            <div className="text-xs text-muted-foreground">
              SKU {link.sku || '—'} · {link.category || 'sem categoria'} · origem {link.origem}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={busyId === link.id}
            onClick={() => onRemove(link, false)}
            title="Remover vínculo"
          >
            {busyId === link.id ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </Button>
        </li>
      ))}
      {reverseLinks
        .filter((l) => !linkedIds.has(l.productId))
        .map((link) => (
          <li key={link.id} className="flex items-center justify-between gap-3 p-2 text-sm">
            <div className="min-w-0">
              <div className="truncate">{link.name}</div>
              <div className="text-xs text-muted-foreground">
                SKU {link.sku || '—'} · {link.category || 'sem categoria'} · origem {link.origem}
                {reverseIds.has(link.productId) ? '' : ' · reverso'}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={busyId === link.id}
              onClick={() => onRemove(link, true)}
              title="Remover vínculo reverso"
            >
              {busyId === link.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          </li>
        ))}
    </ul>
  )
}
