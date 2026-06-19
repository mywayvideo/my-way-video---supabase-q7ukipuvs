import { useState, useEffect } from 'react'
import { useProductForm } from '@/hooks/useProductForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, Download, Loader2, Sparkles, Plus, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase/client'
import { ScrollArea } from '@/components/ui/scroll-area'

export default function NewProductPage() {
  const navigate = useNavigate()
  const [importUrl, setImportUrl] = useState('')
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
  const [isManufacturerDialogOpen, setIsManufacturerDialogOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newManufacturerName, setNewManufacturerName] = useState('')
  const [searchRelated, setSearchRelated] = useState('')

  const {
    form,
    categories,
    manufacturers,
    isLoadingCategories,
    isLoadingManufacturers,
    isLoadingProduct,
    isExtracting,
    isSaving,
    handleExtractUrl,
    handleSuggestNcm,
    ncmSuggestions,
    setNcmSuggestions,
    isSuggestingNcm,
    onSubmit,
    isEditMode,
    handleAddCategory,
    handleAddManufacturer,
  } = useProductForm()

  const [allProducts, setAllProducts] = useState<
    { id: string; name: string; sku: string | null }[]
  >([])

  useEffect(() => {
    supabase
      .from('products')
      .select('id, name, sku')
      .then(({ data }) => {
        if (data) setAllProducts(data)
      })
  }, [])

  const imageUrl = form.watch('image_url')
  const [debouncedImageUrl, setDebouncedImageUrl] = useState(imageUrl || '')
  const [imageStatus, setImageStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedImageUrl(imageUrl || ''), 500)
    return () => clearTimeout(timer)
  }, [imageUrl])

  useEffect(() => {
    if (!debouncedImageUrl) {
      setImageStatus('idle')
      return
    }
    setImageStatus('loading')
    const img = new Image()
    img.onload = () => setImageStatus('success')
    img.onerror = () => setImageStatus('error')
    img.src = debouncedImageUrl
  }, [debouncedImageUrl])

  if (isLoadingCategories || isLoadingManufacturers || isLoadingProduct) {
    return (
      <div className="container mx-auto py-8 max-w-4xl space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const isBusy = isExtracting || isSaving

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return
    const success = await handleAddCategory(newCategoryName.trim())
    if (success) {
      setNewCategoryName('')
      setIsCategoryDialogOpen(false)
    }
  }

  const handleCreateManufacturer = async () => {
    if (!newManufacturerName.trim()) return
    const success = await handleAddManufacturer(newManufacturerName.trim())
    if (success) {
      setNewManufacturerName('')
      setIsManufacturerDialogOpen(false)
    }
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl space-y-6 px-4">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/catalog">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{isEditMode ? 'Editar Produto' : 'Novo Produto'}</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo / {isEditMode ? 'Editar' : 'Adicionar'} produto
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Download className="w-5 h-5" /> Importar da URL (Opcional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-col sm:flex-row">
            <Input
              placeholder="Cole a URL (ex: https://www.bhphotovideo.com/c/product/...)"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              disabled={isBusy}
              className="flex-1"
            />
            <Button
              onClick={() => handleExtractUrl(importUrl)}
              disabled={!importUrl || isBusy}
              className="whitespace-nowrap"
            >
              {isExtracting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Extrair
              Dados
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Formulário de Produto</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* SECTION 1 - BASIC INFORMATION */}
              <div className="space-y-4 p-5 border rounded-lg bg-muted/5">
                <h3 className="text-lg font-bold">Informações Básicas</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Nome do Produto *</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={isBusy} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="sku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU *</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={isEditMode || isBusy} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="manufacturer_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex justify-between items-center">
                          <span>Fabricante *</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => setIsManufacturerDialogOpen(true)}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={isBusy}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {manufacturers.map((mfg) => (
                              <SelectItem key={mfg.id} value={mfg.id}>
                                {mfg.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex justify-between items-center">
                          <span>Categoria</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => setIsCategoryDialogOpen(true)}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={isBusy}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Descrição</FormLabel>
                        <FormControl>
                          <Textarea className="min-h-[80px]" {...field} disabled={isBusy} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* SECTION 2 - PRICING */}
              <div className="space-y-4 p-5 border rounded-lg bg-muted/5">
                <h3 className="text-lg font-bold">Preços e Custos</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="price_usa"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preço Venda USA (USD)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} disabled={isBusy} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="price_cost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preço Custo USA (USD)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} disabled={isBusy} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="price_brl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preço CIF SP Estimado</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            readOnly
                            disabled
                            className="bg-muted"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="price_nationalized_sales"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preço de Venda Nacionalizado</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            value={field.value || ''}
                            disabled={isBusy}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="price_nationalized_cost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preço de Custo Nacionalizado</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            value={field.value || ''}
                            disabled={isBusy}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="price_nationalized_currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Moeda (Nacionalizado)</FormLabel>
                        <Select
                          value={field.value || 'BRL'}
                          onValueChange={field.onChange}
                          disabled={isBusy}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="BRL">BRL (Real)</SelectItem>
                            <SelectItem value="USD">USD (Dólar)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* SECTION 2.5 - REBATE */}
              <div className="space-y-4 p-5 border rounded-lg bg-amber-500/5 border-amber-500/20">
                <h3 className="text-lg font-bold text-amber-600 dark:text-amber-500">
                  Configuração de Rebate (USA)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="price_usa_rebate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-amber-600 dark:text-amber-500">
                          Price USA Rebate
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            value={field.value || ''}
                            disabled={isBusy}
                            className="border-amber-500/30"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="price_cost_rebate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-amber-600 dark:text-amber-500">
                          Price Cost Rebate
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            value={field.value || ''}
                            disabled={isBusy}
                            className="border-amber-500/30"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="date_rebate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-amber-600 dark:text-amber-500">
                          Data de Expiração (Rebate)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="datetime-local"
                            {...field}
                            value={
                              field.value ? new Date(field.value).toISOString().slice(0, 16) : ''
                            }
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? new Date(e.target.value).toISOString() : null,
                              )
                            }
                            disabled={isBusy}
                            className="border-amber-500/30"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* SECTION 3 - PHYSICAL SPECIFICATIONS */}
              <div className="space-y-4 p-5 border rounded-lg bg-muted/5">
                <h3 className="text-lg font-bold">Especificações Físicas</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="dimensions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dimensões (ex: 10x10x10)</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={isBusy} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="weight"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Peso (lbs)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} disabled={isBusy} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="stock"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estoque</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} disabled={isBusy} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* SECTION 4 - TECHNICAL SPECIFICATIONS */}
              <div className="space-y-4 p-5 border rounded-lg bg-muted/5">
                <h3 className="text-lg font-bold">Especificações Técnicas</h3>
                <div className="grid grid-cols-1 gap-6">
                  <FormField
                    control={form.control}
                    name="technical_info"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Especificações Técnicas</FormLabel>
                        <FormControl>
                          <Textarea className="min-h-[120px]" {...field} disabled={isBusy} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* SECTION 5 - IMAGE AND CLASSIFICATION */}
              <div className="space-y-4 p-5 border rounded-lg bg-muted/5">
                <h3 className="text-lg font-bold">Imagem e Classificação</h3>
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="image_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>URL da Imagem</FormLabel>
                          <FormControl>
                            <Input {...field} disabled={isBusy} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="space-y-2">
                      <Label>Image Preview</Label>
                      <div className="w-[200px] h-[200px] border rounded-lg overflow-hidden flex items-center justify-center bg-background/50">
                        {imageStatus === 'idle' && (
                          <span className="text-sm text-muted-foreground text-center px-4">
                            Nenhuma imagem selecionada
                          </span>
                        )}
                        {imageStatus === 'loading' && (
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        )}
                        {imageStatus === 'error' && (
                          <span className="text-sm text-destructive text-center px-4">
                            Não foi possivel carregar a imagem. Verifique a URL.
                          </span>
                        )}
                        {imageStatus === 'success' && (
                          <img
                            src={debouncedImageUrl}
                            alt="Preview"
                            className="w-full h-full object-contain"
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="ncm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex justify-between items-center">
                          NCM (8 dígitos)
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-primary"
                            onClick={handleSuggestNcm}
                            disabled={isSuggestingNcm || isBusy}
                          >
                            {isSuggestingNcm ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3 mr-1" />
                            )}{' '}
                            Sugerir
                          </Button>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} maxLength={8} disabled={isBusy} />
                        </FormControl>
                        {ncmSuggestions.length > 0 && (
                          <div className="mt-2 p-3 border rounded-md bg-muted/30 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-medium text-muted-foreground">
                                Sugestões:
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-5 text-xs px-2"
                                onClick={() => setNcmSuggestions([])}
                              >
                                Limpar
                              </Button>
                            </div>
                            {ncmSuggestions[0]?.note && (
                              <p className="text-xs text-amber-600 bg-amber-50 p-1.5 rounded">
                                {ncmSuggestions[0].note}
                              </p>
                            )}
                            <div className="space-y-1">
                              {ncmSuggestions.map((sug, idx) => (
                                <div
                                  key={idx}
                                  className="flex justify-between items-center text-sm p-1.5 hover:bg-muted cursor-pointer rounded border hover:border-border transition-colors"
                                  onClick={() => {
                                    form.setValue('ncm', sug.ncm)
                                    setNcmSuggestions([])
                                  }}
                                >
                                  <div className="flex items-center flex-1 min-w-0">
                                    <span className="font-mono text-primary font-medium shrink-0">
                                      {sug.ncm}
                                    </span>
                                    <span className="truncate ml-3 text-xs text-muted-foreground">
                                      {sug.description}
                                    </span>
                                  </div>
                                  <span className="text-xs font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0 ml-2">
                                    {sug.confidence}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* SECTION 6 - FINAL OPTIONS */}
              <div className="space-y-4 p-5 border rounded-lg bg-muted/5">
                <h3 className="text-lg font-bold">Relacionamentos e Status</h3>
                <div className="grid grid-cols-1 gap-6">
                  <FormField
                    control={form.control}
                    name="manual_related_ids"
                    render={() => {
                      const manualIds = form.watch('manual_related_ids') || []
                      const aiIds = form.watch('ai_related_ids') || []

                      const filteredProducts = allProducts.filter(
                        (p) =>
                          p.name.toLowerCase().includes(searchRelated.toLowerCase()) ||
                          (p.sku && p.sku.toLowerCase().includes(searchRelated.toLowerCase())),
                      )

                      const selectedProducts = allProducts.filter(
                        (p) => manualIds.includes(p.id) || aiIds.includes(p.id),
                      )

                      return (
                        <FormItem>
                          <FormLabel>Produtos Relacionados</FormLabel>
                          <div className="border rounded-md p-3 bg-background space-y-3">
                            <Input
                              placeholder="Buscar por nome ou SKU..."
                              value={searchRelated}
                              onChange={(e) => setSearchRelated(e.target.value)}
                              disabled={isBusy}
                            />

                            {selectedProducts.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-4 p-2 bg-muted/20 rounded-md">
                                {selectedProducts.map((prod) => {
                                  const isAi = aiIds.includes(prod.id)
                                  const isManual = manualIds.includes(prod.id)

                                  return (
                                    <div
                                      key={`selected-${prod.id}`}
                                      className="flex items-center gap-1.5 text-xs py-1 px-2 rounded-full border bg-background"
                                    >
                                      <span
                                        className="font-medium max-w-[150px] truncate"
                                        title={prod.name}
                                      >
                                        {prod.name}
                                      </span>

                                      {isManual && (
                                        <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                                          Manual
                                        </span>
                                      )}

                                      {isAi && (
                                        <span className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                                          IA
                                        </span>
                                      )}

                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={(e) => {
                                          e.preventDefault()
                                          if (isManual) {
                                            form.setValue(
                                              'manual_related_ids',
                                              manualIds.filter((id: string) => id !== prod.id),
                                              { shouldDirty: true },
                                            )
                                          }
                                          if (isAi) {
                                            form.setValue(
                                              'ai_related_ids',
                                              aiIds.filter((id: string) => id !== prod.id),
                                              { shouldDirty: true },
                                            )
                                          }
                                        }}
                                        className="ml-1 text-muted-foreground hover:text-destructive focus:outline-none"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            <ScrollArea className="h-[150px] border rounded p-2">
                              <div className="space-y-2">
                                {filteredProducts.map((prod) => {
                                  const isChecked =
                                    manualIds.includes(prod.id) || aiIds.includes(prod.id)

                                  return (
                                    <div key={prod.id} className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`related-${prod.id}`}
                                        checked={isChecked}
                                        disabled={isBusy}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            if (!aiIds.includes(prod.id)) {
                                              form.setValue(
                                                'manual_related_ids',
                                                [...manualIds, prod.id],
                                                {
                                                  shouldDirty: true,
                                                },
                                              )
                                            }
                                          } else {
                                            if (manualIds.includes(prod.id)) {
                                              form.setValue(
                                                'manual_related_ids',
                                                manualIds.filter((id: string) => id !== prod.id),
                                                { shouldDirty: true },
                                              )
                                            }
                                            if (aiIds.includes(prod.id)) {
                                              form.setValue(
                                                'ai_related_ids',
                                                aiIds.filter((id: string) => id !== prod.id),
                                                { shouldDirty: true },
                                              )
                                            }
                                          }
                                        }}
                                      />
                                      <label
                                        htmlFor={`related-${prod.id}`}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                      >
                                        {prod.name} {prod.sku ? `(${prod.sku})` : ''}
                                      </label>
                                    </div>
                                  )
                                })}
                                {filteredProducts.length === 0 && (
                                  <p className="text-sm text-muted-foreground text-center py-4">
                                    Nenhum produto encontrado.
                                  </p>
                                )}
                              </div>
                            </ScrollArea>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )
                    }}
                  />

                  <div className="flex flex-col sm:flex-row gap-8">
                    <FormField
                      control={form.control}
                      name="is_special"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={isBusy}
                            />
                          </FormControl>
                          <FormLabel className="cursor-pointer">Destaque Especial</FormLabel>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="is_discontinued"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={isBusy}
                            />
                          </FormControl>
                          <FormLabel className="cursor-pointer text-destructive">
                            Descontinuado
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    form.reset()
                    setImportUrl('')
                    setNcmSuggestions([])
                  }}
                  disabled={isBusy}
                >
                  Limpar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/admin/catalog')}
                  disabled={isBusy}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isBusy}
                  className="sm:w-auto w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{' '}
                  {isEditMode ? 'Atualizar Produto' : 'Salvar Produto'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Categoria</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Nome da categoria"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateCategory} disabled={!newCategoryName.trim()}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isManufacturerDialogOpen} onOpenChange={setIsManufacturerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Fabricante</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Nome do fabricante"
              value={newManufacturerName}
              onChange={(e) => setNewManufacturerName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManufacturerDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateManufacturer} disabled={!newManufacturerName.trim()}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
