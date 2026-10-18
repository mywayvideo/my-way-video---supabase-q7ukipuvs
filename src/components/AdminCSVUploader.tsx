import { useState, useRef, DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { persistExternalProductImage } from '@/services/productService'
import { normalizeSkuForBrand, isSonyBrand } from '@/utils/sku-normalize'
import { normalizeSkuKey } from '@/utils/sku-normalization'
import { relatedProductsService } from '@/services/relatedProductsService'
import {
  categoryImportStagingService,
  StagingProductItem,
} from '@/services/categoryImportStagingService'
import { CategoryItem } from '@/services/categoryTriageService'
import { Button } from '@/components/ui/button'
import { Upload, Plus, CheckCircle2, Sparkles, ExternalLink, ArrowRight } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Manufacturer } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { AdminManufacturerDialog } from './AdminManufacturerDialog'
import { cn } from '@/lib/utils'

interface Props {
  manufacturers: Manufacturer[]
  onSuccess: () => void
  onAddManufacturer: () => void
}

interface ReportData {
  totalRows: number
  rowsToCreate: any[]
  rowsToUpdate: any[]
  invalidRows: { row: number; sku: string; reason: string }[]
  duplicates: { row: number; incomingSku: string; dbSku: string }[]
  discontinuedUpdates?: number
  discontinuedSetActive?: number
  discontinuedSetDiscontinued?: number
  batchExecution?: {
    batchId: string
    directMatchedCount: number
    stagingCount: number
    discardedCount: number
    updatedCount: number
  }
}

const normalizeSkuForComparison = (sku: string) => {
  return normalizeSkuKey(sku)
}

