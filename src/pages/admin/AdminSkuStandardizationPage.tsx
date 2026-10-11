import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  ArrowRight,
  ExternalLink,
  Layers,
  HelpCircle,
  ShieldAlert,
  SlidersHorizontal,
  Calendar,
  DollarSign,
  Tag,
  Eye,
  Check,
  X,
  Sparkles,
  Download,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import {
  skuStandardizationService,
  SkuDiagnosisResult,
  SkuCollisionGroup,
  BackfillPlanPreview,
  BackfillExecutionReport,
  DeletedLoserSummaryItem,
} from '@/services/skuStandardizationService'
import { formatUSD } from '@/lib/utils'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import { Progress } from '@/components/ui/progress'

export default function AdminSkuStandardizationPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SkuDiagnosisResult | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterDashOnly, setFilterDashOnly] = useState(false)
  const [activeTab, setActiveTab] = useState<
    'overview' | 'sony-collisions' | 'other-collisions' | 'sony-dash-list' | 'round2-report'
  >('overview')

  // Estado para modal de decisão de colisão
  const [selectedCollision, setSelectedCollision] = useState<SkuCollisionGroup | null>(null)
  const [selectedPreferredId, setSelectedPreferredId] = useState<string | null>(null)
  const [decisionType, setDecisionType] = useState<
    'keep_preferred' | 'distinct_products' | 'merge_pending' | 'undecided'
  >('keep_preferred')
  const [decisionNotes, setDecisionNotes] = useState('')
  const [savingDecision, setSavingDecision] = useState(false)

  // Estado da Rodada 2 (Execução e Preview de Backfill)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [backfillPreview, setBackfillPreview] = useState<BackfillPlanPreview | null>(null)
  const [executingBackfill, setExecutingBackfill] = useState(false)
  const [executionProgress, setExecutionProgress] = useState<{
    stage: string
    current: number
    total: number
  }>({
    stage: '',
    current: 0,
    total: 100,
  })
  const [executionReport, setExecutionReport] = useState<BackfillExecutionReport | null>(null)
  const [confirmCheckbox, setConfirmCheckbox] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const result = await skuStandardizationService.runDryRunDiagnosis()
      setData(result)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar diagnóstico de SKUs',
        description: err.message || 'Falha de comunicação.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Carrega a prévia da Rodada 2 e abre o modal de confirmação
  const handleOpenRound2Preview = async () => {
    setLoadingPreview(true)
    setConfirmCheckbox(false)
    try {
      const preview = await skuStandardizationService.getBackfillPreview()
      setBackfillPreview(preview)
      setPreviewModalOpen(true)
      if (!preview.canExecute && preview.missingTableError) {
        toast({
          title: 'Tabela de apoio ausente',
          description: preview.missingTableError,
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao gerar prévia da Rodada 2',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoadingPreview(false)
    }
  }

  // Executa a Rodada 2
  const handleExecuteRound2 = async () => {
    if (!backfillPreview?.canExecute) return
    setExecutingBackfill(true)
    try {
      const report = await skuStandardizationService.executeRound2Backfill((p) => {
        setExecutionProgress(p)
      })

      setExecutionReport(report)
      setPreviewModalOpen(false)
      setActiveTab('round2-report')

      toast({
        title: 'Rodada 2 executada com sucesso!',
        description: `${report.totalSonyRenamed} SKUs renomeados e ${report.totalLosersDeleted} produtos deletados (dados mesclados no prevalente).`,
      })

      // Recarrega diagnóstico para refletir estado novo
      await loadData()
    } catch (err: any) {
      toast({
        title: 'Erro durante a execução da Rodada 2',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setExecutingBackfill(false)
    }
  }

  // Funções de exportação do resumo (JSON e CSV)
  const handleExportJson = () => {
    if (!executionReport) return
    const blob = new Blob([JSON.stringify(executionReport, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-rodada2-sony-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleExportCsv = () => {
    if (!executionReport || !executionReport.deletedLosersSummary.length) return

    // Gerar linhas CSV detalhadas por verificação de preço
    const headers = [
      'Produto Deletado ID',
      'SKU Deletado',
      'Nome Deletado',
      'Prevalente ID',
      'SKU Prevalente',
      'Nome Prevalente',
      'PriceCheck ID',
      'Data Verificação',
      'Status Verificação',
      'Preço DB (USD)',
      'Preço B&H (USD)',
      'Mensagem B&H',
      'Status Deleção',
    ]

    const rows: string[][] = []

    for (const item of executionReport.deletedLosersSummary) {
      if (item.priceChecks.length === 0) {
        rows.push([
          item.deletedProductId,
          item.deletedSku || '',
          `"${(item.deletedName || '').replace(/"/g, '""')}"`,
          item.preferredProductId,
          item.preferredSku || '',
          `"${(item.preferredName || '').replace(/"/g, '""')}"`,
          'SEM_REGISTRO',
          '',
          '',
          '',
          '',
          '',
          item.deleteError ? `ERRO: ${item.deleteError}` : 'DELETADO_OK',
        ])
      } else {
        for (const pc of item.priceChecks) {
          rows.push([
            item.deletedProductId,
            item.deletedSku || '',
            `"${(item.deletedName || '').replace(/"/g, '""')}"`,
            item.preferredProductId,
            item.preferredSku || '',
            `"${(item.preferredName || '').replace(/"/g, '""')}"`,
            pc.id,
            pc.checked_at,
            pc.status,
            pc.price_db != null ? String(pc.price_db) : '',
            pc.price_bh != null ? String(pc.price_bh) : '',
            `"${(pc.message || '').replace(/"/g, '""')}"`,
            item.deleteError ? `ERRO: ${item.deleteError}` : 'DELETADO_OK',
          ])
        }
      }
    }

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `price-checks-deletados-rodada2-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleOpenDecisionModal = (collision: SkuCollisionGroup) => {
    setSelectedCollision(collision)
    setSelectedPreferredId(
      collision.decision?.preferred_product_id ||
        collision.suggestedPreferredId ||
        collision.products[0]?.id ||
        null,
    )
    setDecisionType(collision.decision?.decision_type || 'keep_preferred')
    setDecisionNotes(collision.decision?.notes || '')
  }

  const handleSaveDecision = async () => {
    if (!selectedCollision) return
    setSavingDecision(true)

    try {
      const secondaryIds = selectedCollision.products
        .map((p) => p.id)
        .filter((id) => id !== selectedPreferredId)

      await skuStandardizationService.saveCollisionDecision({
        normalizedSku: selectedCollision.normalizedSku,
        brand: selectedCollision.brand,
        isSony: selectedCollision.isSony,
        preferredProductId: selectedPreferredId,
        secondaryProductIds: secondaryIds,
        decisionType,
        notes: decisionNotes,
      })

      toast({
        title: 'Decisão registrada com sucesso',
        description:
          'Gravada na tabela sku_collision_decisions. Tabela products permanece intacta.',
      })

      // Atualiza o estado local imediatamente
      if (data) {
        const updateCollisionList = (list: SkuCollisionGroup[]) =>
          list.map((c) => {
            if (
              c.normalizedSku === selectedCollision.normalizedSku &&
              c.brand === selectedCollision.brand
            ) {
              return {
                ...c,
                decision: {
                  decision_type: decisionType,
                  preferred_product_id: selectedPreferredId,
                  notes: decisionNotes,
                  decided_at: new Date().toISOString(),
                },
              }
            }
            return c
          })

        setData({
          ...data,
          sonyCollisions: updateCollisionList(data.sonyCollisions),
          otherCollisions: updateCollisionList(data.otherCollisions),
          crossBrandCollisions: updateCollisionList(data.crossBrandCollisions),
        })
      }

      setSelectedCollision(null)
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar decisão',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSavingDecision(false)
    }
  }

  const stats = data?.stats

  // Filtragem da lista de SKUs Sony com traço
  const filteredSonyDashList = (data?.sonyDashProducts || []).filter((p) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      (p.name && p.name.toLowerCase().includes(term)) ||
      p.normalizedSku.toLowerCase().includes(term)
    )
  })

  // Filtragem de colisões Sony
  const filteredSonyCollisions = (data?.sonyCollisions || []).filter((c) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      c.normalizedSku.toLowerCase().includes(term) ||
      c.products.some(
        (p) => (p.sku && p.sku.toLowerCase().includes(term)) || p.name.toLowerCase().includes(term),
      )
    )
  })

  // Filtragem de colisões outras marcas
  const filteredOtherCollisions = (data?.otherCollisions || []).filter((c) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      c.normalizedSku.toLowerCase().includes(term) ||
      c.brand.toLowerCase().includes(term) ||
      c.products.some(
        (p) => (p.sku && p.sku.toLowerCase().includes(term)) || p.name.toLowerCase().includes(term),
      )
    )
  })

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              Padronização de SKU Sony — Diagnóstico Dry-Run
            </h1>
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-amber-400 font-mono text-xs"
            >
              Rodada 1: Modo Dry-Run (Somente Leitura)
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Análise estrutural da base de produtos: detecção de traços em SKUs Sony, chaves
            normalizadas e colisão de duplicidades entre cadastros.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleOpenRound2Preview}
            disabled={loading || executingBackfill || loadingPreview}
            className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md"
          >
            {loadingPreview ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Executar Rodada 2 (Backfill)
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading || executingBackfill}
            className="h-9"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Recarregar Análise
          </Button>

          <Button variant="secondary" size="sm" asChild className="h-9">
            <Link to="/admin/catalog">
              <ArrowRight className="w-4 h-4 mr-2" />
              Voltar ao Catálogo
            </Link>
          </Button>
        </div>
      </div>

      {/* Regra vinculante e alerta visual */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="pt-4 pb-4 text-xs text-blue-300 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-blue-200">
              Salvaguarda da Rodada 1: NENHUM dado do catálogo (products) é alterado nesta etapa.
            </p>
            <p className="text-muted-foreground">
              A padronização física Sony (remover traços) ocorrerá apenas na{' '}
              <strong>Rodada 2</strong> após sua conferência e aprovação. Todas as decisões de
              prevalência marcadas abaixo são salvas exclusivamente numa tabela de apoio leve (
              <code>sku_collision_decisions</code>).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Métricas Principais */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-medium">
                Produtos Sony
              </CardDescription>
              <CardTitle className="text-2xl font-bold flex items-baseline justify-between">
                <span>{stats.sony.total}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  de {stats.totalProducts} produtos
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs space-y-1">
              <div className="flex justify-between items-center text-amber-400 font-medium">
                <span>Com traço (-) no SKU:</span>
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-amber-400"
                >
                  {stats.sony.withDash}
                </Badge>
              </div>
              <div className="flex justify-between items-center text-emerald-400">
                <span>Sem traço (padrão):</span>
                <span>{stats.sony.withoutDash}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Já idêntico à chave normalizada:</span>
                <span>{stats.sony.alreadyIdenticalAfterNorm}</span>
              </div>
              {stats.sony.noSku > 0 && (
                <div className="flex justify-between items-center text-rose-400">
                  <span>Sem SKU preenchido:</span>
                  <span>{stats.sony.noSku}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-medium">
                Colisões Sony (Duplicidades)
              </CardDescription>
              <CardTitle className="text-2xl font-bold flex items-baseline justify-between">
                <span
                  className={stats.collisions.sonyCount > 0 ? 'text-amber-400' : 'text-emerald-400'}
                >
                  {stats.collisions.sonyCount}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {stats.collisions.sonyCount === 1
                    ? '1 grupo par'
                    : `${stats.collisions.sonyCount} grupos pares`}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs space-y-1 text-muted-foreground">
              <p>
                {stats.collisions.sonyCount > 0
                  ? 'Existem pares com e sem traço coexistindo como cadastros distintos (ex: BRU-SF10 e BRUSF10).'
                  : 'Nenhuma colisão detectada dentro da marca Sony.'}
              </p>
              <div className="pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                  onClick={() => setActiveTab('sony-collisions')}
                >
                  Ver Colisões Sony ({stats.collisions.sonyCount})
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-medium">
                Outras Marcas
              </CardDescription>
              <CardTitle className="text-2xl font-bold flex items-baseline justify-between">
                <span>{stats.otherBrands.total}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  não serão alteradas fisicamente
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs space-y-1">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Com traço (-) no SKU:</span>
                <span>{stats.otherBrands.withDash}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Sem traço:</span>
                <span>{stats.otherBrands.withoutDash}</span>
              </div>
              {stats.otherBrands.noSku > 0 && (
                <div className="flex justify-between items-center text-rose-400">
                  <span>Sem SKU:</span>
                  <span>{stats.otherBrands.noSku}</span>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground pt-1">
                Nota: preservam o SKU original, usando normalização apenas para busca e prevenção de
                duplicata.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-medium">
                Colisões em Outras Marcas
              </CardDescription>
              <CardTitle className="text-2xl font-bold flex items-baseline justify-between">
                <span>
                  {stats.collisions.otherBrandsSameBrandCount + stats.collisions.crossBrandCount}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  diagnóstico preventivo
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs space-y-1">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Mesma marca (não Sony):</span>
                <span>{stats.collisions.otherBrandsSameBrandCount}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Entre marcas diferentes:</span>
                <span>{stats.collisions.crossBrandCount}</span>
              </div>
              <div className="pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs border-border/50"
                  onClick={() => setActiveTab('other-collisions')}
                >
                  Ver Diagnóstico de Outras Marcas
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs Principais */}
      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/50 pb-2">
          <TabsList className="bg-muted/40">
            <TabsTrigger value="overview" className="text-xs">
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="sony-collisions" className="text-xs relative">
              Colisões Sony
              {data && data.sonyCollisions.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1.5 px-1.5 py-0 text-[10px] bg-amber-500/20 text-amber-300 border-amber-500/30"
                >
                  {data.sonyCollisions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sony-dash-list" className="text-xs">
              SKUs Sony com Traço ({stats?.sony.withDash || 0})
            </TabsTrigger>
            <TabsTrigger value="other-collisions" className="text-xs">
              Colisões Outras Marcas (
              {stats
                ? stats.collisions.otherBrandsSameBrandCount + stats.collisions.crossBrandCount
                : 0}
              )
            </TabsTrigger>
            {executionReport && (
              <TabsTrigger
                value="round2-report"
                className="text-xs relative text-emerald-400 font-semibold"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Relatório Rodada 2
              </TabsTrigger>
            )}
          </TabsList>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filtrar por SKU ou nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-8 text-xs bg-background/50 border-border/50"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* TAB 1: VISÃO GERAL */}
        <TabsContent value="overview" className="space-y-4">
          {/* Card de CTA para Rodada 2 */}
          <Card className="border-primary/40 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
            <CardContent className="pt-6 pb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground font-semibold text-xs">
                    Rodada 2 Disponível
                  </Badge>
                  <span className="text-sm font-semibold text-foreground">
                    Execução do Backfill e Mesclagem Sony
                  </span>
                </div>
                <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                  Aplica a Opção B (exclusão definitiva): normaliza SKUs Sony removendo traços
                  físicos, mescla URLs da B&amp;H, imagens e NCM no produto prevalente, arquiva
                  histórico de price_checks e realiza a exclusão definitiva dos produtos perdedores
                  de
                  <code>public.products</code>.
                </p>
              </div>
              <Button
                size="default"
                onClick={handleOpenRound2Preview}
                disabled={loading || executingBackfill || loadingPreview}
                className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 shadow-lg"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Abrir Painel de Execução Rodada 2
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card/40 border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Resumo Executivo do Diagnóstico (Rodada 1 &amp; Rodada 2)
              </CardTitle>
              <CardDescription className="text-xs">
                Visão consolidada da conformidade de SKUs e recomendações para as próximas rodadas
                do plano.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/20 border border-border/40 space-y-2">
                  <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Padrão Estabelecido para a Sony
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    A Sony comercialmente e em tabelas de preços utiliza SKUs compactos sem hífen
                    (ex.: <code>BRUSF10</code>, <code>ILMEFX2</code>). Contudo, raspagens de
                    revendedores como a B&H costumam inserir hífens (<code>BRU-SF10</code>,{' '}
                    <code>ILME-FX2</code>).
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>Decisão de padronização:</strong> todo SKU Sony será fisicamente
                    normalizado para o formato sem traço, e todas as 3 entradas (cadastro
                    individual, CSV e B&H) passarão a respeitar a chave normalizada.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-muted/20 border border-border/40 space-y-2">
                  <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    Situação Atual das Colisões
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Identificamos{' '}
                    <strong>{data?.sonyCollisions.length || 0} grupo(s) de colisão</strong> dentro
                    da marca Sony. Em caso de colisão, dois cadastros distintos disputam a mesma
                    chave normalizada.
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Na aba <strong>&ldquo;Colisões Sony&rdquo;</strong>, você pode revisar cada par
                    lado a lado e decidir qual cadastro prevalece (com preço FOB mais atualizado,
                    status ativo, etc.) antes da execução do backfill na Rodada 2.
                  </p>
                </div>
              </div>

              {/* Tabela de Amostras Lado a Lado */}
              <div className="pt-2">
                <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Amostra Comparativa de SKUs Sony na Base
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-border/50 rounded-lg p-3 bg-card/60">
                    <span className="text-xs font-semibold text-amber-400 block mb-2">
                      Exemplos de SKUs Sony com Traço (a serem padronizados na Rodada 2)
                    </span>
                    <ul className="text-xs space-y-1.5 font-mono">
                      {(stats?.sony.sampleWithDash || []).slice(0, 6).map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between py-0.5 border-b border-border/20 last:border-0"
                        >
                          <span className="text-foreground">{item.sku}</span>
                          <span
                            className="text-muted-foreground font-sans truncate max-w-[200px]"
                            title={item.name}
                          >
                            {item.name}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="border border-border/50 rounded-lg p-3 bg-card/60">
                    <span className="text-xs font-semibold text-emerald-400 block mb-2">
                      Exemplos de SKUs Sony Já Sem Traço (Conformes)
                    </span>
                    <ul className="text-xs space-y-1.5 font-mono">
                      {(stats?.sony.sampleWithoutDash || []).slice(0, 6).map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between py-0.5 border-b border-border/20 last:border-0"
                        >
                          <span className="text-foreground">{item.sku}</span>
                          <span
                            className="text-muted-foreground font-sans truncate max-w-[200px]"
                            title={item.name}
                          >
                            {item.name}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: COLISÕES SONY */}
        <TabsContent value="sony-collisions" className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Pares de Produtos Sony com Colisão de Chave ({filteredSonyCollisions.length})
              </h3>
              <p className="text-xs text-muted-foreground">
                Cadastros cujo SKU normalizado (maiúsculas, sem traço e sem espaços) é idêntico.
                Decida qual produto prevalece para a desativação e mesclagem da Rodada 2.
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleOpenRound2Preview}
              disabled={loading || executingBackfill || loadingPreview}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Executar Rodada 2
            </Button>
          </div>

          {filteredSonyCollisions.length === 0 ? (
            <Card className="border-border/50 bg-card/30 p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">
                Nenhuma colisão encontrada na marca Sony
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Todos os SKUs Sony mapeados possuem chave normalizada única ou os filtros aplicados
                não retornaram resultados.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredSonyCollisions.map((group, gIdx) => {
                const dec = group.decision
                const isDecided = dec && dec.decision_type !== 'undecided'

                return (
                  <Card
                    key={`${group.normalizedSku}_${gIdx}`}
                    className="border-border/60 bg-card/50 overflow-hidden"
                  >
                    <CardHeader className="bg-muted/20 py-3 px-4 border-b border-border/40 flex flex-row items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className="font-mono text-xs border-amber-500/40 bg-amber-500/10 text-amber-300"
                        >
                          Chave: {group.normalizedSku}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {group.products.length} cadastros coexistindo
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isDecided ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            Decisão:{' '}
                            {dec.decision_type === 'keep_preferred'
                              ? 'Prevalência Definida'
                              : dec.decision_type}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-yellow-500/30 bg-yellow-500/10 text-yellow-300 text-xs"
                          >
                            Pendente de Decisão
                          </Badge>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenDecisionModal(group)}
                          className="h-7 text-xs"
                        >
                          {isDecided ? 'Editar Decisão' : 'Definir Prevalência'}
                        </Button>
                      </div>
                    </CardHeader>

                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent text-xs">
                            <TableHead className="w-12">Foto</TableHead>
                            <TableHead>SKU Original</TableHead>
                            <TableHead>Nome do Produto</TableHead>
                            <TableHead>Preço USD</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Última Revisão</TableHead>
                            <TableHead>Criado em</TableHead>
                            <TableHead className="text-right">Indicação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.products.map((p) => {
                            const isPreferred =
                              dec?.preferred_product_id === p.id ||
                              (!dec && group.suggestedPreferredId === p.id)

                            return (
                              <TableRow key={p.id} className={isPreferred ? 'bg-primary/5' : ''}>
                                <TableCell>
                                  <div className="w-8 h-8 rounded bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center">
                                    {p.image_url ? (
                                      <ImageWithFallback
                                        src={p.image_url}
                                        alt={p.name}
                                        className="w-full h-full object-contain"
                                      />
                                    ) : (
                                      <span className="text-[9px] text-muted-foreground">-</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-xs font-semibold">
                                  {p.sku}
                                  {p.hasDash && (
                                    <Badge
                                      variant="outline"
                                      className="ml-2 text-[10px] px-1 py-0 border-amber-500/30 text-amber-400"
                                    >
                                      com traço
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell
                                  className="text-xs max-w-[280px] truncate"
                                  title={p.name}
                                >
                                  {p.name}
                                  <div className="text-[10px] text-muted-foreground font-mono">
                                    ID: {p.id}
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs font-medium">
                                  {p.price_usd != null ? formatUSD(p.price_usd) : '-'}
                                </TableCell>
                                <TableCell>
                                  {p.is_discontinued ? (
                                    <Badge variant="destructive" className="text-[10px] uppercase">
                                      Descontinuado
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="border-green-500/30 bg-green-500/10 text-green-400 text-[10px] uppercase"
                                    >
                                      Ativo
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {p.last_reviewed_at
                                    ? new Date(p.last_reviewed_at).toLocaleDateString()
                                    : '-'}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {p.created_at ? new Date(p.created_at).toLocaleDateString() : '-'}
                                </TableCell>
                                <TableCell className="text-right">
                                  {isPreferred ? (
                                    <Badge className="bg-primary/20 text-primary border-primary/40 text-[11px]">
                                      {dec ? 'Preferido Marcado' : 'Sugerido'}
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      Secundário
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>

                      {dec?.notes && (
                        <div className="p-3 bg-muted/10 border-t border-border/30 text-xs text-muted-foreground">
                          <strong>Observações:</strong> {dec.notes}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB 3: LISTA FILTRÁVEL DE SKUS SONY COM TRAÇO */}
        <TabsContent value="sony-dash-list" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Inventário de SKUs Sony com Traço (-) ({filteredSonyDashList.length} itens)
              </h3>
              <p className="text-xs text-muted-foreground">
                Lista de todos os produtos Sony cadastrados que possuem hífen e que serão
                convertidos para o padrão sem traço na Rodada 2.
              </p>
            </div>
          </div>

          <Card className="border-border/50 bg-card/40 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent text-xs">
                  <TableHead className="w-12">Foto</TableHead>
                  <TableHead>SKU Atual (com traço)</TableHead>
                  <TableHead>SKU Proposto (Rodada 2)</TableHead>
                  <TableHead>Nome do Equipamento</TableHead>
                  <TableHead>Preço USD</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última Revisão</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSonyDashList.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-8 text-xs text-muted-foreground"
                    >
                      Nenhum produto Sony com traço encontrado com os filtros atuais.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSonyDashList.slice(0, 100).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="w-8 h-8 rounded bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center">
                          {p.image_url ? (
                            <ImageWithFallback
                              src={p.image_url}
                              alt={p.name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <span className="text-[9px] text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-amber-400">
                        {p.sku}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-emerald-400">
                        {p.normalizedSku}
                      </TableCell>
                      <TableCell className="text-xs max-w-[280px] truncate" title={p.name}>
                        {p.name}
                        <div className="text-[10px] text-muted-foreground font-mono">
                          ID: {p.id}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {p.price_usd != null ? formatUSD(p.price_usd) : '-'}
                      </TableCell>
                      <TableCell>
                        {p.is_discontinued ? (
                          <Badge variant="destructive" className="text-[10px] uppercase">
                            Descontinuado
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-green-500/30 bg-green-500/10 text-green-400 text-[10px] uppercase"
                          >
                            Ativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.last_reviewed_at
                          ? new Date(p.last_reviewed_at).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
                          <Link to={`/products/edit/${p.id}`} target="_blank">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {filteredSonyDashList.length > 100 && (
              <div className="p-3 bg-muted/20 text-center text-xs text-muted-foreground border-t border-border/40">
                Exibindo os primeiros 100 itens de {filteredSonyDashList.length}. Use o campo de
                busca acima para refinar.
              </div>
            )}
          </Card>
        </TabsContent>

        {/* TAB 5: RELATÓRIO PÓS-EXECUÇÃO DA RODADA 2 */}
        {executionReport && (
          <TabsContent value="round2-report" className="space-y-4">
            <Card className="border-emerald-500/40 bg-emerald-500/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <CardTitle className="text-base text-emerald-300">
                      Relatório de Execução — Rodada 2 Concluída
                    </CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 text-emerald-300 text-xs font-mono"
                  >
                    {new Date(executionReport.finishedAt).toLocaleTimeString()}
                  </Badge>
                </div>
                <CardDescription className="text-xs text-muted-foreground">
                  Resumo detalhado das alterações executadas no catálogo com salvaguarda de preços e
                  preservação de datas (renames não sensibilizam datas; prevalentes com dados
                  mesclados recebem novas datas; perdedores deletados em definitivo com histórico de
                  price_checks arquivado).
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 text-xs">
                {/* SEÇÃO EM DESTAQUE NO TOPO: ERROS QUE REQUEREM ATENÇÃO */}
                {executionReport.errors.length > 0 && (
                  <div className="p-4 rounded-lg bg-rose-500/15 border-2 border-rose-500/60 text-xs space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                      <h4 className="font-bold text-rose-200 text-sm uppercase tracking-wide">
                        Erros — Requer Atenção ({executionReport.errors.length})
                      </h4>
                    </div>
                    <p className="text-rose-300 text-[11px] leading-relaxed">
                      Uma ou mais operações falharam durante a execução da Rodada 2. Verifique o
                      produto afetado, a operação falhada e o detalhe do banco abaixo. Os demais
                      produtos continuaram normalmente.
                    </p>
                    <div className="space-y-2 pt-1">
                      {executionReport.errors.map((err, eIdx) => (
                        <div
                          key={eIdx}
                          className="p-2.5 rounded bg-black/40 border border-rose-500/30 text-rose-200 space-y-1 font-mono text-[11px]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-rose-400">
                            <span>{err.id ? `Produto ID: ${err.id}` : 'Sem ID informado'}</span>
                            {err.sku && (
                              <Badge
                                variant="outline"
                                className="border-rose-500/40 text-rose-300 text-[9px] px-1 py-0 font-mono"
                              >
                                SKU: {err.sku}
                              </Badge>
                            )}
                          </div>
                          <div className="text-rose-100 font-sans font-medium break-words">
                            {err.error}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botões de Exportação */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/20 border border-border/40 rounded-lg">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-foreground text-xs">
                      Exportação do Histórico de Price Checks dos Deletados
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Baixe o relatório completo em formato JSON ou CSV para auditoria e controle.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportCsv}
                      className="h-8 text-xs border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Baixar CSV (Price Checks)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportJson}
                      className="h-8 text-xs border-primary/40 text-primary hover:bg-primary/10"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Baixar JSON Completo
                    </Button>
                  </div>
                </div>

                {/* Métricas do relatório */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-card border border-border/50">
                    <span className="text-muted-foreground block text-[11px]">
                      SKUs Sony Renomeados
                    </span>
                    <span className="text-xl font-bold text-foreground">
                      {executionReport.totalSonyRenamed}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-card border border-border/50">
                    <span className="text-muted-foreground block text-[11px]">
                      Perdedores Deletados (Opção B)
                    </span>
                    <span className="text-xl font-bold text-rose-400 flex items-center gap-1.5">
                      <Trash2 className="w-4 h-4" />
                      {executionReport.totalLosersDeleted}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-card border border-border/50">
                    <span className="text-muted-foreground block text-[11px]">
                      Grupos Mesclados
                    </span>
                    <span className="text-xl font-bold text-emerald-400">
                      {executionReport.mergedGroups.length}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-card border border-border/50">
                    <span className="text-muted-foreground block text-[11px]">
                      Colisões Puladas (Pendentes)
                    </span>
                    <span className="text-xl font-bold text-amber-400">
                      {executionReport.skippedCollisions.length}
                    </span>
                  </div>
                </div>
                {/* Lista de Grupos Mesclados */}
                {executionReport.mergedGroups.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider">
                      Detalhamento das Mesclagens e Produtos Deletados (Opção B)
                    </h4>
                    <div className="space-y-3">
                      {executionReport.mergedGroups.map((group, idx) => (
                        <div
                          key={`merged_${group.normalizedSku}_${idx}`}
                          className="p-3 rounded-lg border border-border/60 bg-card/60 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge className="font-mono text-xs bg-primary/20 text-primary border-primary/30">
                                Chave: {group.normalizedSku}
                              </Badge>
                              <span className="font-semibold text-foreground">
                                Prevalente: {group.preferredName}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-emerald-400">
                              SKU Final: {group.preferredSkuAfter}
                            </span>
                          </div>

                          {/* Campos Mesclados */}
                          {group.mergedFields.length > 0 ? (
                            <div className="bg-muted/30 p-2 rounded text-[11px] space-y-1">
                              <span className="font-medium text-foreground block">
                                Campos incorporados do secundário no prevalente:
                              </span>
                              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                                {group.mergedFields.map((mf, mIdx) => (
                                  <li key={mIdx}>
                                    <strong>{mf.field}</strong>: incorporado valor &ldquo;
                                    {String(mf.mergedValue).slice(0, 80)}
                                    &rdquo; (vindo do SKU {mf.sourceSku || 'sem SKU'})
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted-foreground italic">
                              Nenhum campo ausente precisou de mesclagem (o prevalente já possuía os
                              dados preenchidos).
                            </p>
                          )}

                          {/* Perdedores deletados em definitivo */}
                          <div className="text-[11px] text-muted-foreground">
                            <span className="text-rose-400 font-medium">
                              Perdedores excluídos em definitivo de products (Opção B):{' '}
                            </span>
                            {group.deletedProducts.map((d, dIdx) => (
                              <span key={d.id} className="font-mono text-foreground">
                                {d.sku || 'Sem SKU'} ({d.name}) — {d.priceChecksCount}{' '}
                                price_check(s) arquivado(s)
                                {dIdx < group.deletedProducts.length - 1 ? '; ' : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tabela de Histórico de Price Checks Deletados */}
                {executionReport.deletedLosersSummary &&
                  executionReport.deletedLosersSummary.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
                          <Trash2 className="w-4 h-4 text-rose-400" />
                          Histórico Arquivado de Price Checks dos Produtos Deletados
                        </h4>
                        <span className="text-[11px] text-muted-foreground">
                          Total de produtos deletados: {executionReport.deletedLosersSummary.length}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {executionReport.deletedLosersSummary.map((item, itmIdx) => (
                          <div
                            key={itmIdx}
                            className="rounded-lg border border-border/50 bg-background/50 p-3 space-y-2"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                              <div>
                                <span className="font-semibold text-rose-300">
                                  Produto Excluído: {item.deletedSku || 'Sem SKU'} —{' '}
                                  {item.deletedName}
                                </span>
                                <div className="text-[10px] text-muted-foreground font-mono">
                                  ID: {item.deletedProductId} ➔ Mesclado no Prevalente:{' '}
                                  {item.preferredSku} ({item.preferredName}) [ID:{' '}
                                  {item.preferredProductId}]
                                </div>
                              </div>
                              <Badge
                                variant="outline"
                                className="w-fit text-[10px] border-border/50 text-muted-foreground"
                              >
                                {item.priceChecksCount} registro(s) de price_check
                              </Badge>
                            </div>

                            {item.priceChecks.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground italic pl-2">
                                Nenhuma verificação de preço (price_check) encontrada para este
                                produto.
                              </p>
                            ) : (
                              <div className="max-h-40 overflow-y-auto border border-border/30 rounded bg-card/60">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="text-[10px] hover:bg-transparent">
                                      <TableHead className="py-1">Data</TableHead>
                                      <TableHead className="py-1">Status</TableHead>
                                      <TableHead className="py-1">Preço DB</TableHead>
                                      <TableHead className="py-1">Preço B&amp;H</TableHead>
                                      <TableHead className="py-1">Mensagem</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {item.priceChecks.map((pc) => (
                                      <TableRow key={pc.id} className="text-[11px]">
                                        <TableCell className="py-1 text-muted-foreground font-mono">
                                          {pc.checked_at
                                            ? new Date(pc.checked_at).toLocaleString()
                                            : '-'}
                                        </TableCell>
                                        <TableCell className="py-1">
                                          <Badge
                                            variant="outline"
                                            className="text-[9px] px-1 py-0 uppercase"
                                          >
                                            {pc.status}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="py-1 font-mono">
                                          {pc.price_db != null ? formatUSD(pc.price_db) : '-'}
                                        </TableCell>
                                        <TableCell className="py-1 font-mono">
                                          {pc.price_bh != null ? formatUSD(pc.price_bh) : '-'}
                                        </TableCell>
                                        <TableCell
                                          className="py-1 text-muted-foreground truncate max-w-[200px]"
                                          title={pc.message || ''}
                                        >
                                          {pc.message || '-'}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                {/* Colisões Puladas */}
                {executionReport.skippedCollisions.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h4 className="font-semibold text-rose-400 text-xs uppercase tracking-wider">
                      Colisões Puladas (Ficaram Intactas)
                    </h4>
                    <div className="border border-rose-500/20 rounded-lg p-3 bg-rose-500/5 space-y-1">
                      {executionReport.skippedCollisions.map((sc, sIdx) => (
                        <div key={sIdx} className="flex justify-between items-center text-[11px]">
                          <span className="font-mono text-foreground font-semibold">
                            Chave: {sc.normalizedSku} ({sc.brand})
                          </span>
                          <span className="text-muted-foreground">
                            Motivo:{' '}
                            {sc.reason === 'undecided'
                              ? 'Pendente de decisão pelo usuário'
                              : sc.reason === 'distinct_products'
                                ? 'Decidido como produtos distintos'
                                : 'Prevalente não identificado'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* TAB 4: OUTRAS MARCAS */}
        <TabsContent value="other-collisions" className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Diagnóstico Preventivo de Colisões — Outras Marcas (
              {filteredOtherCollisions.length + (data?.crossBrandCollisions.length || 0)})
            </h3>
            <p className="text-xs text-muted-foreground">
              Estes produtos NÃO serão alterados fisicamente na padronização Sony, mas colidem
              internamente por duplicidade ou equivalência de código.
            </p>
          </div>

          <div className="space-y-4">
            {/* Colisões na mesma marca */}
            {filteredOtherCollisions.map((group, gIdx) => (
              <Card
                key={`other_${group.brand}_${group.normalizedSku}_${gIdx}`}
                className="border-border/60 bg-card/50 overflow-hidden"
              >
                <CardHeader className="bg-muted/20 py-3 px-4 border-b border-border/40 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      Marca: {group.brand}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="font-mono text-xs border-blue-500/40 bg-blue-500/10 text-blue-300"
                    >
                      Chave: {group.normalizedSku}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenDecisionModal(group)}
                    className="h-7 text-xs"
                  >
                    Registrar Nota
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent text-xs">
                        <TableHead>SKU Original</TableHead>
                        <TableHead>Nome do Produto</TableHead>
                        <TableHead>Preço USD</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.products.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs font-semibold">{p.sku}</TableCell>
                          <TableCell className="text-xs max-w-[320px] truncate">{p.name}</TableCell>
                          <TableCell className="text-xs">
                            {p.price_usd != null ? formatUSD(p.price_usd) : '-'}
                          </TableCell>
                          <TableCell>
                            {p.is_discontinued ? (
                              <Badge variant="destructive" className="text-[10px]">
                                Inativo
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-green-500/30 text-green-400 text-[10px]"
                              >
                                Ativo
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}

            {/* Colisões entre marcas diferentes */}
            {data && data.crossBrandCollisions.length > 0 && (
              <div className="pt-4 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Colisões Entre Marcas Distintas ({data.crossBrandCollisions.length})
                </h4>
                <p className="text-xs text-muted-foreground">
                  Marcas distintas que utilizam o mesmo código alfanumérico (ex.: código de
                  cabo/adaptador genérico).
                </p>

                {data.crossBrandCollisions.map((group, cIdx) => (
                  <Card
                    key={`cross_${group.normalizedSku}_${cIdx}`}
                    className="border-border/40 bg-card/30"
                  >
                    <CardHeader className="py-2.5 px-4 bg-muted/10 border-b border-border/30 flex flex-row items-center justify-between">
                      <span className="font-mono text-xs font-semibold">
                        Chave: {group.normalizedSku}
                      </span>
                      <span className="text-xs text-muted-foreground">{group.brand}</span>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableBody>
                          {group.products.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-xs font-medium w-48">
                                {p.manufacturer_name}
                              </TableCell>
                              <TableCell className="font-mono text-xs w-36">{p.sku}</TableCell>
                              <TableCell className="text-xs">{p.name}</TableCell>
                              <TableCell className="text-xs text-right w-24">
                                {p.price_usd != null ? formatUSD(p.price_usd) : '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal para Marcação de Decisão / Prevalência */}
      <Dialog
        open={!!selectedCollision}
        onOpenChange={(open) => !open && setSelectedCollision(null)}
      >
        <DialogContent className="max-w-2xl bg-card border-border/60">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Decisão de Prevalência — Chave {selectedCollision?.normalizedSku}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Escolha qual cadastro deve prevalecer nesta colisão. Esta marcação fica registrada na
              tabela de apoio
              <code>sku_collision_decisions</code> para ser consumida de forma segura na Rodada 2.
            </DialogDescription>
          </DialogHeader>

          {selectedCollision && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">
                  Selecione o cadastro preferido:
                </label>
                <div className="space-y-2">
                  {selectedCollision.products.map((p) => {
                    const isSelected = selectedPreferredId === p.id
                    return (
                      <div
                        key={p.id}
                        onClick={() => setSelectedPreferredId(p.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'border-primary bg-primary/10'
                            : 'border-border/50 hover:bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="radio"
                            checked={isSelected}
                            onChange={() => setSelectedPreferredId(p.id)}
                            className="text-primary focus:ring-primary"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-xs text-foreground">
                                {p.sku}
                              </span>
                              {p.is_discontinued && (
                                <Badge variant="destructive" className="text-[9px] px-1 py-0">
                                  Descontinuado
                                </Badge>
                              )}
                              {p.price_usd != null && (
                                <span className="text-xs font-semibold text-emerald-400">
                                  {formatUSD(p.price_usd)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate" title={p.name}>
                              {p.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              Atualizado:{' '}
                              {p.updated_at ? new Date(p.updated_at).toLocaleString() : '-'} | ID:{' '}
                              {p.id}
                            </p>
                          </div>
                        </div>

                        {isSelected && (
                          <Badge className="bg-primary text-primary-foreground text-[10px] shrink-0">
                            Selecionado
                          </Badge>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Tipo de decisão:</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Button
                    type="button"
                    variant={decisionType === 'keep_preferred' ? 'default' : 'outline'}
                    size="sm"
                    className="justify-start h-8"
                    onClick={() => setDecisionType('keep_preferred')}
                  >
                    Manter selecionado como oficial
                  </Button>
                  <Button
                    type="button"
                    variant={decisionType === 'distinct_products' ? 'default' : 'outline'}
                    size="sm"
                    className="justify-start h-8"
                    onClick={() => setDecisionType('distinct_products')}
                  >
                    São produtos distintos (não unificar)
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  Observações / Justificativa (opcional):
                </label>
                <Textarea
                  placeholder="Ex.: Conferido com a tabela de preços oficial Sony — modelo ativo com preço FOB correto..."
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  className="text-xs bg-background/50 h-20"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedCollision(null)}
              disabled={savingDecision}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveDecision}
              disabled={savingDecision || !selectedPreferredId}
              className="bg-primary hover:bg-primary/90"
            >
              {savingDecision ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Salvando Decisão...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  Confirmar Decisão (Dry-Run)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Execução da Rodada 2 com Prévia e Confirmação */}
      <Dialog
        open={previewModalOpen}
        onOpenChange={(open) => !executingBackfill && setPreviewModalOpen(open)}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border/70">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="w-5 h-5 text-primary" />
              Execução da Rodada 2 — Backfill e Mesclagem Sony
            </DialogTitle>
            <DialogDescription className="text-xs">
              Confirme a aplicação definitiva do plano de padronização nos produtos da marca Sony.
            </DialogDescription>
          </DialogHeader>

          {/* Erro de Tabela Ausente */}
          {backfillPreview && !backfillPreview.canExecute && backfillPreview.missingTableError && (
            <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Operação Bloqueada: Tabela de Decisões Não Encontrada
              </div>
              <p className="leading-relaxed">{backfillPreview.missingTableError}</p>
              <div className="p-2 rounded bg-black/40 font-mono text-[11px] text-muted-foreground select-all">
                NOTIFY pgrst, 'reload schema';
              </div>
            </div>
          )}

          {/* Bloqueio Explícito: Colisões sem decisão gravada */}
          {backfillPreview &&
            !backfillPreview.canExecute &&
            backfillPreview.hasBlockingUndecidedCollisions && (
              <div className="p-4 rounded-lg bg-amber-500/15 border-2 border-amber-500/50 text-xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-amber-200 text-sm">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                  BLOQUEADA — Decisão não gravada ({backfillPreview.blockingCollisions?.length || 0}
                  )
                </div>
                <p className="text-amber-300 text-xs leading-relaxed">
                  A execução da Rodada 2 está <strong>bloqueada</strong> porque existem colisões
                  Sony sem decisão gravada. O usuário deve decidir a prevalência na aba{' '}
                  <strong>&ldquo;Colisões Sony&rdquo;</strong> antes de rodar o backfill, garantindo
                  que nenhum produto seja excluído ou renomeado por engano.
                </p>
                <div className="space-y-2 pt-1">
                  <span className="font-semibold text-amber-200 uppercase text-[10px] tracking-wider block">
                    Colisões que exigem definição prévia:
                  </span>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {(backfillPreview.blockingCollisions || []).map((bc, bIdx) => (
                      <div
                        key={bIdx}
                        className="p-3 rounded bg-black/40 border border-amber-500/30 text-amber-100 space-y-1.5"
                      >
                        <div className="flex items-center justify-between font-mono text-xs">
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 bg-amber-500/10 text-amber-300 font-bold"
                          >
                            Chave: {bc.normalizedSku}
                          </Badge>
                          <span className="text-[11px] text-amber-300/80">
                            {bc.reason === 'missing_preferred'
                              ? 'Prevalente marcado não encontrado no banco'
                              : 'Decisão pendente na aba Colisões'}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          <span className="text-foreground font-semibold">
                            Produtos concorrentes:
                          </span>
                          <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                            {bc.products.map((p) => (
                              <li key={p.id}>
                                <span className="font-mono font-semibold text-foreground">
                                  {p.sku || 'Sem SKU'}
                                </span>{' '}
                                — {p.name}{' '}
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  (ID: {p.id})
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPreviewModalOpen(false)
                      setActiveTab('sony-collisions')
                    }}
                    className="border-amber-500/50 text-amber-300 hover:bg-amber-500/10 text-xs"
                  >
                    Ir para a aba Colisões Sony e Decidir
                  </Button>
                </div>
              </div>
            )}

          {backfillPreview && backfillPreview.canExecute && (
            <div className="space-y-4 py-2 text-xs">
              {/* Salvaguardas em destaque */}
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 space-y-1">
                <p className="font-semibold text-blue-200 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  Opção B Decidida — Garantias e Invariantes desta Execução:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  <li>
                    <strong>Exclusão Definitiva (Opção B):</strong> Produtos perdedores de colisão
                    terão seus dados mesclados no prevalente e serão{' '}
                    <strong>deletados de vez</strong> de <code>public.products</code> (sem usar
                    is_discontinued).
                  </li>
                  <li>
                    <strong>Rastreabilidade de Price Checks:</strong> Antes de apagar cada perdedor,
                    seus registros em <code>public.price_checks</code> são arquivados para
                    visualização e exportação (JSON/CSV) na aba Relatório.
                  </li>
                  <li>
                    <strong>Price USD Intacto:</strong> NUNCA toca em price_usd, discounts ou marcas
                    de terceiros.
                  </li>
                  <li>
                    <strong>Regra de Datas:</strong> Renames de SKU não alteram datas (apenas o
                    campo <code>sku</code> é atualizado). Produtos prevalentes recebem{' '}
                    <code>updated_at = last_reviewed_at = agora</code>
                    SOMENTE se receberem dados mesclados reais (não sobrescreve dado preenchido com
                    vazio).
                  </li>
                </ul>
              </div>

              {/* Resumo Numérico da Prévia */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded bg-muted/20 border border-border/40">
                  <span className="text-[11px] text-muted-foreground block">SKUs a Renomear</span>
                  <span className="text-lg font-bold text-foreground">
                    {backfillPreview.renamesCount}
                  </span>
                </div>
                <div className="p-3 rounded bg-muted/20 border border-border/40">
                  <span className="text-[11px] text-muted-foreground block">
                    Perdedores a Deletar
                  </span>
                  <span className="text-lg font-bold text-rose-400">
                    {backfillPreview.totalLosersToDelete}
                  </span>
                </div>
                <div className="p-3 rounded bg-muted/20 border border-border/40">
                  <span className="text-[11px] text-muted-foreground block">Colisões Puladas</span>
                  <span className="text-lg font-bold text-yellow-400">
                    {backfillPreview.skippedCollisionsCount}
                  </span>
                </div>
                <div className="p-3 rounded bg-muted/20 border border-border/40">
                  <span className="text-[11px] text-muted-foreground block">Já Conformes</span>
                  <span className="text-lg font-bold text-muted-foreground">
                    {backfillPreview.alreadyStandardizedCount}
                  </span>
                </div>
              </div>

              {/* LISTAGEM NOMINAL DOS PRODUTOS PERDEDORES QUE SERÃO DELETADOS */}
              {backfillPreview.losersToDeleteList &&
                backfillPreview.losersToDeleteList.length > 0 && (
                  <div className="space-y-2">
                    <span className="font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-1.5 block">
                      <Trash2 className="w-4 h-4" />
                      1. Listagem Nominal: Produtos Perdedores que serão EXCLUÍDOS DEFINITIVAMENTE (
                      {backfillPreview.losersToDeleteList.length})
                    </span>
                    <div className="border border-rose-500/30 rounded-lg overflow-hidden bg-rose-500/5">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent text-[11px]">
                            <TableHead className="text-rose-300 font-semibold">
                              SKU a Deletar
                            </TableHead>
                            <TableHead className="text-rose-300 font-semibold">
                              Nome do Produto Deletado
                            </TableHead>
                            <TableHead className="text-rose-300 font-semibold">
                              ID a Deletar
                            </TableHead>
                            <TableHead className="text-emerald-400 font-semibold">
                              Será Mesclado No Prevalente
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {backfillPreview.losersToDeleteList.map((loser) => (
                            <TableRow key={loser.id} className="text-xs">
                              <TableCell className="font-mono text-rose-300 font-bold py-1.5">
                                {loser.sku || 'Sem SKU'}
                              </TableCell>
                              <TableCell
                                className="py-1.5 max-w-[200px] truncate"
                                title={loser.name}
                              >
                                {loser.name}
                              </TableCell>
                              <TableCell className="font-mono text-[10px] text-muted-foreground py-1.5">
                                {loser.id}
                              </TableCell>
                              <TableCell className="py-1.5 text-emerald-400">
                                <span className="font-mono font-semibold">
                                  {loser.mergeIntoPreferredSku || 'Sem SKU'}
                                </span>{' '}
                                ({loser.mergeIntoPreferredName.slice(0, 25)}...)
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

              {/* Prévia dos Grupos que serão Mesclados */}
              {backfillPreview.mergesPreview.length > 0 && (
                <div className="space-y-2">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground block">
                    2. Detalhe das Colisões e Campos que serão Mesclados (
                    {backfillPreview.mergesPreview.length})
                  </span>
                  <div className="max-h-40 overflow-y-auto space-y-2 border border-border/40 rounded-lg p-2 bg-background/50">
                    {backfillPreview.mergesPreview.map((m, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded bg-card/60 border border-border/30 space-y-1"
                      >
                        <div className="flex justify-between items-center font-mono">
                          <span className="font-semibold text-foreground">
                            Chave: {m.normalizedSku}
                          </span>
                          <span className="text-emerald-400 text-[11px]">
                            Prevalente: {m.preferredProduct.sku} (
                            {m.preferredProduct.name.slice(0, 35)}...)
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex justify-between">
                          <span>
                            Perdedor(es) a deletar:{' '}
                            {m.secondaryProducts.map((s) => s.sku || 'Sem SKU').join(', ')}
                          </span>
                          <span>
                            Campos a mesclar:{' '}
                            {m.fieldsToMerge.length > 0 ? m.fieldsToMerge.join(', ') : 'Nenhum'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Prévia dos SKUs a Renomear */}
              {backfillPreview.renamesPreview.length > 0 && (
                <div className="space-y-2">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground block">
                    3. Amostra de SKUs Sony a Remover Traço ({backfillPreview.renamesCount} total)
                  </span>
                  <div className="max-h-36 overflow-y-auto border border-border/40 rounded-lg p-2 bg-background/50">
                    <Table>
                      <TableBody>
                        {backfillPreview.renamesPreview.slice(0, 8).map((r) => (
                          <TableRow key={r.id} className="text-xs">
                            <TableCell className="font-mono text-amber-400 py-1">
                              {r.oldSku}
                            </TableCell>
                            <TableCell className="py-1">➔</TableCell>
                            <TableCell className="font-mono text-emerald-400 py-1">
                              {r.newSku}
                            </TableCell>
                            <TableCell className="text-muted-foreground py-1 truncate max-w-[280px]">
                              {r.name}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Colisões Puladas (sem decisão ou distintas) */}
              {backfillPreview.skippedCollisions.length > 0 && (
                <div className="space-y-2">
                  <span className="font-semibold uppercase tracking-wider text-amber-400 block">
                    4. Colisões Puladas — Mantidas Intactas (
                    {backfillPreview.skippedCollisions.length})
                  </span>
                  <div className="max-h-28 overflow-y-auto space-y-1 border border-amber-500/30 rounded-lg p-2 bg-amber-500/5 text-[11px]">
                    {backfillPreview.skippedCollisions.map((sc, scIdx) => (
                      <div key={scIdx} className="flex justify-between items-center">
                        <span className="font-mono font-semibold text-foreground">
                          Chave: {sc.normalizedSku} ({sc.brand}) — SKUs:{' '}
                          {sc.productSkus.filter(Boolean).join(', ')}
                        </span>
                        <span className="text-muted-foreground">
                          {sc.reason === 'undecided'
                            ? 'Pendente de decisão'
                            : sc.reason === 'distinct_products'
                              ? 'Marcado como produtos distintos'
                              : 'Prevalente não encontrado'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Barra de Progresso durante a Execução */}
              {executingBackfill && (
                <div className="space-y-2 p-4 rounded-lg bg-primary/10 border border-primary/30">
                  <div className="flex justify-between text-xs font-semibold text-primary">
                    <span>{executionProgress.stage || 'Processando Rodada 2...'}</span>
                    <span>{executionProgress.current}%</span>
                  </div>
                  <Progress value={executionProgress.current} className="h-2" />
                </div>
              )}

              {/* Checkbox de Confirmação Explícita */}
              {!executingBackfill && (
                <div className="pt-2 border-t border-border/40">
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs select-none">
                    <input
                      type="checkbox"
                      checked={confirmCheckbox}
                      onChange={(e) => setConfirmCheckbox(e.target.checked)}
                      className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-foreground leading-relaxed">
                      Confirmo a execução da <strong>Rodada 2 (Opção B)</strong> no banco de
                      produção. Estou ciente de que os SKUs Sony serão renomeados sem traço, os
                      produtos perdedores listados acima serão{' '}
                      <strong>excluídos definitivamente</strong> do banco de dados após a mesclagem
                      de seus dados mais completos no produto prevalente, e o histórico de price
                      checks será arquivado para auditoria.
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/40">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewModalOpen(false)}
              disabled={executingBackfill}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleExecuteRound2}
              disabled={!backfillPreview?.canExecute || !confirmCheckbox || executingBackfill}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {executingBackfill ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Executando Backfill...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Confirmar e Executar Rodada 2
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
