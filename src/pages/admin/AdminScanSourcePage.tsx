import React, { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { parseScanSourceXlsx } from '@/utils/scansource-parser'
import { SyncedScrollTable } from '@/components/admin/scansource/SyncedScrollTable'
import {
  scanSourceImportService,
  ScanSourceCrossMatchPreview,
  ScanSourceExecutionResult,
} from '@/services/scanSourceImportService'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  ArrowRight,
  ShieldCheck,
  Layers,
  Sparkles,
  HelpCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  DollarSign,
  Ban,
  Loader2,
  Link2,
  Check,
  Search,
} from 'lucide-react'

export function AdminScanSourcePage() {
  const { currentUser: user } = useAuthContext()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionProgress, setExecutionProgress] = useState<{
    step: string
    percent: number
  } | null>(null)

  const [preview, setPreview] = useState<ScanSourceCrossMatchPreview | null>(null)
  const [executionResult, setExecutionResult] = useState<ScanSourceExecutionResult | null>(null)
  const [recentAudits, setRecentAudits] = useState<any[]>([])

  // Modal de confirmação
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

  // Filtros da tabela de preview
  const [searchFilter, setSearchFilter] = useState('')

  // Modal / Diálogo para "Informar Custo" manual em produtos ausentes
  const [manualCostModalProduct, setManualCostModalProduct] = useState<any | null>(null)
  const [manualCostValue, setManualCostValue] = useState<string>('')
  const [isSavingManualCost, setIsSavingManualCost] = useState(false)

  // Feedback de vinculação direta por item
  const [linkingRowIndex, setLinkingRowIndex] = useState<number | null>(null)

  // Carrega histórico de auditorias ao montar
  useEffect(() => {
    loadAudits()
  }, [])

  const loadAudits = async () => {
    const list = await scanSourceImportService.fetchRecentAudits()
    setRecentAudits(list)
  }

  const handleFileSelect = (selectedFile: File | null) => {
    if (!selectedFile) return
    if (!selectedFile.name.toLowerCase().endsWith('.xlsx')) {
      toast({
        title: 'Formato inválido',
        description: 'Por favor, selecione um arquivo Excel (.xlsx) da tabela ScanSource.',
        variant: 'destructive',
      })
      return
    }

    setFile(selectedFile)
    setPreview(null)
    setExecutionResult(null)
  }

  const handleParseAndPreview = async () => {
    if (!file) return

    try {
      setIsParsing(true)

      // 1. Ler ArrayBuffer do arquivo enviado pelo usuário
      const buffer = await file.arrayBuffer()

      // 2. Parsear XLSX nativo sem bibliotecas externas
      const parseResult = await parseScanSourceXlsx(buffer)

      if (parseResult.validRows.length === 0) {
        throw new Error(
          'Nenhuma linha válida com código MODEL e preço na coluna D foi identificada na planilha.',
        )
      }

      // 3. Buscar catálogo e categorias para cruzamento
      const [catalogProducts, categoriesRes] = await Promise.all([
        scanSourceImportService.fetchCatalogProducts(),
        supabase.from('categories').select('id, name').order('name'),
      ])

      const categories = (categoriesRes.data || []).map((c) => ({ id: c.id, name: c.name }))

      // 4. Cruzamento em memória
      const crossPreview = await scanSourceImportService.buildCrossMatchPreview(
        parseResult,
        file.name,
        catalogProducts,
        categories,
      )

      setPreview(crossPreview)

      toast({
        title: 'Tabela analisada com sucesso!',
        description: `${crossPreview.matchedCount} produtos casados encontrados (${crossPreview.matchedWithChangeCount} com alteração de custo).`,
      })
    } catch (err: any) {
      console.error('Erro ao analisar planilha:', err)
      toast({
        title: 'Erro ao processar arquivo',
        description: err.message || 'Falha ao interpretar a tabela de preços ScanSource.',
        variant: 'destructive',
      })
    } finally {
      setIsParsing(false)
    }
  }

  const handleExecuteImport = async () => {
    if (!preview) return

    try {
      setConfirmDialogOpen(false)
      setIsExecuting(true)
      setExecutionProgress({ step: 'Iniciando gravação...', percent: 5 })

      const result = await scanSourceImportService.executeConfirmedImport(
        preview,
        user?.id,
        (step, percent) => {
          setExecutionProgress({ step, percent })
        },
      )

      if (result.success) {
        setExecutionResult(result)
        toast({
          title: 'Importação concluída!',
          description: `${result.updatedProductsCount} produtos com custo nacionalizado atualizado e ${result.stagingCreatedCount} pendências enviadas para revisão.`,
        })
        loadAudits()
      } else {
        throw new Error(result.error || 'Erro na gravação dos dados.')
      }
    } catch (err: any) {
      console.error('Erro ao executar importação:', err)
      toast({
        title: 'Falha na gravação',
        description: err.message || 'Ocorreu um erro durante a atualização do catálogo.',
        variant: 'destructive',
      })
    } finally {
      setIsExecuting(false)
      setExecutionProgress(null)
    }
  }

  const handleDownloadMissingCsv = () => {
    if (!preview || preview.missingFromCatalog.length === 0) return

    const csvContent = scanSourceImportService.exportMissingCatalogCsv(preview.missingFromCatalog)
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `produtos-sony-ausentes-scansource-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const resetAll = () => {
    setFile(null)
    setPreview(null)
    setExecutionResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Ação: Vincular a produto existente direto do assistente de correspondências
  const handleLinkCandidate = async (row: any, candidate: any, rowIndex: number) => {
    if (!preview) return

    try {
      setLinkingRowIndex(rowIndex)
      const res = await scanSourceImportService.linkTableRowToProduct({
        productId: candidate.productId,
        newCostUsd: row.priceUsdSt,
        effectiveDate: preview.effectiveDate,
        tableModel: row.model,
        rowDescription: row.description,
        userId: user?.id,
      })

      if (res.success) {
        toast({
          title: 'Produto vinculado com sucesso!',
          description: `"${candidate.productName}" (SKU: ${candidate.productSku || '—'}) agora tem custo nacionalizado de US$ ${row.priceUsdSt.toFixed(2)} (vigência ${preview.effectiveDate}).`,
        })

        // Atualiza estado local no preview: marca item como vinculado
        setPreview((prev) => {
          if (!prev) return null
          const nextUnmatched = prev.unmatchedItems.map((u) => {
            if (u.row.rowIndex === row.rowIndex) {
              return {
                ...u,
                linkedProductId: candidate.productId,
                linkedProductName: candidate.productName,
                linkedProductSku: candidate.productSku,
              }
            }
            return u
          })
          return {
            ...prev,
            unmatchedItems: nextUnmatched,
          }
        })
        loadAudits()
      } else {
        throw new Error(res.error || 'Falha ao vincular produto')
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao vincular produto',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLinkingRowIndex(null)
    }
  }

  // Ação: Salvar custo nacionalizado manual (ação 'Informar custo')
  const handleSaveManualCost = async () => {
    if (!manualCostModalProduct) return

    const trimmed = manualCostValue.trim()
    const parsedCost = trimmed === '' ? null : parseFloat(trimmed.replace(',', '.'))

    if (trimmed !== '' && (isNaN(parsedCost!) || parsedCost! < 0)) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um valor numérico positivo em USD ou deixe em branco.',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsSavingManualCost(true)
      const res = await scanSourceImportService.updateManualNationalizedCost({
        productId: manualCostModalProduct.id,
        costUsd: parsedCost,
        effectiveDate: preview?.effectiveDate || 'JAN 2nd 2025',
        notes: `Informado manualmente via relatório de ausentes`,
        userId: user?.id,
      })

      if (res.success) {
        toast({
          title: 'Custo nacionalizado gravado!',
          description:
            parsedCost !== null
              ? `Custo nacionalizado de US$ ${parsedCost.toFixed(2)} registrado com origem "manual" (vigência ${preview?.effectiveDate || 'JAN 2nd 2025'}). Preço de venda inalterado.`
              : `Item mantido sem custo nacionalizado, sem bloqueio.`,
        })

        // Atualiza localmente no relatório de ausentes
        setPreview((prev) => {
          if (!prev) return null
          const nextMissing = prev.missingFromCatalog.map((m) => {
            if (m.id === manualCostModalProduct.id) {
              return {
                ...m,
                price_nationalized_cost: parsedCost,
                price_nationalized_currency:
                  parsedCost !== null ? 'Nacionalizado USD' : m.price_nationalized_currency,
              }
            }
            return m
          })
          return {
            ...prev,
            missingFromCatalog: nextMissing,
          }
        })

        setManualCostModalProduct(null)
        setManualCostValue('')
        loadAudits()
      } else {
        throw new Error(res.error || 'Falha ao salvar custo manual')
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao gravar custo',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsSavingManualCost(false)
    }
  }

  // Filtra itens para a visualização das abas
  const filteredMatchedWithChange = (preview?.matchedWithChange || []).filter((m) => {
    if (!searchFilter.trim()) return true
    const term = searchFilter.toLowerCase()
    return (
      m.product.name.toLowerCase().includes(term) ||
      (m.product.sku && m.product.sku.toLowerCase().includes(term)) ||
      m.row.model.toLowerCase().includes(term)
    )
  })

  const filteredUnmatched = (preview?.unmatchedItems || []).filter((u) => {
    if (!searchFilter.trim()) return true
    const term = searchFilter.toLowerCase()
    return (
      u.row.model.toLowerCase().includes(term) ||
      u.row.description.toLowerCase().includes(term) ||
      (u.suggestedCategoryName && u.suggestedCategoryName.toLowerCase().includes(term))
    )
  })

  return (
    <AdminLayout breadcrumb="Importação ScanSource">
      <div className="flex flex-col gap-6 max-w-7xl mx-auto animate-fade-in pb-16">
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-lg text-primary">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                Importação de Preços Sony ScanSource
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Atualização recorrente de preço de custo nacionalizado (Coluna D, com ST) em USD.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/import-review">
                <Layers className="w-4 h-4 mr-2" /> Fila de Revisão
              </Link>
            </Button>
            {preview && (
              <Button variant="ghost" size="sm" onClick={resetAll} disabled={isExecuting}>
                <RefreshCw className="w-4 h-4 mr-1.5" /> Nova Tabela
              </Button>
            )}
          </div>
        </div>

        {/* Banner Informativo de Gestão */}
        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-xs space-y-1 text-muted-foreground">
            <p className="font-semibold text-foreground">Diretriz de Segurança do Catálogo:</p>
            <p>
              Os valores da Coluna D gravam exclusivamente no{' '}
              <strong className="text-foreground">preço de custo nacionalizado em USD</strong>{' '}
              (moeda &quot;Nacionalizado USD&quot;). O <span className="font-mono">price_usd</span>,
              preço de venda e margens da vitrine/checkout{' '}
              <strong className="text-foreground">permanecem 100% inalterados</strong>.
            </p>
          </div>
        </div>

        {/* Bloco 1: Upload e Parsing */}
        {!preview && (
          <Card className="border-white/10 bg-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                Upload da Tabela ScanSource (.xlsx)
              </CardTitle>
              <CardDescription>
                Selecione o arquivo Excel oficial da distribuidora (aba DEALERListPrice). O sistema
                detecta automaticamente o cabeçalho, vigência e as colunas de modelo e preço com ST.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                  file
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-white/10 hover:border-white/20 bg-background/50',
                )}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                />
                <FileSpreadsheet className="w-10 h-10 text-primary mx-auto mb-3 opacity-80" />
                {file ? (
                  <div>
                    <p className="font-semibold text-foreground text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(file.size / 1024).toFixed(1)} KB · Clique para trocar de arquivo
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-foreground text-sm">
                      Clique aqui para selecionar a planilha XLSX da ScanSource
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Formato .xlsx suportado nativamente pelo navegador
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                {file && (
                  <Button variant="ghost" size="sm" onClick={resetAll} disabled={isParsing}>
                    Limpar
                  </Button>
                )}
                <Button
                  onClick={handleParseAndPreview}
                  disabled={!file || isParsing}
                  className="bg-primary hover:bg-primary/90"
                >
                  {isParsing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analisando Planilha...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Analisar e Gerar Preview
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Barra de Progresso de Execução */}
        {isExecuting && executionProgress && (
          <Card className="border-primary/40 bg-primary/5 animate-pulse">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-medium text-foreground flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  {executionProgress.step}
                </span>
                <span className="font-mono text-primary font-semibold">
                  {executionProgress.percent}%
                </span>
              </div>
              <Progress value={executionProgress.percent} className="h-2" />
            </CardContent>
          </Card>
        )}

        {/* Bloco 2: Preview Completo do Cruzamento */}
        {preview && !executionResult && (
          <div className="space-y-6">
            {/* Cards de Métricas do Preview */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <Card className="border-white/10 bg-card">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Vigência Detectada</p>
                  <p
                    className="text-base font-bold text-foreground mt-1 truncate"
                    title={preview.effectiveDate}
                  >
                    {preview.effectiveDate}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="p-4">
                  <p className="text-xs text-emerald-400">Casados com Mudança</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">
                    {preview.matchedWithChangeCount}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    +{preview.matchedUnchangedCount} inalterados
                  </p>
                </CardContent>
              </Card>

              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="p-4">
                  <p className="text-xs text-amber-400">Não Casados (Revisão)</p>
                  <p className="text-2xl font-bold text-amber-400 mt-1">{preview.unmatchedCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Entrarão na fila de staging
                  </p>
                </CardContent>
              </Card>

              <Card className="border-blue-500/20 bg-blue-500/5">
                <CardContent className="p-4">
                  <p className="text-xs text-blue-400">Linhas Software (SW)</p>
                  <p className="text-2xl font-bold text-blue-400 mt-1">{preview.softwareCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Atualizam custo como HW
                  </p>
                </CardContent>
              </Card>

              <Card className="border-zinc-500/20 bg-zinc-500/5">
                <CardContent className="p-4">
                  <p className="text-xs text-zinc-400">3RD Ignorados</p>
                  <p className="text-2xl font-bold text-zinc-300 mt-1">{preview.ignored3rdCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Descartados da importação
                  </p>
                </CardContent>
              </Card>

              <Card className="border-red-500/20 bg-red-500/5">
                <CardContent className="p-4">
                  <p className="text-xs text-red-400">Anomalias (Preço 0/Inválido)</p>
                  <p className="text-2xl font-bold text-red-400 mt-1">{preview.anomaliesCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Não zeram custos existentes
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Destaque Obrigatório: PXWX400KC */}
            {preview.pxwSample ? (
              <Card className="border-emerald-500/30 bg-emerald-500/10">
                <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
                        Conferência de Referência Obrigatória (PXW-X400KC)
                      </p>
                      <p className="text-sm font-bold text-foreground">
                        {preview.pxwSample.product.name} (SKU: {preview.pxwSample.product.sku})
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Modelo na planilha:{' '}
                        <span className="font-mono text-foreground font-semibold">
                          {preview.pxwSample.row.model}
                        </span>{' '}
                        · Coluna D (com ST):{' '}
                        <strong className="text-emerald-400">
                          US${' '}
                          {preview.pxwSample.newCostUsd.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                          })}
                        </strong>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="text-right">
                      <p className="text-muted-foreground">Custo Atual</p>
                      <p className="font-semibold text-foreground">
                        {preview.pxwSample.currentCostUsd !== null
                          ? `US$ ${preview.pxwSample.currentCostUsd.toFixed(2)}`
                          : 'Não definido'}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    <div className="text-right">
                      <p className="text-muted-foreground">Novo Custo Nacionalizado</p>
                      <p className="font-bold text-emerald-400 text-sm">
                        US$ {preview.pxwSample.newCostUsd.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="p-3 text-xs text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Amostra PXWX400KC não foi identificada diretamente no cruzamento. Confira a aba
                    de casados e não casados antes de confirmar.
                  </span>
                </CardContent>
              </Card>
            )}

            {/* Ações de Confirmação */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-card border border-white/10">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Pronto para gravar a vigência {preview.effectiveDate}?
                </p>
                <p className="text-xs text-muted-foreground">
                  {preview.matchedWithChangeCount} produtos casados serão atualizados e{' '}
                  {preview.unmatchedCount} produtos novos irão para revisão manual.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={resetAll} disabled={isExecuting}>
                  Descartar
                </Button>
                <Button
                  onClick={() => setConfirmDialogOpen(true)}
                  disabled={isExecuting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Confirmar e Gravar Tabela
                </Button>
              </div>
            </div>

            {/* Abas de Detalhamento do Preview */}
            <Card className="border-white/10 bg-card">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="text-base font-semibold">
                    Detalhamento do Cruzamento
                  </CardTitle>
                  <Input
                    placeholder="Filtrar por SKU, modelo ou nome..."
                    className="max-w-xs h-8 text-xs bg-background/50 border-white/10"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs defaultValue="matched" className="w-full">
                  <div className="px-6 border-b border-white/10">
                    <TabsList className="bg-transparent h-10 p-0 gap-4">
                      <TabsTrigger
                        value="matched"
                        className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 text-xs"
                      >
                        Casados com Mudança ({preview.matchedWithChangeCount})
                      </TabsTrigger>
                      <TabsTrigger
                        value="unchanged"
                        className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 text-xs"
                      >
                        Casados Inalterados ({preview.matchedUnchangedCount})
                      </TabsTrigger>
                      <TabsTrigger
                        value="unmatched"
                        className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 text-xs"
                      >
                        Não Casados ({preview.unmatchedCount})
                      </TabsTrigger>
                      <TabsTrigger
                        value="suggestions"
                        className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 text-xs text-primary font-medium"
                      >
                        <Sparkles className="w-3.5 h-3.5 mr-1 inline" />
                        Possíveis correspondências (
                        {
                          preview.unmatchedItems.filter(
                            (u) => u.candidates && u.candidates.length > 0,
                          ).length
                        }
                        )
                      </TabsTrigger>
                      <TabsTrigger
                        value="missing"
                        className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 text-xs"
                      >
                        Ausentes no Catálogo ({preview.missingFromCatalogCount})
                      </TabsTrigger>
                      <TabsTrigger
                        value="anomalies"
                        className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 text-xs"
                      >
                        Anomalias ({preview.anomaliesCount})
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* Aba: Casados com Mudança */}
                  <TabsContent value="matched" className="p-0 m-0">
                    <SyncedScrollTable maxHeight="420px" minContentWidth="860px">
                      <Table className="min-w-[860px]">
                        <TableHeader className="sticky top-0 z-30 bg-card shadow-sm">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-36 min-w-[144px] max-w-[144px] sticky left-0 z-30 bg-card border-r border-white/10">
                              Modelo Planilha
                            </TableHead>
                            <TableHead className="w-36 min-w-[144px] max-w-[144px] sticky left-[144px] z-30 bg-card border-r border-white/10">
                              SKU Catálogo
                            </TableHead>
                            <TableHead className="min-w-[240px]">Nome do Produto</TableHead>
                            <TableHead className="w-24 min-w-[96px]">Tipo</TableHead>
                            <TableHead className="w-32 min-w-[128px] text-right">
                              Custo Atual
                            </TableHead>
                            <TableHead className="w-36 min-w-[144px] text-right">
                              Novo Custo (ST)
                            </TableHead>
                            <TableHead className="w-28 min-w-[112px] text-right">
                              Diferença
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredMatchedWithChange.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={7}
                                className="h-24 text-center text-muted-foreground text-xs"
                              >
                                Nenhum produto casado com mudança de preço.
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredMatchedWithChange.slice(0, 100).map((m) => (
                              <TableRow key={m.product.id} className="group">
                                <TableCell className="w-36 min-w-[144px] max-w-[144px] sticky left-0 z-10 bg-card group-hover:bg-muted/50 border-r border-white/10 font-mono text-xs font-semibold text-foreground">
                                  {m.row.model}
                                </TableCell>
                                <TableCell className="w-36 min-w-[144px] max-w-[144px] sticky left-[144px] z-10 bg-card group-hover:bg-muted/50 border-r border-white/10 font-mono text-xs text-muted-foreground">
                                  {m.product.sku}
                                </TableCell>
                                <TableCell
                                  className="text-xs truncate max-w-sm"
                                  title={m.product.name}
                                >
                                  {m.product.name}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[10px]">
                                    {m.row.itemType}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                  {m.currentCostUsd !== null
                                    ? `US$ ${m.currentCostUsd.toFixed(2)}`
                                    : '—'}
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs font-bold text-emerald-400">
                                  US$ {m.newCostUsd.toFixed(2)}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    'text-right font-mono text-xs',
                                    m.diffUsd > 0 ? 'text-emerald-400' : 'text-amber-400',
                                  )}
                                >
                                  {m.diffUsd > 0
                                    ? `+US$ ${m.diffUsd.toFixed(2)}`
                                    : `US$ ${m.diffUsd.toFixed(2)}`}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </SyncedScrollTable>
                  </TabsContent>

                  {/* Aba: Casados Inalterados */}
                  <TabsContent value="unchanged" className="p-0 m-0">
                    <SyncedScrollTable maxHeight="420px" minContentWidth="720px">
                      <Table className="min-w-[720px]">
                        <TableHeader className="sticky top-0 z-30 bg-card shadow-sm">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-36 min-w-[144px] max-w-[144px] sticky left-0 z-30 bg-card border-r border-white/10">
                              Modelo Planilha
                            </TableHead>
                            <TableHead className="w-36 min-w-[144px] max-w-[144px] sticky left-[144px] z-30 bg-card border-r border-white/10">
                              SKU Catálogo
                            </TableHead>
                            <TableHead className="min-w-[240px]">Nome do Produto</TableHead>
                            <TableHead className="w-36 min-w-[144px] text-right">
                              Custo Nacionalizado
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.matchedUnchanged.slice(0, 100).map((m) => (
                            <TableRow key={m.product.id} className="group">
                              <TableCell className="w-36 min-w-[144px] max-w-[144px] sticky left-0 z-10 bg-card group-hover:bg-muted/50 border-r border-white/10 font-mono text-xs">
                                {m.row.model}
                              </TableCell>
                              <TableCell className="w-36 min-w-[144px] max-w-[144px] sticky left-[144px] z-10 bg-card group-hover:bg-muted/50 border-r border-white/10 font-mono text-xs text-muted-foreground">
                                {m.product.sku}
                              </TableCell>
                              <TableCell className="text-xs truncate max-w-sm">
                                {m.product.name}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs font-semibold text-foreground">
                                US$ {m.newCostUsd.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </SyncedScrollTable>
                  </TabsContent>

                  {/* Aba: Não Casados */}
                  <TabsContent value="unmatched" className="p-0 m-0">
                    <div className="p-4 bg-amber-500/5 border-b border-white/5 text-xs text-amber-400 flex items-center justify-between">
                      <span>
                        Estes itens não existem no catálogo. Ao confirmar, serão enviados para a{' '}
                        <strong>Área de Revisão</strong> com marcador &quot;ScanSource&quot;. Nada é
                        criado em produtos sem sua aprovação de categoria.
                      </span>
                    </div>
                    <SyncedScrollTable maxHeight="420px" minContentWidth="920px">
                      <Table className="min-w-[920px]">
                        <TableHeader className="sticky top-0 z-30 bg-card shadow-sm">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-36 min-w-[144px] max-w-[144px] sticky left-0 z-30 bg-card border-r border-white/10">
                              Modelo
                            </TableHead>
                            <TableHead className="w-72 min-w-[280px] max-w-[280px] sticky left-[144px] z-30 bg-card border-r border-white/10">
                              Descrição
                            </TableHead>
                            <TableHead className="w-28 min-w-[112px]">NCM Sugerida</TableHead>
                            <TableHead className="w-20 min-w-[80px]">Tipo</TableHead>
                            <TableHead className="w-48 min-w-[192px]">Categoria Sugerida</TableHead>
                            <TableHead className="w-32 min-w-[128px] text-right">
                              Preço Coluna D
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredUnmatched.slice(0, 100).map((u, i) => (
                            <TableRow key={i} className="group">
                              <TableCell className="w-36 min-w-[144px] max-w-[144px] sticky left-0 z-10 bg-card group-hover:bg-muted/50 border-r border-white/10 font-mono text-xs font-semibold text-foreground">
                                {u.row.model}
                              </TableCell>
                              <TableCell
                                className="w-72 min-w-[280px] max-w-[280px] sticky left-[144px] z-10 bg-card group-hover:bg-muted/50 border-r border-white/10 text-xs truncate"
                                title={u.row.description}
                              >
                                {u.row.description}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-zinc-300">
                                {u.row.ncmSuggested || '—'}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">
                                  {u.row.itemType}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col text-xs">
                                  <span className="font-semibold text-foreground">
                                    {u.suggestedCategoryName || 'Sem sugestão'}
                                  </span>
                                  <span
                                    className="text-[10px] text-muted-foreground truncate max-w-xs"
                                    title={u.suggestionReason}
                                  >
                                    {u.suggestionReason}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs font-bold text-foreground">
                                {u.row.priceUsdSt !== null
                                  ? `US$ ${u.row.priceUsdSt.toFixed(2)}`
                                  : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </SyncedScrollTable>
                  </TabsContent>

                  {/* Aba: Possíveis correspondências (Assistente de Correspondências) */}
                  <TabsContent value="suggestions" className="p-0 m-0">
                    <div className="p-4 bg-primary/5 border-b border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-muted-foreground">
                      <div>
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-primary" />
                          Assistente de Correspondências (até 5 candidatos por similaridade)
                        </span>
                        <p className="mt-0.5">
                          Normalização de código sem &quot;SONY&quot;, hífens ou sufixos de kit
                          combinada com sobreposição de termos da descrição. Vincular grava o custo
                          nacionalizado USD com vigência{' '}
                          <strong className="text-foreground">{preview.effectiveDate}</strong> e
                          origem &quot;vinculado&quot; na auditoria, sem alterar preço de venda.
                        </p>
                      </div>
                    </div>

                    <SyncedScrollTable maxHeight="500px" minContentWidth="1000px">
                      <Table className="min-w-[1000px]">
                        <TableHeader className="sticky top-0 z-30 bg-card shadow-sm">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-36 min-w-[144px] max-w-[144px] sticky left-0 z-30 bg-card border-r border-white/10">
                              Modelo Planilha
                            </TableHead>
                            <TableHead className="w-64 min-w-[256px] max-w-[256px] sticky left-[144px] z-30 bg-card border-r border-white/10">
                              Descrição
                            </TableHead>
                            <TableHead className="w-28 min-w-[112px] text-right">
                              Custo Col D
                            </TableHead>
                            <TableHead className="min-w-[420px]">
                              Candidatos Sugeridos (Catálogo)
                            </TableHead>
                            <TableHead className="w-36 min-w-[144px] text-right">Ação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredUnmatched.map((u, i) => {
                            const isLinked = !!u.linkedProductId
                            const hasCandidates = u.candidates && u.candidates.length > 0
                            const isLinkingThis = linkingRowIndex === u.row.rowIndex

                            return (
                              <TableRow key={i} className="group align-top">
                                {/* Coluna 1 Fixa: Modelo */}
                                <TableCell className="w-36 min-w-[144px] max-w-[144px] sticky left-0 z-10 bg-card group-hover:bg-muted/50 border-r border-white/10 font-mono text-xs">
                                  <div className="flex flex-col gap-1">
                                    <span className="font-bold text-foreground">{u.row.model}</span>
                                    <Badge
                                      variant="outline"
                                      className="w-fit text-[10px] py-0 bg-white/5 border-white/10 font-mono"
                                    >
                                      Linha {u.row.rowIndex}
                                    </Badge>
                                    {isLinked && (
                                      <Badge className="w-fit bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] py-0 flex items-center gap-1">
                                        <Check className="w-2.5 h-2.5" /> Vinculado
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>

                                {/* Coluna 2 Fixa: Descrição */}
                                <TableCell className="w-64 min-w-[256px] max-w-[256px] sticky left-[144px] z-10 bg-card group-hover:bg-muted/50 border-r border-white/10 text-xs">
                                  <div className="flex flex-col gap-1">
                                    <span
                                      className="line-clamp-2 text-muted-foreground font-medium"
                                      title={u.row.description}
                                    >
                                      {u.row.description}
                                    </span>
                                    {isLinked && (
                                      <span className="text-[10px] text-emerald-400 font-mono truncate">
                                        → {u.linkedProductSku || u.linkedProductName}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>

                                {/* Custo Coluna D */}
                                <TableCell className="text-right font-mono font-bold text-xs text-emerald-400 whitespace-nowrap">
                                  {u.row.priceUsdSt !== null
                                    ? `US$ ${u.row.priceUsdSt.toFixed(2)}`
                                    : '—'}
                                </TableCell>

                                {/* Candidatos Ranqueados */}
                                <TableCell className="text-xs">
                                  {hasCandidates ? (
                                    <div className="space-y-1.5">
                                      {u.candidates.map((cand) => (
                                        <div
                                          key={cand.productId}
                                          className="p-2 rounded bg-background/80 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                        >
                                          <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span className="font-mono font-semibold text-foreground">
                                                {cand.productSku || 'Sem SKU'}
                                              </span>
                                              <span className="text-muted-foreground">•</span>
                                              <span
                                                className="font-medium text-foreground truncate max-w-xs"
                                                title={cand.productName}
                                              >
                                                {cand.productName}
                                              </span>
                                              <Badge
                                                variant="outline"
                                                className="text-[9px] py-0 bg-primary/10 text-primary border-primary/20"
                                              >
                                                {cand.totalScore}%
                                              </Badge>
                                            </div>
                                            <span className="text-[10px] text-muted-foreground mt-0.5">
                                              {cand.matchReason}
                                              {cand.currentCostUsd !== null &&
                                                ` · Custo atual: US$ ${cand.currentCostUsd.toFixed(2)}`}
                                            </span>
                                          </div>

                                          <Button
                                            size="sm"
                                            disabled={isLinkingThis || u.row.priceUsdSt === null}
                                            onClick={() =>
                                              handleLinkCandidate(u.row, cand, u.row.rowIndex)
                                            }
                                            className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shrink-0 self-start sm:self-center"
                                          >
                                            {isLinkingThis ? (
                                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                            ) : (
                                              <Link2 className="w-3 h-3 mr-1" />
                                            )}
                                            Vincular
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground italic text-[11px]">
                                      Nenhum candidato com similaridade suficiente encontrado.
                                    </span>
                                  )}
                                </TableCell>

                                {/* Ação / Status */}
                                <TableCell className="text-right">
                                  {isLinked ? (
                                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[11px]">
                                      Vinculado
                                    </Badge>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground">
                                      Pendente
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </SyncedScrollTable>
                  </TabsContent>

                  {/* Aba: Ausentes no Catálogo */}
                  <TabsContent value="missing" className="p-0 m-0">
                    <div className="p-4 bg-background/50 border-b border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-muted-foreground">
                      <div>
                        <span>
                          Produtos ativos da Sony no catálogo que não apareceram nesta planilha.
                          Eles <strong>permanecem ativos</strong> e não sofrem alteração.
                        </span>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Para cada produto, o sistema busca na tabela linhas com SKU similar
                          (vinculação reversa) ou permite informar custo manual.
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={handleDownloadMissingCsv}>
                        <Download className="w-3.5 h-3.5 mr-1.5" /> Exportar em CSV
                      </Button>
                    </div>
                    <SyncedScrollTable maxHeight="480px" minContentWidth="960px">
                      <Table className="min-w-[960px]">
                        <TableHeader className="sticky top-0 z-30 bg-card shadow-sm">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-36 min-w-[144px] max-w-[144px] sticky left-0 z-30 bg-card border-r border-white/10">
                              SKU
                            </TableHead>
                            <TableHead className="w-64 min-w-[256px] max-w-[256px] sticky left-[144px] z-30 bg-card border-r border-white/10">
                              Nome
                            </TableHead>
                            <TableHead className="w-32 min-w-[128px]">Categoria</TableHead>
                            <TableHead className="w-32 min-w-[128px] text-right">
                              Custo Atual
                            </TableHead>
                            <TableHead className="w-64 min-w-[256px]">
                              Linha Similar na Tabela
                            </TableHead>
                            <TableHead className="w-36 min-w-[144px] text-right">Ação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.missingFromCatalog.slice(0, 100).map((p) => {
                            const topReverse = p.similarTableRows?.[0]
                            return (
                              <TableRow key={p.id} className="group">
                                <TableCell className="w-36 min-w-[144px] max-w-[144px] sticky left-0 z-10 bg-card group-hover:bg-muted/50 border-r border-white/10 font-mono text-xs font-semibold">
                                  {p.sku}
                                </TableCell>
                                <TableCell
                                  className="w-64 min-w-[256px] max-w-[256px] sticky left-[144px] z-10 bg-card group-hover:bg-muted/50 border-r border-white/10 text-xs truncate"
                                  title={p.name}
                                >
                                  {p.name}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {p.category}
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs">
                                  {p.price_nationalized_cost !== null
                                    ? `US$ ${p.price_nationalized_cost.toFixed(2)}`
                                    : '—'}
                                </TableCell>
                                <TableCell>
                                  {topReverse ? (
                                    <div className="flex flex-col text-xs gap-0.5">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-bold text-foreground">
                                          {topReverse.tableModel}
                                        </span>
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] py-0 bg-primary/5 text-primary border-primary/20"
                                        >
                                          {topReverse.totalScore}%
                                        </Badge>
                                        <span className="font-mono text-emerald-400 text-xs font-semibold">
                                          {topReverse.priceUsdSt !== null
                                            ? `US$ ${topReverse.priceUsdSt.toFixed(2)}`
                                            : ''}
                                        </span>
                                      </div>
                                      <span
                                        className="text-[10px] text-muted-foreground truncate max-w-xs"
                                        title={topReverse.description}
                                      >
                                        {topReverse.description}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">
                                      Nenhuma linha similar
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {topReverse && topReverse.priceUsdSt !== null && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px] border-primary/30 text-primary hover:bg-primary/10"
                                        title={`Vincular à linha ${topReverse.tableModel} (US$ ${topReverse.priceUsdSt.toFixed(2)})`}
                                        onClick={() =>
                                          handleLinkCandidate(
                                            {
                                              rowIndex: topReverse.sheetRowIndex,
                                              model: topReverse.tableModel,
                                              description: topReverse.description,
                                              priceUsdSt: topReverse.priceUsdSt,
                                            },
                                            {
                                              productId: p.id,
                                              productName: p.name,
                                              productSku: p.sku,
                                            },
                                            topReverse.sheetRowIndex,
                                          )
                                        }
                                      >
                                        <Link2 className="w-3 h-3 mr-1" />
                                        Vincular
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2 text-[11px] text-foreground hover:bg-white/5"
                                      onClick={() => {
                                        setManualCostModalProduct(p)
                                        setManualCostValue(
                                          p.price_nationalized_cost !== null
                                            ? String(p.price_nationalized_cost)
                                            : '',
                                        )
                                      }}
                                    >
                                      <DollarSign className="w-3 h-3 mr-1" />
                                      Informar custo
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </SyncedScrollTable>
                  </TabsContent>

                  {/* Aba: Anomalias */}
                  <TabsContent value="anomalies" className="p-0 m-0">
                    <div className="p-4 bg-red-500/5 border-b border-white/5 text-xs text-red-400">
                      Linhas com preço zerado, negativo ou ausente na Coluna D. Elas{' '}
                      <strong>não alteram</strong> o custo existente do produto.
                    </div>
                    <SyncedScrollTable maxHeight="420px" minContentWidth="760px">
                      <Table className="min-w-[760px]">
                        <TableHeader className="sticky top-0 z-30 bg-card shadow-sm">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-24 min-w-[96px] max-w-[96px] sticky left-0 z-30 bg-card border-r border-white/10">
                              Linha
                            </TableHead>
                            <TableHead className="w-36 min-w-[144px] max-w-[144px] sticky left-[96px] z-30 bg-card border-r border-white/10">
                              Modelo
                            </TableHead>
                            <TableHead className="min-w-[280px]">Descrição</TableHead>
                            <TableHead className="w-48 min-w-[192px]">Motivo da Anomalia</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.anomalies.map((a, i) => (
                            <TableRow key={i} className="group">
                              <TableCell className="w-24 min-w-[96px] max-w-[96px] sticky left-0 z-10 bg-card group-hover:bg-muted/50 border-r border-white/10 font-mono text-xs text-muted-foreground">
                                {a.rowIndex}
                              </TableCell>
                              <TableCell className="w-36 min-w-[144px] max-w-[144px] sticky left-[96px] z-10 bg-card group-hover:bg-muted/50 border-r border-white/10 font-mono text-xs font-semibold">
                                {a.model}
                              </TableCell>
                              <TableCell className="text-xs truncate max-w-sm">
                                {a.description}
                              </TableCell>
                              <TableCell className="text-xs text-red-400">
                                {a.anomalyReason || 'Preço inválido'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </SyncedScrollTable>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Bloco 3: Relatório Pós-Execução */}
        {executionResult && (
          <Card className="border-emerald-500/30 bg-emerald-500/5 animate-fade-in">
            <CardHeader>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
                <div>
                  <CardTitle className="text-lg text-emerald-400">
                    Tabela de Preços ScanSource Gravada com Sucesso!
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Vigência: <strong>{executionResult.effectiveDate}</strong> · Registro de
                    auditoria salvo no banco de dados.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-background/50 border border-white/5">
                  <p className="text-xs text-muted-foreground">Custos Atualizados</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">
                    {executionResult.updatedProductsCount}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-background/50 border border-white/5">
                  <p className="text-xs text-muted-foreground">Custos Inalterados</p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {executionResult.unchangedProductsCount}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-background/50 border border-white/5">
                  <p className="text-xs text-muted-foreground">Itens em Revisão</p>
                  <p className="text-2xl font-bold text-amber-400 mt-1">
                    {executionResult.stagingCreatedCount}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-background/50 border border-white/5">
                  <p className="text-xs text-muted-foreground">3RD Ignorados</p>
                  <p className="text-2xl font-bold text-zinc-300 mt-1">
                    {executionResult.ignored3rdCount}
                  </p>
                </div>
              </div>

              {preview && preview.missingFromCatalog.length > 0 && (
                <div className="p-4 rounded-xl border border-white/10 bg-background/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Relatório de Produtos Ausentes na Tabela ({preview.missingFromCatalog.length}{' '}
                      itens)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Nenhum produto foi desativado. Baixe a lista para conferência da equipe
                      comercial.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={handleDownloadMissingCsv}>
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Baixar CSV dos Ausentes
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button asChild variant="outline">
                  <Link to="/admin/import-review">
                    <Layers className="w-4 h-4 mr-2" /> Ir para Área de Revisão
                  </Link>
                </Button>
                <Button onClick={resetAll} className="bg-primary hover:bg-primary/90">
                  <RefreshCw className="w-4 h-4 mr-2" /> Importar Outra Tabela
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bloco 4: Histórico de Auditorias Recentes */}
        <Card className="border-white/10 bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Histórico de Importações ScanSource
            </CardTitle>
            <CardDescription>
              Registros de auditoria de cada execução de tabela no sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-t border-white/10 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">Data / Hora</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead className="w-32">Vigência</TableHead>
                    <TableHead className="w-24 text-right">Atualizados</TableHead>
                    <TableHead className="w-24 text-right">Inalterados</TableHead>
                    <TableHead className="w-24 text-right">Pendentes</TableHead>
                    <TableHead className="w-24 text-right">3RD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentAudits.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-20 text-center text-muted-foreground text-xs"
                      >
                        Nenhuma importação ScanSource registrada até o momento.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentAudits.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {new Date(a.created_at).toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-foreground">
                          {a.file_name}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {a.effective_date || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono text-emerald-400 font-semibold">
                          {a.updated_count || 0}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono text-muted-foreground">
                          {a.unchanged_count || 0}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono text-amber-400">
                          {a.staging_pending_count || 0}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono text-zinc-400">
                          {a.ignored_3rd_count || 0}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Modal de Confirmação Final */}
        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent className="max-w-md bg-card border-white/10">
            <DialogHeader>
              <DialogTitle>Confirmar Gravação da Tabela ScanSource?</DialogTitle>
              <DialogDescription>
                Você está prestes a gravar a tabela com vigência{' '}
                <strong className="text-foreground">{preview?.effectiveDate}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs text-muted-foreground">
              <div className="p-3 rounded-lg bg-background/50 border border-white/5 space-y-1.5">
                <p className="flex justify-between">
                  <span>Produtos casados a atualizar:</span>
                  <strong className="text-emerald-400 font-mono">
                    {preview?.matchedWithChangeCount}
                  </strong>
                </p>
                <p className="flex justify-between">
                  <span>Produtos casados inalterados:</span>
                  <strong className="text-foreground font-mono">
                    {preview?.matchedUnchangedCount}
                  </strong>
                </p>
                <p className="flex justify-between">
                  <span>Produtos novos enviados para revisão:</span>
                  <strong className="text-amber-400 font-mono">{preview?.unmatchedCount}</strong>
                </p>
                <p className="flex justify-between">
                  <span>Linhas 3RD descartadas:</span>
                  <strong className="text-zinc-400 font-mono">{preview?.ignored3rdCount}</strong>
                </p>
              </div>

              <p className="text-[11px] text-zinc-400">
                Lembrete: O preço de venda (<span className="font-mono">price_usd</span> / vitrine)
                nunca é alterado por esta importação.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleExecuteImport}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Confirmar e Gravar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Informar Custo Nacionalizado Manual */}
        <Dialog
          open={!!manualCostModalProduct}
          onOpenChange={(open) => {
            if (!open) {
              setManualCostModalProduct(null)
              setManualCostValue('')
            }
          }}
        >
          <DialogContent className="max-w-md bg-card border-white/10">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                Informar Custo Nacionalizado Manual
              </DialogTitle>
              <DialogDescription>
                Produto: <strong className="text-foreground">{manualCostModalProduct?.name}</strong>{' '}
                ({manualCostModalProduct?.sku || 'Sem SKU'})
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="p-3 rounded-lg bg-background/50 border border-white/5 space-y-1">
                <p className="text-muted-foreground">
                  Vigência da tabela:{' '}
                  <strong className="text-foreground">
                    {preview?.effectiveDate || 'JAN 2nd 2025'}
                  </strong>
                </p>
                <p className="text-muted-foreground">
                  Origem na auditoria: <strong className="text-foreground font-mono">manual</strong>
                </p>
                <p className="text-[11px] text-zinc-400">
                  Preenchimento opcional. Itens sem custo permanecem sem custo nacionalizado, sem
                  qualquer bloqueio. O preço de venda nunca é alterado.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Custo Nacionalizado (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-mono">
                    US$
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 1450.00 (opcional)"
                    className="pl-10 text-xs font-mono bg-background/60 border-white/10"
                    value={manualCostValue}
                    onChange={(e) => setManualCostValue(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                disabled={isSavingManualCost}
                onClick={() => {
                  setManualCostModalProduct(null)
                  setManualCostValue('')
                }}
              >
                Cancelar
              </Button>
              <Button
                disabled={isSavingManualCost}
                onClick={handleSaveManualCost}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSavingManualCost ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Gravar Custo Manual
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  )
}

export default AdminScanSourcePage
