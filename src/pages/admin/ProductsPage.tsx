import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Link } from 'react-router-dom'
import { productService } from '@/services/productService'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Plus, Upload } from 'lucide-react'

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({
    current: 0,
    total: 0,
    currentName: '',
    manufacturer: '',
  })
  const [successfulImports, setSuccessfulImports] = useState<any[]>([])
  const [showReviewModal, setShowReviewModal] = useState(false)

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    setProducts(data || [])
    setIsLoading(false)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const urls = text
      .split(/[\r\n]+/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('http'))

    if (urls.length === 0) {
      toast({ description: 'Nenhuma URL válida encontrada no arquivo CSV', variant: 'destructive' })
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setIsImporting(true)
    setImportProgress({
      current: 0,
      total: urls.length,
      currentName: 'Iniciando...',
      manufacturer: '',
    })
    const successes = []

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]
      setImportProgress((prev) => ({
        ...prev,
        current: i + 1,
        currentName: 'Buscando URL...',
        manufacturer: '',
      }))

      try {
        const data = await productService.extractProductFromUrl(url)
        if (data && !data.error) {
          setImportProgress((prev) => ({
            ...prev,
            currentName: data.name || url,
            manufacturer: data.extracted_brand || 'Desconhecido',
          }))
          successes.push({ ...data, original_url: url })
        }
      } catch (err: any) {
        console.error('Failed to extract:', url, err)
        toast({ description: `Falha ao extrair ${url}: ${err.message}`, variant: 'destructive' })
      }
    }

    setSuccessfulImports(successes)
    setIsImporting(false)
    if (successes.length > 0) {
      setShowReviewModal(true)
    } else {
      toast({ description: 'Nenhum produto foi extraído com sucesso.', variant: 'destructive' })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSaveImports = async () => {
    setIsImporting(true)
    let savedCount = 0
    for (const item of successfulImports) {
      try {
        const payload = {
          name: item.name,
          sku: item.sku,
          manufacturer_id: item.manufacturer_id || null,
          price_usa: parseFloat(item.price_usa) || 0,
          price_cost: parseFloat(item.price_cost) || 0,
          description: item.description || '',
          technical_info: item.technical_info || '',
          category_id: item.category_id || null,
          image_url: item.image_url || '',
          weight: parseFloat(item.weight) || 0,
          dimensions: item.dimensions || '',
          stock: parseInt(item.stock, 10) || 0,
          is_discontinued: item.is_discontinued === 'true' || item.is_discontinued === true,
        }

        const exists = await productService.checkSkuExists(payload.sku)
        if (!exists) {
          await productService.createProduct(payload)
          savedCount++
        }
      } catch (err) {
        console.error('Error saving imported product:', err)
      }
    }
    toast({ description: `${savedCount} produtos importados e salvos com sucesso!` })
    setShowReviewModal(false)
    setIsImporting(false)
    loadProducts()
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Produtos</h1>
        <div className="flex items-center gap-4">
          <input
            type="file"
            accept=".csv,.txt"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            <Upload className="mr-2 h-4 w-4" />
            Importar B&H (CSV)
          </Button>
          <Link to="/products/new">
            <Button disabled={isImporting}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Produto
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Preço (USD)</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Nenhum produto cadastrado
                  </TableCell>
                </TableRow>
              )}
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium max-w-[300px] truncate" title={p.name}>
                    {p.name}
                  </TableCell>
                  <TableCell>{p.sku}</TableCell>
                  <TableCell>${p.price_usd}</TableCell>
                  <TableCell className="text-right">
                    <Link to={`/products/edit/${p.id}`}>
                      <Button variant="ghost" size="sm">
                        Editar
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {isImporting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card border p-8 rounded-xl shadow-lg text-center flex flex-col items-center max-w-sm w-full">
            <Loader2 className="h-10 w-10 animate-spin mb-6 text-primary" />
            <h2 className="text-xl font-semibold mb-2">Processando Importação</h2>
            <div className="w-full bg-secondary rounded-full h-2 mb-4">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-sm font-medium mb-1">
              Produto {importProgress.current} de {importProgress.total}
            </p>
            <p className="text-sm text-muted-foreground truncate w-full">
              {importProgress.currentName}
            </p>
            {importProgress.manufacturer && (
              <p className="text-xs text-muted-foreground mt-1 truncate w-full">
                Marca: {importProgress.manufacturer}
              </p>
            )}
          </div>
        </div>
      )}

      <Dialog
        open={showReviewModal}
        onOpenChange={(open) => !isImporting && setShowReviewModal(open)}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Revisão de Importação</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            <p className="mb-4 text-sm text-muted-foreground">
              Foram extraídos {successfulImports.length} produtos com sucesso. Revise a lista abaixo
              antes de salvar.
            </p>
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Marca Extraída</TableHead>
                    <TableHead>Preço (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {successfulImports.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="truncate max-w-[200px]" title={item.name}>
                        {item.name}
                      </TableCell>
                      <TableCell>{item.sku}</TableCell>
                      <TableCell>{item.extracted_brand || '-'}</TableCell>
                      <TableCell>${item.price_usa}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowReviewModal(false)}
              disabled={isImporting}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveImports} disabled={isImporting}>
              {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar Todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
