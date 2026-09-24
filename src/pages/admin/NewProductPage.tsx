import { useState, useEffect } from 'react'
import { useProductForm } from '@/hooks/useProductForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImageWithFallback } from '@/components/ImageWithFallback'
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
import {
  ArrowLeft,
  Download,
  Loader2,
  Sparkles,
  Plus,
  X,
  UploadCloud,
  Image as ImageIcon,
} from 'lucide-react'
import { useRef } from 'react'
import { uploadProductImage } from '@/services/productService'
import { useToast } from '@/hooks/use-toast'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
  const { id } = useParams<{ id: string }>()
  const [importUrl, setImportUrl] = useState('')
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
  const [isManufacturerDialogOpen, setIsManufacturerDialogOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newManufacturerName, setNewManufacturerName] = useState('')
  const [searchRelated, setSearchRelated] = useState('')
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

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

  // Se o formulário mudar para uma URL remota, descarta o localPreviewUrl se for diferente
  useEffect(() => {
    if (!imageUrl) {
      setLocalPreviewUrl(null)
    }
  }, [imageUrl])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedImageUrl(imageUrl || ''), 500)
    return () => clearTimeout(timer)
  }, [imageUrl])

  useEffect(() => {
    const activeUrl = localPreviewUrl || debouncedImageUrl
    if (!activeUrl) {
      setImageStatus('idle')
      return
    }
    setImageStatus('loading')
    const img = new Image()
    img.onload = () => setImageStatus('success')
    img.onerror = () => setImageStatus('error')
    img.src = activeUrl
  }, [debouncedImageUrl, localPreviewUrl])

  const validateAndProcessFile = async (file: File) => {
    setImageUploadError(null)

    // Validar tipo de arquivo
    const validMimeTypes = ['image/jpeg', 'image/png']
    if (!validMimeTypes.includes(file.type)) {
      const msg = 'Formato inválido. Selecione apenas imagens em JPEG (.jpg, .jpeg) ou PNG (.png).'
      setImageUploadError(msg)
      toast({
        title: 'Formato não suportado',
        description: msg,
        variant: 'destructive',
      })
      return
    }

    // Validar tamanho (10MB)
    const MAX_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      const msg = 'Arquivo muito grande. O tamanho máximo permitido é de 10MB.'
      setImageUploadError(msg)
      toast({
        title: 'Arquivo muito grande',
        description: msg,
        variant: 'destructive',
      })
      return
    }

    // Gerar preview local imediato
    const objectUrl = URL.createObjectURL(file)
    setLocalPreviewUrl(objectUrl)
    setIsUploadingImage(true)

    try {
      const result = await uploadProductImage(file, id || null)
      // Definir a URL pública no formulário
      form.setValue('image_url', result.publicUrl, { shouldDirty: true, shouldValidate: true })
      setLocalPreviewUrl(null)
      toast({
        title: 'Upload concluído',
        description: 'Imagem enviada com sucesso para o armazenamento!',
      })
    } catch (err: any) {
      console.error('Falha no upload manual de imagem:', err)
      const errorMsg =
        err?.message ||
        'Falha ao enviar imagem para o armazenamento. Tente novamente ou use uma URL externa.'
      setImageUploadError(errorMsg)
      toast({
        title: 'Falha no upload da imagem',
        description: errorMsg,
        variant: 'destructive',
      })
      // Não quebra o formulário
    } finally {
      setIsUploadingImage(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      validateAndProcessFile(file)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isBusy && !isUploadingImage) {
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (isBusy || isUploadingImage) return

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      validateAndProcessFile(files[0])
    }
  }

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
                <div className="space-y-6">
                  {/* Seletor / Dropzone de Imagem de Produto */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Imagem do Produto</Label>
                    <p className="text-xs text-muted-foreground">
                      Arraste um arquivo JPEG ou PNG, clique na área para selecionar do computador,
                      ou cole uma URL externa abaixo.
                    </p>

                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={isBusy || isUploadingImage}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                      {/* Dropzone interativa */}
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label="Selecionar imagem de produto por arquivo ou arrastar"
                        onKeyDown={(e) => {
                          if (
                            (e.key === 'Enter' || e.key === ' ') &&
                            !isBusy &&
                            !isUploadingImage
                          ) {
                            e.preventDefault()
                            fileInputRef.current?.click()
                          }
                        }}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => {
                          if (!isBusy && !isUploadingImage) {
                            fileInputRef.current?.click()
                          }
                        }}
                        className={`md:col-span-8 border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer relative min-h-[190px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                          isDragOver
                            ? 'border-primary bg-primary/10 scale-[1.01]'
                            : 'border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/30 bg-background/50'
                        } ${isUploadingImage ? 'pointer-events-none opacity-80' : ''}`}
                      >
                        {isUploadingImage ? (
                          <div className="flex flex-col items-center gap-2 py-4">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p className="text-sm font-medium text-primary">
                              Enviando para o Supabase Storage...
                            </p>
                            <span className="text-xs text-muted-foreground">
                              Aguarde o processamento da imagem
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 py-2">
                            <div className="p-3 rounded-full bg-primary/10 text-primary">
                              <UploadCloud className="w-7 h-7" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-medium">
                                <span className="text-primary underline underline-offset-4">
                                  Clique para selecionar
                                </span>{' '}
                                ou arraste a imagem aqui
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Formatos aceitos: <strong>JPEG</strong> e <strong>PNG</strong> (até
                                10MB)
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Preview Box */}
                      <div className="md:col-span-4 flex flex-col items-center justify-center">
                        <div className="w-full max-w-[200px] h-[190px] border rounded-xl overflow-hidden flex flex-col items-center justify-center bg-background/80 relative shadow-sm">
                          {isUploadingImage && (
                            <div className="flex flex-col items-center gap-1.5 p-3 text-center">
                              <Loader2 className="w-6 h-6 animate-spin text-primary" />
                              <span className="text-xs font-medium text-muted-foreground">
                                Atualizando preview...
                              </span>
                            </div>
                          )}

                          {!isUploadingImage && (localPreviewUrl || imageUrl) && (
                            <>
                              <ImageWithFallback
                                src={localPreviewUrl || debouncedImageUrl}
                                alt="Preview do Produto"
                                productId={id || ''}
                                className="w-full h-full object-contain p-2"
                              />
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="absolute top-2 right-2 h-6 w-6 rounded-full shadow"
                                title="Remover imagem"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  form.setValue('image_url', '', { shouldDirty: true })
                                  setLocalPreviewUrl(null)
                                  setImageUploadError(null)
                                }}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}

                          {!isUploadingImage && !localPreviewUrl && !imageUrl && (
                            <div className="flex flex-col items-center gap-1 text-muted-foreground p-3 text-center">
                              <ImageIcon className="w-8 h-8 stroke-1 text-muted-foreground/60" />
                              <span className="text-xs font-medium">Sem imagem</span>
                              <span className="text-[10px] text-muted-foreground/70">
                                Preview aparecerá aqui
                              </span>
                            </div>
                          )}
                        </div>

                        {imageStatus === 'error' &&
                          (imageUrl || localPreviewUrl) &&
                          !isUploadingImage && (
                            <p className="text-[11px] text-destructive text-center mt-2 max-w-[200px]">
                              Não foi possível carregar a imagem. Verifique a URL ou selecione outro
                              arquivo.
                            </p>
                          )}
                      </div>
                    </div>

                    {imageUploadError && (
                      <p className="text-xs text-destructive font-medium bg-destructive/10 border border-destructive/20 p-2.5 rounded-md">
                        {imageUploadError}
                      </p>
                    )}
                  </div>

                  {/* Campo de URL alternativa */}
                  <FormField
                    control={form.control}
                    name="image_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">
                          Ou forneça uma URL direta da imagem (opcional)
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="https://..."
                            disabled={isBusy || isUploadingImage}
                            className="text-xs"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* NCM */}
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
