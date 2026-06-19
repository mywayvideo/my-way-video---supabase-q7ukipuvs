import { useState, useRef, DragEvent } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Upload, Plus, CheckCircle2 } from 'lucide-react'
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
}

const normalizeSkuForComparison = (sku: string) => {
  return sku.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
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
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleReset = () => {
    setFile(null)
    setReport(null)
    setStep('SELECT')
    setIsDragging(false)
    if (!isUploading && !isAnalyzing) setOpen(false)
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
    setProgressMsg('Importando produtos...')

    try {
      let invalidImagesCount = 0

      const validateImageUrl = (url: string): Promise<boolean> => {
        return new Promise((resolve) => {
          const img = new Image()
          const timeoutId = setTimeout(() => {
            img.src = ''
            resolve(false)
          }, 15000)

          img.onload = () => {
            clearTimeout(timeoutId)
            resolve(true)
          }

          img.onerror = () => {
            clearTimeout(timeoutId)
            resolve(false)
          }

          img.src = url
        })
      }

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

      if (report.rowsToCreate.length > 0) {
        const productsToInsert = report.rowsToCreate.map(parseRow)
        for (const prod of productsToInsert) {
          if (
            prod.image_url &&
            typeof prod.image_url === 'string' &&
            prod.image_url.trim() !== ''
          ) {
            setProgressMsg(`Validando imagem para ${prod.name || prod.sku}...`)
            const isValid = await validateImageUrl(prod.image_url)
            if (!isValid) {
              console.warn(`Imagem invalida para produto ${prod.name || prod.sku}. URL removida.`)
              prod.image_url = null
              invalidImagesCount++
            }
          }
        }
        setProgressMsg('Importando produtos...')
        const { error } = await supabase.from('products').insert(productsToInsert)
        if (error) throw error
      }

      if (report.rowsToUpdate.length > 0) {
        for (const p of report.rowsToUpdate) {
          const dbId = p._dbId
          const prod = parseRow(p)

          if (
            prod.image_url &&
            typeof prod.image_url === 'string' &&
            prod.image_url.trim() !== ''
          ) {
            setProgressMsg(`Validando imagem para ${prod.name || prod.sku}...`)
            const isValid = await validateImageUrl(prod.image_url)
            if (!isValid) {
              console.warn(`Imagem invalida para produto ${prod.name || prod.sku}. URL removida.`)
              prod.image_url = null
              invalidImagesCount++
            }
          }

          const { sku, manufacturer_id, ...updates } = prod
          setProgressMsg(`Atualizando produto ${prod.name || prod.sku}...`)
          const { error } = await supabase.from('products').update(updates).eq('id', dbId)
          if (error) throw error
        }
      }

      toast({
        title: 'Sucesso',
        description: `Importacao concluida. ${report.rowsToCreate.length + report.rowsToUpdate.length} produtos importados. ${invalidImagesCount} imagens invalidas removidas.`,
      })
      handleReset()
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
