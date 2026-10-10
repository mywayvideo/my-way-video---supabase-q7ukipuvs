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
  SkuProductItem,
} from '@/services/skuStandardizationService'
import { formatUSD } from '@/lib/utils'
import { ImageWithFallback } from '@/components/ImageWithFallback'

export default function AdminSkuStandardizationPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SkuDiagnosisResult | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterDashOnly, setFilterDashOnly] = useState(false)
  const [activeTab, setActiveTab] = useState<
    'overview' | 'sony-collisions' | 'other-collisions' | 'sony-dash-list'
  >('overview')

  // Estado para modal de decisão de colisão
  const [selectedCollision, setSelectedCollision] = useState<SkuCollisionGroup | null>(null)
  const [selectedPreferredId, setSelectedPreferredId] = useState<string | null>(null)
  const [decisionType, setDecisionType] = useState<
    'keep_preferred' | 'distinct_products' | 'merge_pending' | 'undecided'
  >('keep_preferred')
  const [decisionNotes, setDecisionNotes] = useState('')
  const [savingDecision, setSavingDecision] = useState(false)

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
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="h-9">
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
          <Card className="bg-card/40 border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Resumo Executivo do Diagnóstico (Rodada 1)
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
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Pares de Produtos Sony com Colisão de Chave ({filteredSonyCollisions.length})
              </h3>
              <p className="text-xs text-muted-foreground">
                Cadastros cujo SKU normalizado (maiúsculas, sem traço e sem espaços) é idêntico.
                Decida qual produto prevalece.
              </p>
            </div>
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
    </div>
  )
}