export function AdminCSVUploader({ manufacturers, onSuccess, onAddManufacturer }: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'SELECT' | 'REPORT'>('SELECT')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [mfgId, setMfgId] = useState<string>('')
  const [showMfgDialog, setShowMfgDialog] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ReportData | null>(null)
  const [relatedPipelineSummary, setRelatedPipelineSummary] = useState<{
    autoApplied: number
    pendingReview: number
  } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleReset = () => {
    setFile(null)
    setReport(null)
    setStep('SELECT')
    setOpen(false)
    setProgressMsg('')
    setRelatedPipelineSummary(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  const handleFile = (f: File | null) => {
    if (!f) {
      setFile(null)
      return
    }

    if (f.type !== 'text/csv' && !f.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: 'Erro',
        description: 'Apenas arquivos CSV sao aceitos. Verifique o tipo do arquivo.',
        variant: 'destructive',
      })
      return
    }

    if (f.size > 10 * 1024 * 1024) {
      toast({
        title: 'Erro',
        description: 'Arquivo muito grande. Maximo 10MB.',
        variant: 'destructive',
      })
      return
    }

    setFile(f)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFile = e.dataTransfer.files?.[0]
    handleFile(droppedFile || null)
  }

  const analyzeFile = async () => {
    if (!file || !mfgId) return
    setIsAnalyzing(true)

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string
        const lines = text
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
        if (lines.length < 2) throw new Error('CSV inválido ou vazio')

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
        const hasSku = headers.includes('sku')

        if (!hasSku) {
          throw new Error('Arquivo invalido. Coluna SKU obrigatoria.')
        }

        if (headers.length === 1) {
          throw new Error(
            'Arquivo invalido. SKU sozinho nao e permitido. Use criacao (SKU+nome) ou atualizacao (SKU+coluna)',
          )
        }

        const selectedMfg = manufacturers.find((m) => m.id === mfgId)
        const mfgName = selectedMfg?.name || ''
        const isSony = isSonyBrand(mfgName)

        const { data: existingProducts, error: dbError } = await supabase
          .from('products')
          .select('id, sku')
          .eq('manufacturer_id', mfgId)

        if (dbError) throw new Error('Erro ao verificar SKUs. Tente novamente.')

        const dbSkuMap = new Map<string, { id: string; sku: string }>()
        existingProducts.forEach((p) => {
          if (p.sku) dbSkuMap.set(normalizeSkuForComparison(p.sku), { id: p.id, sku: p.sku })
        })

        const rowsToCreate: any[] = []
        const rowsToUpdate: any[] = []
        const invalidRows: { row: number; sku: string; reason: string }[] = []
        const duplicates: { row: number; incomingSku: string; dbSku: string }[] = []
        const processedSkus = new Set<string>()

        let discontinuedUpdates = 0
        let discontinuedSetActive = 0
        let discontinuedSetDiscontinued = 0

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i]
          const values = line
            .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
            .map((v) => v.replace(/^"|"$/g, '').trim())
          const rowData: any = {}
          let rowSku = ''

          headers.forEach((h, index) => {
            let val = values[index] || null
            rowData[h] = val
            if (h === 'sku') rowSku = val || ''
          })

          if (!rowSku) {
            invalidRows.push({ row: i + 1, sku: 'VAZIO', reason: 'SKU ausente' })
            continue
          }

          // Se marca for Sony, normaliza o SKU da linha (remove traço/hífen, uppercase, trim)
          if (isSony) {
            const normalizedSony = normalizeSkuForBrand(rowSku, mfgName)
            if (normalizedSony) {
              rowSku = normalizedSony
              rowData.sku = normalizedSony
            }
          }

          const hasDiscontinued = 'discontinued' in rowData
          if (
            hasDiscontinued &&
            rowData['discontinued'] !== null &&
            rowData['discontinued'] !== ''
          ) {
            const d = String(rowData['discontinued']).trim().toLowerCase()
            if (['true', '1', 'yes'].includes(d)) {
              rowData.is_discontinued = true
            } else if (['false', '0', 'no'].includes(d)) {
              rowData.is_discontinued = false
            } else {
              invalidRows.push({
                row: i + 1,
                sku: rowSku,
                reason: 'Valor invalido para DISCONTINUED. Use TRUE ou FALSE.',
              })
              continue
            }
          }

          if ('is_discontinued' in rowData && typeof rowData.is_discontinued !== 'boolean') {
            if (rowData.is_discontinued !== null && rowData.is_discontinued !== '') {
              const val = String(rowData.is_discontinued).trim().toLowerCase()
              rowData.is_discontinued = ['true', '1', 'yes', 'sim'].includes(val)
            } else {
              delete rowData.is_discontinued
            }
          }

          try {
            const normalizedSku = normalizeSkuForComparison(rowSku)

            if (processedSkus.has(normalizedSku)) {
              duplicates.push({ row: i + 1, incomingSku: rowSku, dbSku: rowSku })
              invalidRows.push({ row: i + 1, sku: rowSku, reason: 'SKU duplicado no CSV' })
              continue
            }
            processedSkus.add(normalizedSku)

            const existing = dbSkuMap.get(normalizedSku)

            if (!existing) {
              if (!rowData.name) {
                invalidRows.push({
                  row: i + 1,
                  sku: rowSku,
                  reason: 'Nome obrigatorio para novos produtos',
                })
                continue
              }
              rowsToCreate.push(rowData)
              if (rowData.is_discontinued !== undefined) {
                discontinuedUpdates++
                if (rowData.is_discontinued === false) discontinuedSetActive++
                else if (rowData.is_discontinued === true) discontinuedSetDiscontinued++
              }
            } else {
              const hasOtherColumns = Object.keys(rowData).some(
                (k) => k !== 'sku' && rowData[k] !== null && rowData[k] !== '',
              )
              if (!hasOtherColumns) {
                invalidRows.push({
                  row: i + 1,
                  sku: rowSku,
                  reason: 'Inclua SKU e pelo menos uma coluna para atualizar',
                })
                continue
              }
              rowData._dbId = existing.id
              rowsToUpdate.push(rowData)
              if (rowData.is_discontinued !== undefined) {
                discontinuedUpdates++
                if (rowData.is_discontinued === false) discontinuedSetActive++
                else if (rowData.is_discontinued === true) discontinuedSetDiscontinued++
              }
            }
          } catch (err) {
            invalidRows.push({ row: i + 1, sku: rowSku, reason: 'Erro ao normalizar SKU' })
          }
        }

        setReport({
          totalRows: lines.length - 1,
          rowsToCreate,
          rowsToUpdate,
          invalidRows,
          duplicates,
          discontinuedUpdates,
          discontinuedSetActive,
          discontinuedSetDiscontinued,
        })
        setStep('REPORT')
      } catch (err: any) {
        if (err.message === 'Erro ao verificar SKUs. Tente novamente.') {
          toast({
            title: err.message,
            variant: 'destructive',
          })
        } else {
          toast({
            title: 'Erro na validacao. Verifique o arquivo.',
            description: err.message,
            variant: 'destructive',
          })
        }
        setFile(null)
      } finally {
        setIsAnalyzing(false)
      }
    }
    reader.readAsText(file)
  }

  const processImport = async () => {
    if (!report || (report.rowsToCreate.length === 0 && report.rowsToUpdate.length === 0)) return
    setIsUploading(true)
    setProgressMsg('Preparando importação e checagem de categorias...')

    try {
      let imagesPersistedCount = 0

      // Carregar categorias ativas e mapeamentos persistidos
      const [{ data: dbCategories }, mappings] = await Promise.all([
        supabase.from('categories').select('id, name').order('name'),
        categoryImportStagingService.getCategoryMappings(),
      ])

      const categoriesList: CategoryItem[] = (dbCategories || []).map((c) => ({
        id: c.id,
        name: c.name,
      }))

      const batchId = `csv_${Date.now()}`
      const selectedMfg = manufacturers.find((m) => m.id === mfgId)
      const brandName = selectedMfg?.name || ''

      const parseRow = (p: any) => {
        const prod: any = { manufacturer_id: mfgId }
        Object.entries(p).forEach(([h, val]: [string, any]) => {
          if (h === '_dbId' || h === 'discontinued') return
          const targetKey = h === 'price_usa' ? 'price_usd' : h
          if (['price_brl', 'price_usd', 'price_cost', 'stock', 'weight'].includes(targetKey)) {
            prod[targetKey] = val ? parseFloat(val) : 0
          } else if (['price_nationalized_sales', 'price_nationalized_cost'].includes(targetKey)) {
            prod[targetKey] = val ? parseFloat(val) : null
          } else if (targetKey === 'price_nationalized_currency') {
            const curr = val ? String(val).trim().toUpperCase() : 'BRL'
            prod[targetKey] = curr === 'USD' ? 'USD' : 'BRL'
          } else if (targetKey === 'is_special' || targetKey === 'is_discontinued') {
            if (typeof val === 'boolean') {
              prod[targetKey] = val
            } else {
              prod[targetKey] =
                val === 'true' ||
                val === '1' ||
                val?.toLowerCase() === 'sim' ||
                val?.toLowerCase() === 'yes'
            }
          } else if (targetKey === 'technical_info') {
            prod[targetKey] = val && val.trim() !== '' ? String(val) : null
          } else if (targetKey !== 'manufacturer' && targetKey !== 'manufacturer_id') {
            prod[targetKey] = val
          }
        })
        return prod
      }

      let directMatchedCount = 0
      let stagingCount = 0
      const discardedCount = 0 // Sempre 0 numa importação nova

      // Tratar criação de produtos novos (dividindo entre casados direto e staging)
      if (report.rowsToCreate.length > 0) {
        const parsedProducts = report.rowsToCreate.map(parseRow)

        // Persistir imagens primeiro
        for (let i = 0; i < parsedProducts.length; i++) {
          const prod = parsedProducts[i]
          if (
            prod.image_url &&
            typeof prod.image_url === 'string' &&
            prod.image_url.trim() !== ''
          ) {
            setProgressMsg(
              `Persistindo imagem ${i + 1}/${parsedProducts.length} (${prod.sku || prod.name})...`,
            )
            try {
              const persistedUrl = await persistExternalProductImage(prod.image_url)
              if (persistedUrl) {
                prod.image_url = persistedUrl
                if (persistedUrl.includes('/storage/v1/object/public/product-images')) {
                  imagesPersistedCount++
                }
              }
            } catch (imgErr) {
              console.warn(`Erro ao persistir imagem do produto ${prod.sku}:`, imgErr)
            }
          }
        }

        const productsToInsertDirect: any[] = []
        const stagingItemsToInsert: Array<Partial<StagingProductItem>> = []

        setProgressMsg('Avaliando categorias informadas e mapeamentos...')
        for (let i = 0; i < parsedProducts.length; i++) {
          const prod = parsedProducts[i]
          const originalCategory = (prod.category || prod.original_category || '').trim()

          const matchResult = categoryImportStagingService.resolveCategoryMatch({
            rawCategory: originalCategory,
            productName: prod.name,
            productDescription: prod.description,
            productNcm: prod.ncm,
            categories: categoriesList,
            mappings,
          })

          if (matchResult.isMatchedDirect && matchResult.matchedCategoryId) {
            // Casado direto: grava em products imediatamente
            productsToInsertDirect.push({
              ...prod,
              category_id: matchResult.matchedCategoryId,
              category: matchResult.matchedCategoryName,
            })
            directMatchedCount++
          } else {
            // Não casado: NÃO grava em products, envia para product_import_staging
            const stagingItem: Partial<StagingProductItem> = {
              batch_id: batchId,
              batch_source: 'csv',
              sku: prod.sku || null,
              name: prod.name,
              manufacturer_id: mfgId || null,
              brand_name: brandName || null,
              price_usd: prod.price_usd || 0,
              price_cost: prod.price_cost || 0,
              price_brl: prod.price_brl || 0,
              weight: prod.weight || 0,
              dimensions: prod.dimensions || null,
              stock: prod.stock || 0,
              ncm: prod.ncm || null,
              image_url: prod.image_url || null,
              description: prod.description || null,
              technical_info: prod.technical_info || null,
              website_url: prod.website_url || null,
              is_special: prod.is_special || false,
              is_discontinued: prod.is_discontinued || false,
              price_nationalized_sales: prod.price_nationalized_sales ?? null,
              price_nationalized_cost: prod.price_nationalized_cost ?? null,
              price_nationalized_currency: prod.price_nationalized_currency || 'BRL',
              price_usa_rebate: prod.price_usa_rebate ?? null,
              price_cost_rebate: prod.price_cost_rebate ?? null,
              date_rebate: prod.date_rebate ?? null,

              original_category: originalCategory || null,
              suggested_category_id: matchResult.suggestedCategoryId,
              suggested_category_name: matchResult.suggestedCategoryName,
              suggestion_confidence: matchResult.confidence,
              suggestion_reason: matchResult.reason,

              status: 'pending',
              raw_payload: prod,
            }

            stagingItemsToInsert.push(stagingItem)
            stagingCount++
          }
        }

        if (productsToInsertDirect.length > 0) {
          setProgressMsg(
            `Gravando ${productsToInsertDirect.length} produtos casados no catálogo...`,
          )
          const { error } = await supabase.from('products').insert(productsToInsertDirect)
          if (error) throw error
        }

        if (stagingItemsToInsert.length > 0) {
          setProgressMsg(
            `Enviando ${stagingItemsToInsert.length} itens para a fila de revisão de importação...`,
          )
          const stagingRes =
            await categoryImportStagingService.insertStagingBatch(stagingItemsToInsert)
          if (!stagingRes.success) {
            console.error('Falha ao inserir itens em staging:', stagingRes.error)
            toast({
              title: 'Aviso sobre Staging',
              description: `Produtos casados foram salvos, mas houve erro ao salvar itens em staging: ${stagingRes.error}`,
              variant: 'destructive',
            })
          }
        }
      }

      if (report.rowsToUpdate.length > 0) {
        for (let i = 0; i < report.rowsToUpdate.length; i++) {
          const p = report.rowsToUpdate[i]
          const dbId = p._dbId
          const prod = parseRow(p)

          if (
            prod.image_url &&
            typeof prod.image_url === 'string' &&
            prod.image_url.trim() !== ''
          ) {
            setProgressMsg(
              `Persistindo imagem ${i + 1}/${report.rowsToUpdate.length} (${prod.sku || prod.name})...`,
            )
            try {
              const persistedUrl = await persistExternalProductImage(prod.image_url, dbId)
              if (persistedUrl) {
                prod.image_url = persistedUrl
                if (persistedUrl.includes('/storage/v1/object/public/product-images')) {
                  imagesPersistedCount++
                }
              }
            } catch (imgErr) {
              console.warn(`Erro ao persistir imagem do produto ${prod.sku}:`, imgErr)
              // Preserva URL externa original
            }
          }

          const { sku, manufacturer_id, ...updates } = prod
          setProgressMsg(`Atualizando produto ${prod.name || prod.sku}...`)
          const { error } = await supabase.from('products').update(updates).eq('id', dbId)
          if (error) throw error
        }
      }

      // Disparar o pipeline de relacionados inteligentes para os produtos processados
      // Buscar IDs criados ou atualizados
      const processedSkus = [
        ...report.rowsToCreate.map((r) => r.sku).filter(Boolean),
        ...report.rowsToUpdate.map((r) => r.sku).filter(Boolean),
      ]

      let autoAppliedCount = 0
      let pendingReviewCount = 0

      if (processedSkus.length > 0) {
        setProgressMsg('Executando pipeline de produtos relacionados inteligentes...')
        try {
          const { data: dbProducts } = await supabase
            .from('products')
            .select('id, sku')
            .in('sku', processedSkus.slice(0, 50)) // Processar até os 50 primeiros do lote

          if (dbProducts && dbProducts.length > 0) {
            for (let i = 0; i < dbProducts.length; i++) {
              const p = dbProducts[i]
              setProgressMsg(`Analisando relacionados ${i + 1}/${dbProducts.length} (${p.sku})...`)
              try {
                const res = await relatedProductsService.generateForProduct(p.id)
                if (res.success && res.ai_related_meta) {
                  Object.values(res.ai_related_meta).forEach((m) => {
                    if (m.confidence === 'alta' || m.confidence === 'media') {
                      autoAppliedCount++
                    } else if (m.confidence === 'baixa') {
                      pendingReviewCount++
                    }
                  })
                }
              } catch (relErr) {
                console.warn(`Erro ao gerar relacionados para SKU ${p.sku}:`, relErr)
              }
            }
          }
        } catch (pipelineErr) {
          console.warn('Erro ao disparar pipeline em lote:', pipelineErr)
        }
      }

      setRelatedPipelineSummary({
        autoApplied: autoAppliedCount,
        pendingReview: pendingReviewCount,
      })

      // Atualizar o report com os dados consolidados do lote
      setReport((prev) =>
        prev
          ? {
              ...prev,
              batchExecution: {
                batchId,
                directMatchedCount,
                stagingCount,
                discardedCount,
                updatedCount: report.rowsToUpdate.length,
              },
            }
          : null,
      )

      toast({
        title: 'Processamento do Lote Concluído',
        description: `Casados direto: ${directMatchedCount} · Aguardando confirmação (staging): ${stagingCount} · Atualizados: ${report.rowsToUpdate.length}`,
      })
      onSuccess()
    } catch (err: any) {
      toast({
        title: 'Erro ao importar. Tente novamente.',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
      setProgressMsg('')
    }
  }

  const downloadReport = () => {
    if (!report) return
    const headers = ['Linha', 'SKU Recebido', 'Operacao', 'Status', 'Motivo']
    const rows = report.rowsToCreate.map((r) => `"", "${r.sku}", "CREATE", "Valido", "Pronto"`)
    rows.push(...report.rowsToUpdate.map((r) => `"", "${r.sku}", "UPDATE", "Valido", "Pronto"`))
    report.invalidRows.forEach((r) => {
      rows.push(`"${r.row}", "${r.sku}", "INVALID", "Invalido", "${r.reason}"`)
    })
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `relatorio-importacao-${Date.now()}.csv`
    link.click()
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(val) => {
          if (!val) handleReset()
          else setOpen(true)
        }}
      >
        <DialogTrigger asChild>
          <Button variant="secondary">
            <Upload className="w-4 h-4 mr-2" /> Importar CSV
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md bg-card border-white/10">
          <DialogHeader>
            <DialogTitle>Importar Catálogo</DialogTitle>
          </DialogHeader>

          {step === 'SELECT' ? (
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label>1. Selecione o Fabricante</Label>
                <div className="flex gap-2">
                  <Select value={mfgId} onValueChange={setMfgId}>
                    <SelectTrigger className="bg-background/50 border-white/10 flex-1">
                      <SelectValue placeholder="Escolha um fabricante..." />
                    </SelectTrigger>
                    <SelectContent>
                      {manufacturers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowMfgDialog(true)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>2. Selecione o Arquivo CSV</Label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'border-2 rounded-xl p-6 flex flex-col items-center justify-center transition-colors cursor-pointer text-muted-foreground text-center',
                    isDragging
                      ? 'border-primary border-solid bg-primary/10 text-primary'
                      : 'border-white/20 border-dashed hover:bg-white/5',
                  )}
                >
                  <Upload className={cn('w-8 h-8 mb-3', isDragging ? 'animate-bounce' : '')} />
                  {file ? (
                    <p className="font-medium text-foreground text-sm">{file.name}</p>
                  ) : (
                    <p className="text-sm">Arraste um arquivo CSV aqui ou clique para selecionar</p>
                  )}
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(e) => {
                      handleFile(e.target.files?.[0] || null)
                      if (e.target) e.target.value = ''
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            report && (
              <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
                <div className="p-4 border rounded-lg bg-muted/20 space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-primary" /> Relatório de Validação
                  </h3>
                  <p className="text-sm">
                    Operação: <strong>Auto-Detectada</strong>
                  </p>
                  <p className="text-sm">
                    Total de linhas processadas: <strong>{report.totalRows}</strong>
                  </p>
                  <p className="text-sm text-green-500">
                    Prontos para CRIAR: <strong>{report.rowsToCreate.length}</strong>
                  </p>
                  <p className="text-sm text-blue-500">
                    Prontos para ATUALIZAR: <strong>{report.rowsToUpdate.length}</strong>
                  </p>
                  <p className="text-sm text-red-500">
                    Linhas inválidas: <strong>{report.invalidRows.length}</strong>
                  </p>
                  <p className="text-sm text-orange-500">
                    SKUs duplicados no CSV: <strong>{report.duplicates.length}</strong>
                  </p>

                  {/* Relatório de Fechamento do Lote após Execução */}
                  {report.batchExecution && (
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-2 bg-background/50 p-3 rounded-md">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                          Fechamento do Lote
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {report.batchExecution.batchId}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-1 text-xs">
                        <div className="flex justify-between py-1 border-b border-white/5">
                          <span className="text-emerald-400 font-medium">
                            Casados direto (entraram em products):
                          </span>
                          <strong className="text-emerald-400">
                            {report.batchExecution.directMatchedCount}
                          </strong>
                        </div>
                        <div className="flex justify-between py-1 border-b border-white/5">
                          <span className="text-amber-400 font-medium">
                            Aguardando confirmação (staging):
                          </span>
                          <strong className="text-amber-400">
                            {report.batchExecution.stagingCount}
                          </strong>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-zinc-400 font-medium">Descartados:</span>
                          <strong className="text-zinc-400">
                            {report.batchExecution.discardedCount}
                          </strong>
                        </div>
                      </div>

                      {report.batchExecution.stagingCount > 0 && (
                        <div className="pt-2">
                          <Button
                            asChild
                            size="sm"
                            className="w-full bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30"
                          >
                            <Link to="/admin/import-review" onClick={() => setOpen(false)}>
                              Ir para Revisão de Importação ({report.batchExecution.stagingCount}{' '}
                              pendentes)
                              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                            </Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {report.discontinuedUpdates !== undefined && report.discontinuedUpdates > 0 && (
                    <>
                      <div className="border-t border-white/10 my-2 pt-2"></div>
                      <p className="text-sm">
                        Rows updating discontinued status:{' '}
                        <strong>{report.discontinuedUpdates}</strong>
                      </p>
                      <p className="text-sm text-green-500">
                        Rows setting to active: <strong>{report.discontinuedSetActive}</strong>
                      </p>
                      <p className="text-sm text-orange-500">
                        Rows setting to discontinued:{' '}
                        <strong>{report.discontinuedSetDiscontinued}</strong>
                      </p>
                    </>
                  )}

                  {relatedPipelineSummary && (
                    <>
                      <div className="border-t border-white/10 my-2 pt-2"></div>
                      <h4 className="font-semibold text-xs text-primary flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" /> Relacionados Inteligentes
                      </h4>
                      <p className="text-xs text-emerald-400">
                        ✔ {relatedPipelineSummary.autoApplied} sugestões de alta/média confiança
                        aplicadas automaticamente
                      </p>
                      <p className="text-xs text-amber-400">
                        ? {relatedPipelineSummary.pendingReview} sugestões aguardando revisão em
                        /admin/related-review
                      </p>
                    </>
                  )}
                </div>

                {report.invalidRows.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Problemas Encontrados:</h4>
                    <div className="text-xs space-y-1 bg-destructive/10 p-3 rounded-md border border-destructive/20 max-h-40 overflow-y-auto">
                      {report.invalidRows.map((inv, idx) => {
                        return (
                          <div key={idx} className="flex gap-2">
                            <span className="font-mono w-8 shrink-0">L{inv.row}</span>
                            <span
                              className="font-mono text-muted-foreground w-20 truncate"
                              title={inv.sku}
                            >
                              {inv.sku}
                            </span>
                            <span className="text-destructive font-medium">- {inv.reason}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <Button variant="outline" size="sm" onClick={downloadReport} className="w-full">
                  Baixar Relatório (CSV)
                </Button>
              </div>
            )
          )}

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={handleReset} disabled={isUploading || isAnalyzing}>
              Cancelar
            </Button>
            {step === 'SELECT' ? (
              <Button onClick={analyzeFile} disabled={isAnalyzing || !file || !mfgId}>
                {isAnalyzing ? 'Analisando...' : 'Analisar Arquivo'}
              </Button>
            ) : report?.batchExecution ? (
              <Button onClick={handleReset}>Fechar</Button>
            ) : (
              <Button
                onClick={processImport}
                disabled={
                  isUploading ||
                  (report?.rowsToCreate.length === 0 && report?.rowsToUpdate.length === 0)
                }
              >
                {isUploading ? progressMsg || 'Processando...' : 'Confirmar Importação'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AdminManufacturerDialog
        open={showMfgDialog}
        onOpenChange={setShowMfgDialog}
        onSuccess={(id) => {
          onAddManufacturer()
          setMfgId(id)
          setShowMfgDialog(false)
        }}
      />
    </>
  )
}
