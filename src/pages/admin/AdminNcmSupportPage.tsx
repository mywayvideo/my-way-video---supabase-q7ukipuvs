import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import { AdminLayout } from '@/components/admin/AdminLayout'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  Info,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { format } from 'date-fns'

export interface NcmAlternativaItem {
  ncm: string
  quando?: string
  rgi?: string
  observacao?: string
}

export interface NcmSupportRow {
  id: string
  familia: string
  categoria: string | null
  palavras_chave: string[]
  ncm_principal: string
  ncm_alternativas: NcmAlternativaItem[]
  regra_desempate: string | null
  dicas: string | null
  alertas: string | null
  fonte: string | null
  status: 'ativa' | 'em_revisao' | 'extinta'
  created_at: string
  updated_at: string
}

interface TaxRateMatch {
  ncm: string
  ncm_descricao_full: string | null
  ncm_descricao: string | null
  ii: number | null
}

export default function AdminNcmSupportPage() {
  const { toast } = useToast()

  const [items, setItems] = useState<NcmSupportRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const itemsPerPage = 12

  // Modal formulário CRUD
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingItem, setEditingItem] = useState<NcmSupportRow | null>(null)

  // Campos do formulário
  const [formData, setFormData] = useState({
    familia: '',
    categoria: '',
    palavras_chave: '',
    ncm_principal: '',
    regra_desempate: '',
    dicas: '',
    alertas: '',
    fonte: '',
    status: 'ativa' as 'ativa' | 'em_revisao' | 'extinta',
    alternativas: [] as NcmAlternativaItem[],
  })

  // Exclusão
  const [deleteTarget, setDeleteTarget] = useState<NcmSupportRow | null>(null)

  // Autocomplete / Validação em tempo real de NCMs
  const [ncmPrincipalSearch, setNcmPrincipalSearch] = useState('')
  const [ncmPrincipalMatches, setNcmPrincipalMatches] = useState<TaxRateMatch[]>([])
  const [isSearchingNcmPrincipal, setIsSearchingNcmPrincipal] = useState(false)
  const [principalValidatedDesc, setPrincipalValidatedDesc] = useState<string | null>(null)

  // Status de execução da rotina periódica Siscomex
  const [isRunningSync, setIsRunningSync] = useState(false)
  const [syncReport, setSyncReport] = useState<any | null>(null)

  // Categorias únicas para o filtro
  const categoriesList = useMemo(() => {
    const set = new Set<string>()
    items.forEach((it) => {
      if (it.categoria) set.add(it.categoria)
    })
    return Array.from(set).sort()
  }, [items])

  const fetchItems = async () => {
    setIsLoading(true)
    try {
      let query = (supabase as any).from('ncm_support').select('*', { count: 'exact' })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      if (categoryFilter !== 'all') {
        query = query.eq('categoria', categoryFilter)
      }

      if (search.trim()) {
        const s = search.trim()
        query = query.or(
          `familia.ilike.%${s}%,ncm_principal.ilike.%${s}%,categoria.ilike.%${s}%,dicas.ilike.%${s}%`,
        )
      }

      const from = (page - 1) * itemsPerPage
      const to = from + itemsPerPage - 1

      query = query
        .range(from, to)
        .order('categoria', { ascending: true })
        .order('familia', { ascending: true })

      const { data, count, error } = await query

      if (error) {
        throw error
      }

      setItems((data as NcmSupportRow[]) || [])
      setTotalCount(count || 0)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar tabela de apoio NCM',
        description: err?.message || 'Falha ao buscar dados',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [page, search, statusFilter, categoryFilter])

  // Autocomplete do ncm_principal contra imp_sim_tax_rates
  useEffect(() => {
    const digits = ncmPrincipalSearch.replace(/\D/g, '')
    if (digits.length < 3) {
      setNcmPrincipalMatches([])
      return
    }

    const timer = setTimeout(async () => {
      setIsSearchingNcmPrincipal(true)
      try {
        const { data, error } = await (supabase.from('imp_sim_tax_rates') as any)
          .select('ncm, ncm_descricao_full, ncm_descricao, ii')
          .ilike('ncm', `${digits}%`)
          .limit(10)

        if (!error && data) {
          // Desduplicar por código de NCM
          const map = new Map<string, TaxRateMatch>()
          for (const row of data as any[]) {
            if (!map.has(row.ncm)) {
              map.set(row.ncm, row)
            }
          }
          setNcmPrincipalMatches(Array.from(map.values()))
        }
      } catch (e) {
        console.warn('Erro ao autocompletar NCM:', e)
      } finally {
        setIsSearchingNcmPrincipal(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [ncmPrincipalSearch])

  // Validar se o NCM principal atual existe na base
  const validateNcmPrincipalRealtime = async (ncm: string) => {
    const clean = ncm.replace(/\D/g, '')
    if (clean.length !== 8) {
      setPrincipalValidatedDesc(null)
      return
    }
    const { data } = await (supabase.from('imp_sim_tax_rates') as any)
      .select('ncm_descricao_full, ncm_descricao')
      .eq('ncm', clean)
      .limit(1)
      .maybeSingle()

    if (data) {
      setPrincipalValidatedDesc(data.ncm_descricao_full || data.ncm_descricao || 'NCM vigente')
    } else {
      setPrincipalValidatedDesc('⚠️ CÓDIGO NÃO LOCALIZADO NA BASE VIGENTE')
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const openCreateDialog = () => {
    setEditingItem(null)
    setFormData({
      familia: '',
      categoria: '',
      palavras_chave: '',
      ncm_principal: '',
      regra_desempate: '',
      dicas: '',
      alertas: '',
      fonte: '',
      status: 'ativa',
      alternativas: [
        {
          ncm: '85437099',
          quando: 'Enquadramento genérico residual de áudio e vídeo',
          rgi: 'RGI 1',
          observacao: 'Alternativa genérica',
        },
      ],
    })
    setNcmPrincipalSearch('')
    setNcmPrincipalMatches([])
    setPrincipalValidatedDesc(null)
    setIsDialogOpen(true)
  }

  const openEditDialog = (row: NcmSupportRow) => {
    setEditingItem(row)
    setFormData({
      familia: row.familia,
      categoria: row.categoria || '',
      palavras_chave: Array.isArray(row.palavras_chave) ? row.palavras_chave.join(', ') : '',
      ncm_principal: row.ncm_principal,
      regra_desempate: row.regra_desempate || '',
      dicas: row.dicas || '',
      alertas: row.alertas || '',
      fonte: row.fonte || '',
      status: row.status,
      alternativas: Array.isArray(row.ncm_alternativas) ? [...row.ncm_alternativas] : [],
    })
    setNcmPrincipalSearch(row.ncm_principal)
    validateNcmPrincipalRealtime(row.ncm_principal)
    setIsDialogOpen(true)
  }

  const handleAddAlternativa = () => {
    setFormData({
      ...formData,
      alternativas: [
        ...formData.alternativas,
        { ncm: '', quando: '', rgi: 'RGI 1', observacao: '' },
      ],
    })
  }

  const handleRemoveAlternativa = (index: number) => {
    const list = [...formData.alternativas]
    list.splice(index, 1)
    setFormData({ ...formData, alternativas: list })
  }

  const handleAlternativaChange = (
    index: number,
    field: keyof NcmAlternativaItem,
    value: string,
  ) => {
    const list = [...formData.alternativas]
    list[index] = { ...list[index], [field]: value }
    setFormData({ ...formData, alternativas: list })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    const cleanPrincipal = formData.ncm_principal.replace(/\D/g, '')
    if (!cleanPrincipal || cleanPrincipal.length !== 8) {
      toast({
        title: 'NCM Principal inválido',
        description: 'Informe um código NCM de 8 dígitos.',
        variant: 'destructive',
      })
      return
    }

    if (!formData.familia.trim()) {
      toast({
        title: 'Família obrigatória',
        description: 'Preencha o nome da família de equipamentos.',
        variant: 'destructive',
      })
      return
    }

    // Processar palavras-chave
    const kwArray = formData.palavras_chave
      .split(/[,;\n]/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0)

    // Limpar alternativas
    const sanitizedAlts = formData.alternativas
      .map((a) => ({
        ncm: a.ncm.replace(/\D/g, '').trim(),
        quando: (a.quando || '').trim(),
        rgi: (a.rgi || '').trim(),
        observacao: (a.observacao || '').trim(),
      }))
      .filter((a) => a.ncm.length === 8)

    setIsSubmitting(true)

    try {
      if (editingItem) {
        const { error } = await (supabase as any)
          .from('ncm_support')
          .update({
            familia: formData.familia.trim(),
            categoria: formData.categoria.trim() || null,
            palavras_chave: kwArray,
            ncm_principal: cleanPrincipal,
            ncm_alternativas: sanitizedAlts,
            regra_desempate: formData.regra_desempate.trim() || null,
            dicas: formData.dicas.trim() || null,
            alertas: formData.alertas.trim() || null,
            fonte: formData.fonte.trim() || null,
            status: formData.status,
          })
          .eq('id', editingItem.id)

        if (error) throw error

        toast({
          title: 'Família atualizada com sucesso',
          description: `Regras de "${formData.familia}" salvas na tabela de apoio.`,
        })
      } else {
        const { error } = await (supabase as any).from('ncm_support').insert([
          {
            familia: formData.familia.trim(),
            categoria: formData.categoria.trim() || null,
            palavras_chave: kwArray,
            ncm_principal: cleanPrincipal,
            ncm_alternativas: sanitizedAlts,
            regra_desempate: formData.regra_desempate.trim() || null,
            dicas: formData.dicas.trim() || null,
            alertas: formData.alertas.trim() || null,
            fonte: formData.fonte.trim() || null,
            status: formData.status,
          },
        ])

        if (error) throw error

        toast({
          title: 'Família criada com sucesso',
          description: `"${formData.familia}" adicionada à camada de conhecimento.`,
        })
      }

      setIsDialogOpen(false)
      fetchItems()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'A trigger de salvaguarda pode ter recusado o código.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    try {
      const { error } = await (supabase as any)
        .from('ncm_support')
        .delete()
        .eq('id', deleteTarget.id)
      if (error) throw error

      toast({
        title: 'Família removida',
        description: `"${deleteTarget.familia}" excluída da camada de conhecimento.`,
      })
      setDeleteTarget(null)
      fetchItems()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir',
        description: err?.message || 'Falha ao remover item',
        variant: 'destructive',
      })
    }
  }

  // Acionar rotina periódica Siscomex sob demanda
  const handleTriggerSyncVigencia = async () => {
    setIsRunningSync(true)
    setSyncReport(null)
    try {
      const { data, error } = await supabase.functions.invoke('sync-ncm-support-vigencia', {
        body: {},
      })

      if (error) throw error

      setSyncReport(data?.report || data)
      toast({
        title: 'Sincronização de vigência concluída',
        description: 'Checagem com nomenclatura oficial Siscomex finalizada com sucesso.',
      })
      fetchItems()
    } catch (err: any) {
      toast({
        title: 'Falha na checagem de vigência',
        description: err?.message || 'Erro ao invocar Edge Function',
        variant: 'destructive',
      })
    } finally {
      setIsRunningSync(false)
    }
  }

  const renderStatusBadge = (status: 'ativa' | 'em_revisao' | 'extinta') => {
    switch (status) {
      case 'ativa':
        return (
          <Badge className="bg-emerald-600/90 hover:bg-emerald-600 text-white border-0 font-medium text-xs flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Ativa
          </Badge>
        )
      case 'em_revisao':
        return (
          <Badge className="bg-amber-600/90 hover:bg-amber-600 text-white border-0 font-medium text-xs flex items-center gap-1">
            <Clock className="w-3 h-3" /> Em Revisão
          </Badge>
        )
      case 'extinta':
        return (
          <Badge className="bg-rose-600/90 hover:bg-rose-600 text-white border-0 font-medium text-xs flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Extinta
          </Badge>
        )
    }
  }

  const formatNcm = (val: string) => {
    const d = val.replace(/\D/g, '')
    if (d.length === 8) {
      return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`
    }
    return val
  }

  return (
    <AdminLayout breadcrumb="Tabela de Apoio NCM">
      <div className="flex flex-col space-y-6 animate-fade-in">
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3 text-foreground">
              <div className="bg-primary/10 p-2 rounded-lg text-primary">
                <BookOpen className="w-6 h-6" />
              </div>
              Tabela de Apoio de Classificação NCM (ncm_support)
            </h1>
            <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
              Camada de conhecimento de domínio consultável pelo agente de IA (classify-ncm) e
              editável diretamente pelo painel sem deploy. Princípios genéricos para os Capítulos
              84, 85 e 90.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTriggerSyncVigencia}
              disabled={isRunningSync}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRunningSync ? 'animate-spin' : ''}`} />
              {isRunningSync ? 'Checando Siscomex...' : 'Verificar Vigência Siscomex'}
            </Button>
            <Button onClick={openCreateDialog} size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> Nova Família
            </Button>
          </div>
        </div>

        {/* Relatório de última sincronização Siscomex se houver */}
        {syncReport && (
          <div className="p-4 rounded-lg border bg-muted/40 text-xs space-y-2">
            <div className="flex items-center justify-between font-semibold">
              <span className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Relatório da Verificação de Vigência Siscomex
              </span>
              <span className="text-muted-foreground">{syncReport.timestamp}</span>
            </div>
            <p>
              <strong>Status do download Siscomex:</strong> {syncReport.siscomex_download_status}
            </p>
            <p>
              <strong>Famílias ativas avaliadas:</strong> {syncReport.active_rows_checked}
            </p>
            {syncReport.ncms_marked_em_revisao?.length > 0 && (
              <div className="text-rose-600 dark:text-rose-400">
                <strong>
                  Códigos marcados em revisão ({syncReport.ncms_marked_em_revisao.length}):
                </strong>
                <ul className="list-disc pl-5 mt-1">
                  {syncReport.ncms_marked_em_revisao.map((x: any, i: number) => (
                    <li key={i}>
                      {x.familia} (NCM {x.ncm})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {syncReport.expired_ex_alerts?.length > 0 && (
              <div className="text-amber-600 dark:text-amber-400">
                <strong>
                  Ex-Tarifários expirados detectados ({syncReport.expired_ex_alerts.length}):
                </strong>
                <ul className="list-disc pl-5 mt-1">
                  {syncReport.expired_ex_alerts.map((x: any, i: number) => (
                    <li key={i}>
                      {x.familia} (NCM {x.ncm} Ex {x.ex} - Fim: {x.data_fim})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {syncReport.frequent_corrections_candidates?.length > 0 && (
              <div className="text-muted-foreground">
                <strong>Padrões de divergência nos logs (candidatos a nova regra):</strong>
                <ul className="list-disc pl-5 mt-1">
                  {syncReport.frequent_corrections_candidates.map((x: any, i: number) => (
                    <li key={i}>
                      {x.ncm} ({x.count} ocorrências) - Amostra: {x.sample_descriptions.join('; ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Filtros e Busca */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card p-4 rounded-lg border border-border/50">
          <form
            onSubmit={handleSearch}
            className="flex flex-1 items-center gap-2 w-full sm:max-w-md"
          >
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar por família, NCM, categoria, palavras-chave..."
                className="pl-8"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">
              Buscar
            </Button>
          </form>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-36">
              <Select
                value={statusFilter}
                onValueChange={(val) => {
                  setStatusFilter(val)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="em_revisao">Em Revisão</SelectItem>
                  <SelectItem value="extinta">Extinta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-48">
              <Select
                value={categoryFilter}
                onValueChange={(val) => {
                  setCategoryFilter(val)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Categorias</SelectItem>
                  {categoriesList.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Tabela de Dados */}
        <div className="border border-border/50 rounded-md bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-60">Família / Categoria</TableHead>
                <TableHead className="w-32">NCM Principal</TableHead>
                <TableHead>Alternativas ({'<ncm, rgi>'})</TableHead>
                <TableHead>Regra de Desempate & Dicas</TableHead>
                <TableHead className="w-28 text-center">Status</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    <span className="text-xs text-muted-foreground mt-2 block">
                      Carregando famílias da tabela de apoio...
                    </span>
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-12 text-muted-foreground text-sm"
                  >
                    Nenhuma família encontrada com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="align-top">
                      <div className="font-semibold text-foreground text-sm">{row.familia}</div>
                      {row.categoria && (
                        <span className="text-xs text-muted-foreground block mt-0.5">
                          {row.categoria}
                        </span>
                      )}
                      {Array.isArray(row.palavras_chave) && row.palavras_chave.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {row.palavras_chave.slice(0, 5).map((kw, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground"
                            >
                              {kw}
                            </span>
                          ))}
                          {row.palavras_chave.length > 5 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{row.palavras_chave.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="align-top font-mono font-bold text-primary">
                      {formatNcm(row.ncm_principal)}
                      {row.alertas && (
                        <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-sans">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span className="line-clamp-2">{row.alertas}</span>
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="align-top text-xs">
                      {Array.isArray(row.ncm_alternativas) && row.ncm_alternativas.length > 0 ? (
                        <div className="space-y-1">
                          {row.ncm_alternativas.map((alt, idx) => (
                            <div key={idx} className="flex items-start gap-1">
                              <span className="font-mono font-semibold text-foreground">
                                {formatNcm(alt.ncm)}
                              </span>
                              {alt.rgi && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                                  {alt.rgi}
                                </Badge>
                              )}
                              <span className="text-[11px] text-muted-foreground line-clamp-1">
                                — {alt.quando || alt.observacao || ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="align-top text-xs text-muted-foreground max-w-md">
                      {row.regra_desempate && (
                        <div className="font-medium text-foreground line-clamp-2">
                          {row.regra_desempate}
                        </div>
                      )}
                      {row.dicas && (
                        <div className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
                          💡 {row.dicas}
                        </div>
                      )}
                      {row.fonte && (
                        <div className="text-[10px] text-muted-foreground/80 mt-1 italic">
                          Fonte: {row.fonte}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="align-top text-center">
                      {renderStatusBadge(row.status)}
                    </TableCell>

                    <TableCell className="align-top text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(row)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginação */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Mostrando {(page - 1) * itemsPerPage + 1} até{' '}
              {Math.min(page * itemsPerPage, totalCount)} de {totalCount} famílias cadastradas
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page * itemsPerPage >= totalCount || isLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialog de Criação / Edição */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
            <DialogHeader className="p-5 border-b bg-muted/20 shrink-0">
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                {editingItem ? 'Editar Família de Apoio NCM' : 'Nova Família de Apoio NCM'}
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="familia">Nome da Família *</Label>
                  <Input
                    id="familia"
                    value={formData.familia}
                    onChange={(e) => setFormData({ ...formData, familia: e.target.value })}
                    placeholder="ex.: Câmeras de vídeo/cinema/broadcast"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="categoria">Categoria / Seção</Label>
                  <Input
                    id="categoria"
                    value={formData.categoria}
                    onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                    placeholder="ex.: Captura de imagem (Seção A)"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="palavras_chave">Palavras-chave (separadas por vírgula)</Label>
                <Input
                  id="palavras_chave"
                  value={formData.palavras_chave}
                  onChange={(e) => setFormData({ ...formData, palavras_chave: e.target.value })}
                  placeholder="ex.: câmera, camcorder, PTZ, cinema, broadcast, sensor"
                />
              </div>

              {/* NCM Principal com validação em tempo real */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-muted/30 rounded-lg border">
                <div className="md:col-span-2 space-y-1.5 relative">
                  <Label htmlFor="ncm_principal" className="flex items-center gap-1.5 font-bold">
                    <span>NCM Principal Vigente *</span>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      Validado em tempo real com imp_sim_tax_rates
                    </Badge>
                  </Label>
                  <Input
                    id="ncm_principal"
                    value={formData.ncm_principal}
                    onChange={(e) => {
                      const val = e.target.value
                      setFormData({ ...formData, ncm_principal: val })
                      setNcmPrincipalSearch(val)
                      validateNcmPrincipalRealtime(val)
                    }}
                    placeholder="ex.: 85258929"
                    required
                  />

                  {/* Descrição validada */}
                  {principalValidatedDesc && (
                    <p
                      className={`text-[11px] mt-1 ${
                        principalValidatedDesc.includes('⚠️')
                          ? 'text-rose-600 font-bold'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {principalValidatedDesc}
                    </p>
                  )}

                  {/* Dropdown de sugestão de autocompletar */}
                  {ncmPrincipalMatches.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {ncmPrincipalMatches.map((m) => (
                        <div
                          key={m.ncm}
                          className="p-2 hover:bg-muted cursor-pointer text-xs flex flex-col border-b last:border-b-0"
                          onClick={() => {
                            setFormData({ ...formData, ncm_principal: m.ncm })
                            setNcmPrincipalSearch(m.ncm)
                            setPrincipalValidatedDesc(m.ncm_descricao_full || m.ncm_descricao)
                            setNcmPrincipalMatches([])
                          }}
                        >
                          <div className="font-mono font-bold text-primary flex items-center justify-between">
                            <span>{formatNcm(m.ncm)}</span>
                            {m.ii !== null && <span>II: {m.ii}%</span>}
                          </div>
                          <span className="text-muted-foreground text-[11px] line-clamp-1">
                            {m.ncm_descricao_full || m.ncm_descricao}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(val: any) => setFormData({ ...formData, status: val })}
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativa">Ativa</SelectItem>
                      <SelectItem value="em_revisao">Em Revisão</SelectItem>
                      <SelectItem value="extinta">Extinta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Editor de NCMs Alternativos (jsonb amigável) */}
              <div className="space-y-2 border rounded-lg p-3 bg-card">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-bold text-sm">NCMs Alternativos e Condições</Label>
                    <p className="text-xs text-muted-foreground">
                      Subposições alternativas com critério de enquadramento (RGI) e condições.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddAlternativa}
                    className="h-7 text-xs gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Alternativa
                  </Button>
                </div>

                {formData.alternativas.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">
                    Nenhuma alternativa cadastrada. Recomenda-se manter 85437099 como residual para
                    áudio e vídeo.
                  </p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {formData.alternativas.map((alt, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-12 gap-2 p-2 rounded bg-muted/40 border items-center text-xs"
                      >
                        <div className="col-span-12 sm:col-span-3">
                          <Label className="text-[10px] text-muted-foreground">
                            NCM (8 dígitos)
                          </Label>
                          <Input
                            value={alt.ncm}
                            onChange={(e) => handleAlternativaChange(idx, 'ncm', e.target.value)}
                            placeholder="ex.: 85437099"
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div className="col-span-12 sm:col-span-2">
                          <Label className="text-[10px] text-muted-foreground">RGI</Label>
                          <Input
                            value={alt.rgi || ''}
                            onChange={(e) => handleAlternativaChange(idx, 'rgi', e.target.value)}
                            placeholder="RGI 1 / 6"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="col-span-11 sm:col-span-6">
                          <Label className="text-[10px] text-muted-foreground">
                            Quando usar / Condição
                          </Label>
                          <Input
                            value={alt.quando || ''}
                            onChange={(e) => handleAlternativaChange(idx, 'quando', e.target.value)}
                            placeholder="Critério técnico para acionar esta alternativa"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="col-span-1 text-right flex items-end justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemoveAlternativa(idx)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Regra de Desempate */}
              <div className="space-y-1.5">
                <Label htmlFor="regra_desempate">Regra de Desempate Vinculante</Label>
                <Textarea
                  id="regra_desempate"
                  rows={2}
                  value={formData.regra_desempate}
                  onChange={(e) => setFormData({ ...formData, regra_desempate: e.target.value })}
                  placeholder="ex.: 3+ captadores → 85258921; 1–2 → 85258929"
                />
              </div>

              {/* Dicas e Alertas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="dicas">Dicas Técnicas para o Agente</Label>
                  <Textarea
                    id="dicas"
                    rows={2}
                    value={formData.dicas}
                    onChange={(e) => setFormData({ ...formData, dicas: e.target.value })}
                    placeholder="ex.: Verificar número de sensores CCD/CMOS na ficha do fabricante"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="alertas">Alertas Críticos / Vetos</Label>
                  <Textarea
                    id="alertas"
                    rows={2}
                    value={formData.alertas}
                    onChange={(e) => setFormData({ ...formData, alertas: e.target.value })}
                    placeholder="ex.: 85258090 EXTINTO — não usar sob hipótese alguma"
                  />
                </div>
              </div>

              {/* Fonte */}
              <div className="space-y-1.5">
                <Label htmlFor="fonte">Fonte / Solução de Consulta / Resolução</Label>
                <Input
                  id="fonte"
                  value={formData.fonte}
                  onChange={(e) => setFormData({ ...formData, fonte: e.target.value })}
                  placeholder="ex.: Solução de Consulta Cosit nº XX/2023 / NESH Mercosul 2022"
                />
              </div>
            </div>

            <DialogFooter className="p-4 border-t bg-muted/20 shrink-0 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting} className="gap-2">
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Salvando...
                  </>
                ) : (
                  'Salvar Família'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de Exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Família da Tabela de Apoio?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza de que deseja remover a família{' '}
              <strong className="text-foreground">{deleteTarget?.familia}</strong>? Esta ação
              removerá as regras e alternativas associadas da camada de conhecimento do agente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  )
}
