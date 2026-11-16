import { useCallback, useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import {
  compatibilityService,
  type CatalogSearchItem,
  type CompatibilityLink,
} from '@/services/compatibilityService'

/**
 * Seção "Compatibilidade / Acessórios" do formulário de produto
 * (/products/edit/:id), posicionada abaixo de "Relacionamentos e Status".
 * Segue o MESMO padrão visual/interação da seção "Produtos Relacionados":
 * busca por nome/SKU, chips dos vínculos com badge e lista de resultados
 * clicáveis — mas grava NA HORA (não espera o "Atualizar Produto"), via
 * compatibilityService (regras já implementadas: recusa auto-vínculo,
 * recusa acessório↔acessório e principal↔principal na mesma categoria;
 * o vínculo nasce origem "manual" + status "aprovado").
 *
 * Mostra os vínculos nos DOIS sentidos:
 *  - designados a este produto (ele como principal) → chip com botão ×;
 *  - "· reverso": este produto é o acessório de outro → sem botão de
 *    remover (a remoção se faz pelo lado dono do vínculo).
 */

function origemBadge(link: CompatibilityLink) {
  if (link.origem === 'ai') {
    return (
      <span className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 px-1.5 py-0.5 rounded text-[10px] font-semibold">
        IA
      </span>
    )
  }
  return (
    <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-semibold">
      Manual
    </span>
  )
}

export function CompatibilitySection({ productId }: { productId: string }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [designados, setDesignados] = useState<CompatibilityLink[]>([])
  const [reversos, setReversos] = useState<CompatibilityLink[]>([])
  const [term, setTerm] = useState('')
  const [candidates, setCandidates] = useState<CatalogSearchItem[]>([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    try {
      const res = await compatibilityService.fetchLinks(productId)
      setDesignados(res.reverseLinks) // este produto é o principal: acessórios designados a ele
      setReversos(res.links) // este produto é o acessório de outro produto
    } catch (e: any) {
      toast({
        title: 'Erro ao carregar compatibilidades',
        description: e?.message || 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [productId, toast])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  // Busca de candidatos a acessório (mesma busca do modo "a partir do produto
  // principal": qualquer produto, exceto o próprio).
  useEffect(() => {
    const clean = term.trim()
    if (clean.length < 2) {
      setCandidates([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await compatibilityService.searchAccessoryCandidates(clean, productId)
        setCandidates(res)
      } catch {
        setCandidates([])
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [term, productId])

  const designatedIds = new Set(designados.map((l) => l.productId))

  const handleDesignate = async (candidate: CatalogSearchItem) => {
    setBusyId(candidate.id)
    try {
      await compatibilityService.addMainProductLink(productId, candidate.id)
      toast({
        title: 'Acessório designado',
        description: `"${candidate.name}" foi vinculado como acessório deste produto.`,
      })
      await recarregar()
    } catch (e: any) {
      toast({
        title: 'Não foi possível designar',
        description: e?.message || 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  const handleRemove = async (link: CompatibilityLink) => {
    setBusyId(link.id)
    try {
      await compatibilityService.removeLink(link.id)
      toast({ title: 'Vínculo removido', description: `"${link.name}" foi desvinculado.` })
      await recarregar()
    } catch (e: any) {
      toast({
        title: 'Erro ao remover vínculo',
        description: e?.message || 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4 p-5 border rounded-lg bg-muted/5">
      <h3 className="text-lg font-bold">Compatibilidade / Acessórios</h3>
      <p className="text-xs text-muted-foreground -mt-2">
        Acessórios compatíveis com este produto. Gravação imediata (não depende do botão
        &quot;Atualizar Produto&quot;).
      </p>

      <div className="border rounded-md p-3 bg-background space-y-3">
        <Input
          placeholder="Buscar acessório por nome ou SKU..."
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando vínculos...
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 p-2 bg-muted/20 rounded-md">
            {designados.length === 0 && reversos.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum acessório vinculado ainda. Busque abaixo e clique em um resultado para
                designar.
              </p>
            )}

            {designados.map((link) => (
              <div
                key={`dir-${link.id}`}
                className="flex items-center gap-1.5 text-xs py-1 px-2 rounded-full border bg-background"
              >
                <span className="font-medium max-w-[150px] truncate" title={link.name}>
                  {link.name}
                </span>
                {origemBadge(link)}
                <button
                  type="button"
                  disabled={busyId === link.id}
                  onClick={() => handleRemove(link)}
                  className="ml-1 text-muted-foreground hover:text-destructive focus:outline-none disabled:opacity-50"
                  aria-label={`Remover vínculo com ${link.name}`}
                >
                  {busyId === link.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <X className="w-3 h-3" />
                  )}
                </button>
              </div>
            ))}

            {reversos.map((link) => (
              <div
                key={`rev-${link.id}`}
                className="flex items-center gap-1.5 text-xs py-1 px-2 rounded-full border bg-muted/40"
                title="Este produto é acessório de outro — remova pelo lado dono do vínculo."
              >
                <span className="font-medium max-w-[150px] truncate" title={link.name}>
                  {link.name}
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold">· reverso</span>
                {origemBadge(link)}
              </div>
            ))}
          </div>
        )}

        {term.trim().length >= 2 && (
          <ScrollArea className="h-[150px] border rounded p-2">
            <div className="space-y-2">
              {searching ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Buscando...
                </div>
              ) : (
                <>
                  {candidates.map((prod) => {
                    const jaDesignado = designatedIds.has(prod.id)
                    return (
                      <div
                        key={prod.id}
                        className="flex items-center space-x-2"
                        onClick={() => !jaDesignado && busyId !== prod.id && handleDesignate(prod)}
                      >
                        <Checkbox
                          id={`compat-${prod.id}`}
                          checked={jaDesignado}
                          disabled={jaDesignado || busyId === prod.id}
                        />
                        <label
                          htmlFor={`compat-${prod.id}`}
                          className={`text-sm font-medium leading-none cursor-pointer ${
                            jaDesignado ? 'text-muted-foreground' : 'hover:text-primary'
                          }`}
                        >
                          {prod.name} {prod.sku ? `(${prod.sku})` : ''}
                          {jaDesignado && (
                            <span className="ml-2 text-[10px] font-semibold text-muted-foreground">
                              Já designado
                            </span>
                          )}
                        </label>
                      </div>
                    )
                  })}
                  {candidates.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum produto encontrado.
                    </p>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
