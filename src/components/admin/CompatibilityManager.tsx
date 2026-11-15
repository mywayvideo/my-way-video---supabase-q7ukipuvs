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

/**
 * Vínculo MANUAL de compatibilidade (Fase 2): o admin escolhe um acessório
 * e aponta os produtos com que ele funciona. Não há IA nem sugestão aqui.
 */
export function CompatibilityManager() {
  const [accessoryTerm, setAccessoryTerm] = useState('')
  const [accessoryResults, setAccessoryResults] = useState<CatalogSearchItem[]>([])
  const [searchingAccessory, setSearchingAccessory] = useState(false)
  const [accessory, setAccessory] = useState<CatalogSearchItem | null>(null)

  const [links, setLinks] = useState<CompatibilityLink[]>([])
  const [tableUnavailable, setTableUnavailable] = useState(false)
  const [loadingLinks, setLoadingLinks] = useState(false)

  const [productTerm, setProductTerm] = useState('')
  const [productResults, setProductResults] = useState<CatalogSearchItem[]>([])
  const [searchingProduct, setSearchingProduct] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

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

  const loadLinks = useCallback(async (accessoryId: string) => {
    setLoadingLinks(true)
    try {
      const result = await compatibilityService.fetchLinks(accessoryId)
      setLinks(result.links)
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
    if (accessory) void loadLinks(accessory.id)
    else setLinks([])
  }, [accessory, loadLinks])

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

  const handleAdd = async (product: CatalogSearchItem) => {
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

  const handleRemove = async (link: CompatibilityLink) => {
    if (!accessory) return
    setBusyId(link.id)
    try {
      await compatibilityService.removeLink(link.id)
      toast({ title: 'Vínculo removido', description: link.name })
      await loadLinks(accessory.id)
    } catch (err: any) {
      toast({ title: 'Erro ao remover', description: err?.message, variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const linkedIds = new Set(links.map((l) => l.productId))

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
              <Badge variant="secondary">{links.length}</Badge>
              {loadingLinks && <Loader2 className="w-3 h-3 animate-spin" />}
            </h3>
            {links.length === 0 && !loadingLinks ? (
              <p className="text-xs text-muted-foreground">
                Nenhum vínculo gravado para este acessório.
              </p>
            ) : (
              <ul className="divide-y divide-border/50 border border-border/50 rounded-md">
                {links.map((link) => (
                  <li key={link.id} className="flex items-center justify-between gap-3 p-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{link.name}</div>
                      <div className="text-xs text-muted-foreground">
                        SKU {link.sku || '—'} · {link.category || 'sem categoria'} · origem{' '}
                        {link.origem}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busyId === link.id}
                      onClick={() => handleRemove(link)}
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
              </ul>
            )}
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
                        onClick={() => handleAdd(item)}
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
    </div>
  )
}
