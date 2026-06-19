import { useState, useEffect } from 'react'
import { Product, Manufacturer } from '@/types'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { UploadCloud, Plus, Wand2, X, Star, Ban, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AdminManufacturerDialog } from './AdminManufacturerDialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import ReactMarkdown from 'react-markdown'
import { useProductForm } from '@/hooks/useProductForm'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

interface Props {
  initialData: Product | null
  manufacturers?: Manufacturer[]
  onSuccess?: () => void
  onAddManufacturer?: () => void
}

export function AdminProductForm({ initialData, onSuccess, onAddManufacturer }: Props) {
  const { form, manufacturers, categories, isExtracting, isSaving, handleExtractUrl, onSubmit } =
    useProductForm({ initialData, onSuccess })

  const [uploadingImage, setUploadingImage] = useState(false)
  const [showMfgDialog, setShowMfgDialog] = useState(false)
  const [extractUrl, setExtractUrl] = useState('')
  const [searchRelated, setSearchRelated] = useState('')
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

  const handleImageDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/'))
      return toast({ title: 'Formato inválido', variant: 'destructive' })

    setUploadingImage(true)
    const ext = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`

    const { data, error } = await supabase.storage.from('product-images').upload(fileName, file)
    if (error) {
      toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' })
    } else if (data) {
      const {
        data: { publicUrl },
      } = supabase.storage.from('product-images').getPublicUrl(fileName)
      form.setValue('image_url', publicUrl, { shouldDirty: true })
    }
    setUploadingImage(false)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-2">
        <div className="flex flex-col md:flex-row gap-3 bg-muted/30 p-4 rounded-lg border border-border items-end">
          <div className="flex-1 w-full space-y-1">
            <Label>Importar de URL</Label>
            <Input
              placeholder="Colar URL do produto (B&H, Amazon, etc) para extrair dados..."
              value={extractUrl}
              onChange={(e) => setExtractUrl(e.target.value)}
              className="bg-background"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleExtractUrl(extractUrl)}
            disabled={isExtracting || !extractUrl}
            className="w-full md:w-auto"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            {isExtracting ? 'Extraindo...' : 'Extrair'}
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <FormField
            control={form.control}
            name="image_url"
            render={({ field }) => (
              <FormItem className="col-span-2 md:col-span-4">
                <FormLabel>Imagem do Produto</FormLabel>
                <FormControl>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleImageDrop}
                    className="border-2 border-dashed border-white/20 rounded-xl p-6 flex flex-col items-center justify-center text-muted-foreground hover:bg-white/5 transition-colors cursor-pointer group relative overflow-hidden"
                  >
                    {uploadingImage ? (
                      <p className="animate-pulse">Fazendo upload...</p>
                    ) : field.value ? (
                      <div className="flex flex-col items-center">
                        <img
                          src={field.value}
                          alt="Preview"
                          className="h-32 object-contain mb-3 rounded"
                        />
                        <p className="text-xs">Arraste nova imagem para substituir</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <UploadCloud className="w-8 h-8 mb-2 group-hover:text-primary" />
                        <p>Arraste uma imagem aqui ou preencha a URL abaixo</p>
                      </div>
                    )}
                  </div>
                </FormControl>
                <Input {...field} placeholder="https://..." className="bg-background/50 mt-2" />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="manufacturer_id"
            render={({ field }) => (
              <FormItem className="col-span-2 md:col-span-2">
                <FormLabel>Fabricante</FormLabel>
                <div className="flex gap-2">
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="bg-background/50 border-white/10 flex-1">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                    </FormControl>
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
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="sku"
            render={({ field }) => (
              <FormItem className="col-span-2 md:col-span-2">
                <FormLabel>SKU</FormLabel>
                <FormControl>
                  <Input {...field} className="bg-background/50" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="col-span-2 md:col-span-4">
                <FormLabel>Nome do Produto</FormLabel>
                <FormControl>
                  <Input {...field} className="bg-background/50" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem className="col-span-2 md:col-span-2">
                <FormLabel>Categoria (Texto)</FormLabel>
                <FormControl>
                  <Input {...field} className="bg-background/50" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <FormItem className="col-span-2 md:col-span-2">
                <FormLabel>Categoria do Sistema</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="bg-background/50 border-white/10">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
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
            name="ncm"
            render={({ field }) => (
              <FormItem className="col-span-2 md:col-span-4">
                <FormLabel>NCM</FormLabel>
                <FormControl>
                  <Input {...field} className="bg-background/50" placeholder="0000.00.00" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="col-span-2 md:col-span-4 border border-orange-500 rounded-xl p-5 bg-orange-500/5 space-y-5 my-4">
            <div>
              <h3 className="text-lg font-medium text-orange-500">Configuração de Rebate (USA)</h3>
              <p className="text-sm text-orange-500/80">
                O preço de rebate será usado para o cálculo automático do BRL quando ativo.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
              <FormField
                control={form.control}
                name="price_usa_rebate"
                render={({ field }) => (
                  <FormItem className="col-span-2 md:col-span-1">
                    <FormLabel className="text-amber-500">Price USA Rebate</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        value={field.value || ''}
                        className="bg-background/50 border-orange-500/30"
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
                  <FormItem className="col-span-2 md:col-span-1">
                    <FormLabel className="text-orange-500">Price Cost Rebate</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        value={field.value || ''}
                        className="bg-background/50 border-orange-500/30"
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
                  <FormItem className="col-span-2 md:col-span-1">
                    <FormLabel className="text-orange-500">Data de Expiração (Rebate)</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ''}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? new Date(e.target.value).toISOString() : null,
                          )
                        }
                        className="bg-background/50 border-orange-500/30"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="col-span-2 md:col-span-4 mt-4 mb-2">
            <h3 className="text-lg font-medium">Preços Padrão</h3>
            <div className="h-px bg-white/10 w-full mt-2" />
          </div>

          <FormField
            control={form.control}
            name="price_usa"
            render={({ field }) => (
              <FormItem className="col-span-2 md:col-span-1">
                <FormLabel>Preço Venda USA (USD)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} className="bg-background/50" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="price_brl"
            render={({ field }) => (
              <FormItem className="col-span-2 md:col-span-1">
                <FormLabel>Preço CIF SP Estimado</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} className="bg-background/50" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="price_cost"
            render={({ field }) => (
              <FormItem className="col-span-2 md:col-span-1">
                <FormLabel className="text-amber-500">Preço Custo USA (USD)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    {...field}
                    className="bg-background/50 border-amber-500/30"
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
              <FormItem className="col-span-2 md:col-span-1">
                <FormLabel>Preço de Venda Nacionalizado</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    {...field}
                    value={field.value || ''}
                    className="bg-background/50"
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
              <FormItem className="col-span-2 md:col-span-1">
                <FormLabel>Preço de Custo Nacionalizado</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    {...field}
                    value={field.value || ''}
                    className="bg-background/50"
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
              <FormItem className="col-span-2 md:col-span-1">
                <FormLabel>Moeda (Nacionalizado)</FormLabel>
                <Select value={field.value || 'BRL'} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="bg-background/50 border-white/10">
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

          <FormField
            control={form.control}
            name="stock"
            render={({ field }) => (
              <FormItem className="col-span-2 md:col-span-1">
                <FormLabel>Estoque Local</FormLabel>
                <FormControl>
                  <Input type="number" {...field} className="bg-background/50" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="weight"
            render={({ field }) => (
              <FormItem className="col-span-2 md:col-span-1">
                <FormLabel>Peso (lb)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} className="bg-background/50" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dimensions"
            render={({ field }) => (
              <FormItem className="col-span-2 md:col-span-4">
                <FormLabel>Dimensões (in)</FormLabel>
                <FormControl>
                  <Input {...field} className="bg-background/50" placeholder="10x10x10" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="col-span-2 md:col-span-4 mt-6 mb-2">
            <h3 className="text-lg font-medium">Relacionamentos</h3>
            <div className="h-px bg-white/10 w-full mt-2" />
          </div>

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

              return (
                <FormItem className="col-span-2 md:col-span-4">
                  <FormLabel>Gerenciar Produtos Relacionados</FormLabel>
                  <div className="border border-white/10 rounded-md p-3 bg-background/50 space-y-4 mt-2">
                    <Input
                      placeholder="Buscar por nome ou SKU para relacionar manualmente..."
                      value={searchRelated}
                      onChange={(e) => setSearchRelated(e.target.value)}
                      className="bg-background"
                    />
                    <ScrollArea className="h-[150px] border border-white/5 rounded p-2 bg-black/20">
                      <div className="space-y-3">
                        {filteredProducts.map((prod) => {
                          const isChecked = manualIds.includes(prod.id) || aiIds.includes(prod.id)

                          return (
                            <div key={prod.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`related-${prod.id}`}
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    if (!aiIds.includes(prod.id)) {
                                      form.setValue('manual_related_ids', [...manualIds, prod.id], {
                                        shouldDirty: true,
                                      })
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
                                      const rejectedIds = form.watch('rejected_related_ids') || []
                                      if (!rejectedIds.includes(prod.id)) {
                                        form.setValue(
                                          'rejected_related_ids',
                                          [...rejectedIds, prod.id],
                                          { shouldDirty: true },
                                        )
                                      }
                                    }
                                  }
                                }}
                              />
                              <label
                                htmlFor={`related-${prod.id}`}
                                className="text-sm font-medium leading-none cursor-pointer"
                              >
                                {prod.name}{' '}
                                {prod.sku ? (
                                  <span className="text-muted-foreground ml-1">({prod.sku})</span>
                                ) : (
                                  ''
                                )}
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

                    {(() => {
                      const selectedProducts = allProducts.filter(
                        (p) => manualIds.includes(p.id) || aiIds.includes(p.id),
                      )

                      if (selectedProducts.length === 0) return null

                      return (
                        <div className="pt-3 border-t border-white/10 mt-4">
                          <p className="text-xs text-muted-foreground mb-3 font-medium">
                            Produtos Selecionados:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {selectedProducts.map((prod: any) => {
                              const isAi = aiIds.includes(prod.id)
                              return (
                                <Badge
                                  key={`badge-${prod.id}`}
                                  variant={isAi ? 'default' : 'secondary'}
                                  className={cn(
                                    'flex items-center gap-1.5 text-xs py-1.5 px-3 font-normal border',
                                    isAi
                                      ? 'bg-primary/20 hover:bg-primary/30 text-primary-foreground border-primary/30'
                                      : 'border-transparent',
                                  )}
                                >
                                  {isAi && <Sparkles className="w-3 h-3 text-primary" />}
                                  <span className="max-w-[250px] truncate" title={prod.name}>
                                    {prod.name}
                                  </span>
                                  {prod.sku && (
                                    <span className="text-muted-foreground ml-1 opacity-70">
                                      ({prod.sku})
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault()
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
                                        const rejectedIds = form.watch('rejected_related_ids') || []
                                        if (!rejectedIds.includes(prod.id)) {
                                          form.setValue(
                                            'rejected_related_ids',
                                            [...rejectedIds, prod.id],
                                            { shouldDirty: true },
                                          )
                                        }
                                      }
                                    }}
                                    className="ml-1 hover:bg-destructive hover:text-destructive-foreground rounded-full p-0.5 transition-colors focus:outline-none"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </Badge>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                  <FormMessage />
                </FormItem>
              )
            }}
          />

          <div className="col-span-2 md:col-span-4 mt-6 mb-2">
            <h3 className="text-lg font-medium">Status do Produto</h3>
            <div className="h-px bg-white/10 w-full mt-2" />
          </div>

          <FormField
            control={form.control}
            name="is_special"
            render={({ field }) => (
              <FormItem
                className={cn(
                  'col-span-2 md:col-span-2 relative flex flex-col items-start gap-4 rounded-xl border p-5 shadow-sm cursor-pointer transition-colors',
                  field.value
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-border bg-background/50 hover:bg-muted/50',
                )}
                onClick={() => field.onChange(!field.value)}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'p-2 rounded-full',
                        field.value ? 'bg-amber-500/20' : 'bg-muted',
                      )}
                    >
                      <Star
                        className={cn(
                          'w-5 h-5',
                          field.value ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground',
                        )}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <FormLabel className="text-base font-medium cursor-pointer pointer-events-none">
                        Destaque Especial
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">Destacar na página inicial</p>
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </FormControl>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="is_discontinued"
            render={({ field }) => (
              <FormItem
                className={cn(
                  'col-span-2 md:col-span-2 relative flex flex-col items-start gap-4 rounded-xl border p-5 shadow-sm cursor-pointer transition-colors',
                  field.value
                    ? 'border-destructive bg-destructive/10'
                    : 'border-border bg-background/50 hover:bg-muted/50',
                )}
                onClick={() => field.onChange(!field.value)}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'p-2 rounded-full',
                        field.value ? 'bg-destructive/20' : 'bg-muted',
                      )}
                    >
                      <Ban
                        className={cn(
                          'w-5 h-5',
                          field.value ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <FormLabel className="text-base font-medium cursor-pointer pointer-events-none">
                        Produto Descontinuado
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">Fora de linha/indisponível</p>
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </FormControl>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="col-span-2 md:col-span-4">
                <FormLabel>Descrição Curta</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value || ''}
                    className="bg-background/50 min-h-[100px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="technical_info"
            render={({ field }) => (
              <FormItem className="col-span-2 md:col-span-4">
                <FormLabel>Informações Técnicas (Markdown/HTML)</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value || ''}
                    placeholder={`## Especificações Avançadas\n\n**Recurso 1:** Descrição...`}
                    className="bg-background/50 min-h-[200px]"
                    rows={10}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.watch('technical_info') && (
            <div className="space-y-2 col-span-2 md:col-span-4">
              <Label>Preview das Informações Técnicas</Label>
              <div className="p-4 border border-border/50 rounded-md bg-background/50 text-sm [&_h2]:text-[1.5rem] [&_h2]:font-[700] [&_h2]:mt-[1.5rem] [&_h2]:mb-[1rem] [&_h3]:text-[1.25rem] [&_h3]:font-[600] [&_h3]:mt-[1rem] [&_h3]:mb-[0.75rem] [&_strong]:font-[700] [&_strong]:text-primary [&_ul]:ml-[1.5rem] [&_ul]:mt-[0.5rem] [&_ul]:mb-[0.5rem] [&_ul]:list-disc [&_ol]:ml-[1.5rem] [&_ol]:mt-[0.5rem] [&_ol]:mb-[0.5rem] [&_ol]:list-decimal [&_li]:mb-[0.5rem] [&_blockquote]:border-l-[4px] [&_blockquote]:border-primary [&_blockquote]:pl-[1rem] [&_blockquote]:ml-0 [&_blockquote]:text-muted-foreground [&_code]:bg-muted [&_code]:py-[0.25rem] [&_code]:px-[0.5rem] [&_code]:rounded-[0.25rem] [&_code]:font-mono [&_pre]:bg-muted [&_pre]:p-[1rem] [&_pre]:rounded-[0.5rem] [&_pre]:overflow-x-auto [&_pre]:font-mono">
                <ReactMarkdown>{form.watch('technical_info')}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t border-white/10">
          <Button type="button" variant="ghost" onClick={onSuccess}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSaving} className="px-8">
            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>

        <AdminManufacturerDialog
          open={showMfgDialog}
          onOpenChange={setShowMfgDialog}
          onSuccess={(id) => {
            if (onAddManufacturer) onAddManufacturer()
            form.setValue('manufacturer_id', id, { shouldDirty: true })
            setShowMfgDialog(false)
          }}
        />
      </form>
    </Form>
  )
}
