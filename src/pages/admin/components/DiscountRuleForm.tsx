import { useState, useEffect, useMemo } from 'react'
import { Discount } from '@/types/discount'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Search, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'

const schema = z
  .object({
    name: z.string().min(3, 'Mínimo de 3 caracteres'),
    discount_type: z.enum([
      'margin_percentage',
      'price_usa_percentage',
      'percentage',
      'fixed',
      'fixed_amount',
    ]),
    discount_value: z.coerce.number().min(0.01, 'Valor deve ser maior que 0'),
    target_type: z.enum(['all', 'manufacturer', 'category', 'manufacturer_category', 'specific']),
    status: z.enum(['active', 'inactive']),
    start_date: z.string().optional().nullable(),
    end_date: z.string().optional().nullable(),
    application_type: z.enum(['all', 'rule', 'specific_customers'], {
      required_error: 'Tipo de beneficiário é obrigatório',
    }),
    customer_role: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.application_type === 'rule' && !data.customer_role) return false
      return true
    },
    { message: 'Selecione uma regra', path: ['customer_role'] },
  )

type FormData = z.infer<typeof schema>

interface Props {
  rule?: Discount
  products: { id: string; name: string }[]
  onClose: () => void
  onSave: (data: any) => Promise<boolean | void>
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

export default function DiscountRuleForm({ rule, onClose, onSave }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [manufacturers, setManufacturers] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [dbProducts, setDbProducts] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [customerRoles, setCustomerRoles] = useState<string[]>([])

  const [prodSearch, setProdSearch] = useState('')
  const [custSearch, setCustSearch] = useState('')
  const debouncedProdSearch = useDebounce(prodSearch, 300)
  const debouncedCustSearch = useDebounce(custSearch, 300)

  const [excludedProducts, setExcludedProducts] = useState<string[]>(rule?.excluded_products || [])
  const [selectedSpecificProducts, setSelectedSpecificProducts] = useState<string[]>(
    rule?.product_selection || [],
  )
  const [selectedCustomerSelection, setSelectedCustomerSelection] = useState<string[]>(
    rule?.customers || [],
  )

  const [selectedManufacturers, setSelectedManufacturers] = useState<string[]>(
    rule?.manufacturer_ids || (rule?.manufacturer_id ? [rule.manufacturer_id] : []),
  )
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    rule?.category_ids || (rule?.category_id ? [rule.category_id] : []),
  )

  const defaultTargetType =
    rule?.target_type ||
    (rule?.category_ids?.length || rule?.category_id
      ? 'category'
      : rule?.manufacturer_ids?.length || rule?.manufacturer_id
        ? 'manufacturer'
        : rule?.product_selection?.length
          ? 'specific'
          : 'all')

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: rule?.name || '',
      discount_type: (rule?.discount_type as any) || 'margin_percentage',
      discount_value: rule?.discount_value || 0,
      target_type: defaultTargetType as any,
      status: rule ? (rule.is_active ? 'active' : 'inactive') : 'active',
      start_date: rule?.start_date ? new Date(rule.start_date).toISOString().split('T')[0] : '',
      end_date: rule?.end_date ? new Date(rule.end_date).toISOString().split('T')[0] : '',
      application_type: (rule as any)?.customer_application_type || 'all',
      customer_role: rule?.customer_role || '',
    },
  })

  const targetType = watch('target_type')
  const applicationType = watch('application_type')

  useEffect(() => {
    const loadData = async () => {
      const [mRes, cRes, pRes, custRes] = await Promise.all([
        supabase.from('manufacturers').select('id, name').order('name'),
        supabase.from('categories').select('id, name').order('name'),
        supabase
          .from('products')
          .select('id, name, sku, manufacturer_id, category_id, category')
          .order('name'),
        supabase.from('customers').select('id, full_name, email, role').order('full_name'),
      ])
      if (mRes.data) setManufacturers(mRes.data)
      if (cRes.data) setCategories(cRes.data)
      if (pRes.data) setDbProducts(pRes.data)
      if (custRes.data) {
        setCustomers(custRes.data)
        const roles = Array.from(new Set(custRes.data.map((c) => c.role).filter(Boolean)))
        setCustomerRoles(roles.sort())
      }
    }
    loadData()
  }, [])

  const availableProducts = useMemo(() => {
    if (targetType === 'all') return dbProducts
    if (targetType === 'manufacturer') {
      return dbProducts.filter((p) => selectedManufacturers.includes(p.manufacturer_id))
    }
    if (targetType === 'category') {
      return dbProducts.filter(
        (p) =>
          selectedCategories.includes(p.category_id) ||
          selectedCategories.some(
            (cId) => categories.find((c) => c.id === cId)?.name === p.category,
          ),
      )
    }
    if (targetType === 'manufacturer_category') {
      return dbProducts.filter(
        (p) =>
          selectedManufacturers.includes(p.manufacturer_id) &&
          (selectedCategories.includes(p.category_id) ||
            selectedCategories.some(
              (cId) => categories.find((c) => c.id === cId)?.name === p.category,
            )),
      )
    }
    return dbProducts
  }, [dbProducts, targetType, selectedManufacturers, selectedCategories, categories])

  const filteredProducts = useMemo(() => {
    if (!debouncedProdSearch) return availableProducts
    const s = debouncedProdSearch.toLowerCase()
    return availableProducts.filter((p) => {
      const m = manufacturers.find((m) => m.id === p.manufacturer_id)
      const c = categories.find((c) => c.id === p.category_id)
      return (
        p.name.toLowerCase().includes(s) ||
        (p.sku && p.sku.toLowerCase().includes(s)) ||
        (m && m.name.toLowerCase().includes(s)) ||
        (c && c.name.toLowerCase().includes(s)) ||
        (p.category && p.category.toLowerCase().includes(s))
      )
    })
  }, [availableProducts, manufacturers, categories, debouncedProdSearch])

  const filteredCustomers = useMemo(() => {
    if (!debouncedCustSearch) return customers
    const s = debouncedCustSearch.toLowerCase()
    return customers.filter(
      (c) =>
        (c.full_name && c.full_name.toLowerCase().includes(s)) ||
        (c.email && c.email.toLowerCase().includes(s)) ||
        (c.role && c.role.toLowerCase().includes(s)),
    )
  }, [customers, debouncedCustSearch])

  const toggleSpecificProduct = (pId: string, checked: boolean) => {
    setSelectedSpecificProducts((prev) =>
      checked ? [...prev, pId] : prev.filter((id) => id !== pId),
    )
  }

  const toggleExcludedProduct = (pId: string, checked: boolean) => {
    setExcludedProducts((prev) => (checked ? [...prev, pId] : prev.filter((id) => id !== pId)))
  }

  const toggleCustomer = (cId: string, checked: boolean) => {
    setSelectedCustomerSelection((prev) =>
      checked ? [...prev, cId] : prev.filter((id) => id !== cId),
    )
  }

  const isFormValid = !!(
    watch('name') &&
    watch('name').length >= 3 &&
    watch('discount_value') > 0 &&
    (targetType !== 'specific' || selectedSpecificProducts.length > 0) &&
    (targetType !== 'manufacturer' || selectedManufacturers.length > 0) &&
    (targetType !== 'category' || selectedCategories.length > 0) &&
    (targetType !== 'manufacturer_category' ||
      (selectedManufacturers.length > 0 && selectedCategories.length > 0)) &&
    watch('application_type') &&
    (watch('application_type') !== 'rule' || watch('customer_role')) &&
    (watch('application_type') !== 'specific_customers' || selectedCustomerSelection.length > 0)
  )

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    setSaveError(null)
    try {
      const payload = {
        id: rule?.id,
        name: data.name,
        discount_type: data.discount_type,
        discount_value: data.discount_value,
        is_active: data.status === 'active',
        start_date: data.start_date || null,
        end_date: data.end_date || null,

        target_type: data.target_type,
        manufacturer_ids: ['manufacturer', 'manufacturer_category'].includes(data.target_type)
          ? selectedManufacturers
          : [],
        category_ids: ['category', 'manufacturer_category'].includes(data.target_type)
          ? selectedCategories
          : [],
        product_selection: data.target_type === 'specific' ? selectedSpecificProducts : [],
        excluded_products: data.target_type !== 'specific' ? excludedProducts : [],

        customer_application_type: data.application_type,
        customer_role: data.application_type === 'rule' ? data.customer_role : null,
        customers: data.application_type === 'specific_customers' ? selectedCustomerSelection : [],
      }

      const success = await onSave(payload)
      if (success === false) {
        setSaveError('Não foi possivel salvar o desconto.')
        toast({
          title: 'Erro',
          description: 'Não foi possivel salvar o desconto.',
          variant: 'destructive',
        })
      } else {
        toast({ title: 'Sucesso', description: 'Desconto salvo com sucesso!' })
      }
    } catch (err) {
      setSaveError('Não foi possivel salvar o desconto.')
      toast({
        title: 'Erro',
        description: 'Não foi possivel salvar o desconto.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderProductList = (isExclusion: boolean) => {
    const selected = isExclusion ? excludedProducts : selectedSpecificProducts
    const toggle = isExclusion ? toggleExcludedProduct : toggleSpecificProduct

    return (
      <div className="h-[280px] overflow-y-auto border rounded-md bg-background p-2 space-y-1">
        {filteredProducts.length === 0 ? (
          <div className="text-sm text-muted-foreground p-4 text-center">
            Nenhum produto correspondente
          </div>
        ) : (
          filteredProducts.map((p) => {
            const m = manufacturers.find((x) => x.id === p.manufacturer_id)
            const c = categories.find((x) => x.id === p.category_id)
            return (
              <label
                key={p.id}
                className="flex items-start space-x-3 p-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={selected.includes(p.id)}
                  onCheckedChange={(checked) => toggle(p.id, !!checked)}
                  className="mt-1 shrink-0"
                />
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    SKU: {p.sku || 'N/A'} • Fab: {m ? m.name : 'N/A'} • Cat:{' '}
                    {c ? c.name : p.category || 'N/A'}
                  </span>
                </div>
              </label>
            )
          })
        )}
      </div>
    )
  }

  return (
    <div className="bg-card border rounded-lg shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      <div className="p-6 border-b bg-muted/20">
        <h2 className="text-lg font-semibold">{!rule ? 'Criar Nova Regra' : 'Editar Regra'}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure os detalhes e a qual alvo o desconto deve se aplicar dinamicamente.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-8">
        <fieldset disabled={isSubmitting} className="space-y-8 contents">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Nome da Regra <span className="text-destructive">*</span>
                </Label>
                <Input id="name" {...register('name')} placeholder="Ex: Black Friday" />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Tipo de Desconto <span className="text-destructive">*</span>
                  </Label>
                  <Controller
                    name="discount_type"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="margin_percentage">Margem %</SelectItem>
                          <SelectItem value="price_usa_percentage">Price USA %</SelectItem>
                          <SelectItem value="percentage">Percentual Padrão</SelectItem>
                          <SelectItem value="fixed_amount">Valor Fixo (USD)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="discount_value">
                    Valor <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="discount_value"
                    type="number"
                    step="0.01"
                    {...register('discount_value')}
                  />
                  {errors.discount_value && (
                    <p className="text-sm text-destructive">{errors.discount_value.message}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="inactive">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Data Início (Opcional)</Label>
                  <Input id="start_date" type="date" {...register('start_date')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">Data Fim (Opcional)</Label>
                  <Input id="end_date" type="date" {...register('end_date')} />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-6 border-t">
            <Label className="text-base font-semibold">
              Alvo do Desconto <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="target_type"
              control={control}
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={(val) => field.onChange(val)}
                  className="flex flex-col space-y-2 sm:flex-row sm:flex-wrap sm:space-y-0 gap-y-2 sm:gap-x-6"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="all" id="t-all" />
                    <Label htmlFor="t-all" className="cursor-pointer font-medium">
                      Todo o Site
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="manufacturer" id="t-man" />
                    <Label htmlFor="t-man" className="cursor-pointer font-medium">
                      Por Fabricante
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="category" id="t-cat" />
                    <Label htmlFor="t-cat" className="cursor-pointer font-medium">
                      Por Categoria
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="manufacturer_category" id="t-man-cat" />
                    <Label htmlFor="t-man-cat" className="cursor-pointer font-medium">
                      Fabricante + Categoria
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="specific" id="t-spec" />
                    <Label htmlFor="t-spec" className="cursor-pointer font-medium">
                      Produtos Específicos
                    </Label>
                  </div>
                </RadioGroup>
              )}
            />
          </div>

          <div className="space-y-4 pt-6 border-t">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(targetType === 'manufacturer' || targetType === 'manufacturer_category') && (
                <div className="border rounded-md p-4 bg-muted/10 space-y-3">
                  <div>
                    <Label className="text-sm font-semibold">
                      Fabricantes <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {selectedManufacturers.length} selecionado(s)
                    </p>
                  </div>
                  <div className="h-[200px] overflow-y-auto border rounded-md bg-background p-2 space-y-1">
                    {manufacturers.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-start space-x-3 p-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={selectedManufacturers.includes(m.id)}
                          onCheckedChange={(checked) => {
                            setSelectedManufacturers((prev) =>
                              checked ? [...prev, m.id] : prev.filter((id) => id !== m.id),
                            )
                          }}
                          className="mt-0.5 shrink-0"
                        />
                        <span className="text-sm font-medium leading-none">{m.name}</span>
                      </label>
                    ))}
                  </div>
                  {selectedManufacturers.length === 0 && (
                    <p className="text-sm text-destructive">Selecione pelo menos 1 fabricante.</p>
                  )}
                </div>
              )}

              {(targetType === 'category' || targetType === 'manufacturer_category') && (
                <div className="border rounded-md p-4 bg-muted/10 space-y-3">
                  <div>
                    <Label className="text-sm font-semibold">
                      Categorias <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {selectedCategories.length} selecionada(s)
                    </p>
                  </div>
                  <div className="h-[200px] overflow-y-auto border rounded-md bg-background p-2 space-y-1">
                    {categories.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-start space-x-3 p-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={selectedCategories.includes(c.id)}
                          onCheckedChange={(checked) => {
                            setSelectedCategories((prev) =>
                              checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                            )
                          }}
                          className="mt-0.5 shrink-0"
                        />
                        <span className="text-sm font-medium leading-none">{c.name}</span>
                      </label>
                    ))}
                  </div>
                  {selectedCategories.length === 0 && (
                    <p className="text-sm text-destructive">Selecione pelo menos 1 categoria.</p>
                  )}
                </div>
              )}
            </div>

            {targetType === 'specific' ? (
              <div className="border rounded-md p-4 bg-muted/10 space-y-3">
                <div>
                  <Label className="text-sm font-semibold">
                    Produtos Inclusos <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {selectedSpecificProducts.length} produto(s) selecionado(s)
                  </p>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produto..."
                    value={prodSearch}
                    onChange={(e) => setProdSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                {renderProductList(false)}
                {selectedSpecificProducts.length === 0 && (
                  <p className="text-sm text-destructive">Selecione pelo menos 1 produto.</p>
                )}
              </div>
            ) : (
              <div className="border rounded-md p-4 bg-muted/10 space-y-3">
                <div>
                  <Label className="text-sm font-semibold">Exceções (Produtos Excluídos)</Label>
                  <p className="text-xs text-muted-foreground">
                    {excludedProducts.length} produto(s) excluído(s)
                  </p>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produto para excluir..."
                    value={prodSearch}
                    onChange={(e) => setProdSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                {renderProductList(true)}
              </div>
            )}
          </div>

          <div className="space-y-4 pt-6 border-t">
            <Label className="text-base font-semibold">
              Beneficiários <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="application_type"
              control={control}
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={(val) => {
                    field.onChange(val)
                    if (val !== 'rule') setValue('customer_role', null, { shouldValidate: true })
                    if (val !== 'specific_customers') setSelectedCustomerSelection([])
                  }}
                  className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-6"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="all" id="app-all" />
                    <Label htmlFor="app-all" className="cursor-pointer font-medium">
                      Todo o Site
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="rule" id="app-rule" />
                    <Label htmlFor="app-rule" className="cursor-pointer font-medium">
                      Por Regra
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="specific_customers" id="app-specific" />
                    <Label htmlFor="app-specific" className="cursor-pointer font-medium">
                      Clientes Específicos
                    </Label>
                  </div>
                </RadioGroup>
              )}
            />

            {applicationType === 'all' && (
              <div className="border rounded-md p-4 bg-muted/10 text-sm text-muted-foreground">
                Este desconto será aplicado a todos os clientes, incluindo visitantes.
              </div>
            )}

            {applicationType === 'rule' && (
              <div className="border rounded-md p-4 bg-muted/10 space-y-4">
                <div className="space-y-2 max-w-sm">
                  <Label>
                    Regra <span className="text-destructive">*</span>
                  </Label>
                  <Controller
                    name="customer_role"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {customerRoles.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.customer_role && (
                    <p className="text-sm text-destructive">{errors.customer_role.message}</p>
                  )}
                </div>
              </div>
            )}

            {applicationType === 'specific_customers' && (
              <div className="border rounded-md p-4 bg-muted/10 space-y-3">
                <div>
                  <Label className="text-sm font-semibold">
                    Clientes Específicos <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {selectedCustomerSelection.length} cliente(s) selecionado(s)
                  </p>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente..."
                    value={custSearch}
                    onChange={(e) => setCustSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <div className="h-[280px] overflow-y-auto border rounded-md bg-background p-2 space-y-1">
                  {filteredCustomers.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-4 text-center">
                      Nenhum cliente correspondente
                    </div>
                  ) : (
                    filteredCustomers.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-start space-x-3 p-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={selectedCustomerSelection.includes(c.id)}
                          onCheckedChange={(checked) => toggleCustomer(c.id, !!checked)}
                          className="mt-1 shrink-0"
                        />
                        <div className="flex flex-col leading-tight">
                          <span className="text-sm font-medium">{c.full_name || 'Sem Nome'}</span>
                          <span className="text-xs text-muted-foreground mt-0.5">
                            {c.email || 'Sem Email'} • Regra: {c.role}
                          </span>
                        </div>
                      </label>
                    ))
                  )}
                </div>
                {selectedCustomerSelection.length === 0 && (
                  <p className="text-sm text-destructive">Selecione pelo menos 1 cliente.</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4 pt-6 border-t">
            <div className="border rounded-lg p-6 bg-card shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Resumo do Desconto</h3>
                <p className="text-sm text-muted-foreground">
                  Confira as configurações antes de salvar.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                <div className="space-y-1">
                  <span className="font-medium text-muted-foreground block">Nome</span>
                  <span className="text-foreground">{watch('name') || '-'}</span>
                </div>
                <div className="space-y-1">
                  <span className="font-medium text-muted-foreground block">Desconto</span>
                  <span className="text-foreground">
                    {watch('discount_value') || 0}{' '}
                    {watch('discount_type')?.includes('amount') ||
                    watch('discount_type')?.includes('fixed')
                      ? 'USD'
                      : '%'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="font-medium text-muted-foreground block">Status / Período</span>
                  <span className="text-foreground">
                    {watch('status') === 'active' ? 'Ativo' : 'Inativo'} •{' '}
                    {watch('start_date')
                      ? new Date(watch('start_date')! + 'T00:00:00').toLocaleDateString()
                      : 'Imediato'}{' '}
                    até{' '}
                    {watch('end_date')
                      ? new Date(watch('end_date')! + 'T00:00:00').toLocaleDateString()
                      : 'Indeterminado'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="font-medium text-muted-foreground block">Beneficiários</span>
                  <span className="text-foreground">
                    {applicationType === 'all' && 'Todo o Site'}
                    {applicationType === 'rule' && `Regra: ${watch('customer_role') || '-'}`}
                    {applicationType === 'specific_customers' &&
                      `${selectedCustomerSelection.length} cliente(s)`}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="font-medium text-muted-foreground block">Alvo do Desconto</span>
                  <span className="text-foreground">
                    {targetType === 'all' && 'Todo o Site'}
                    {targetType === 'manufacturer' &&
                      `${selectedManufacturers.length} Fabricante(s)`}
                    {targetType === 'category' && `${selectedCategories.length} Categoria(s)`}
                    {targetType === 'manufacturer_category' &&
                      `${selectedManufacturers.length} Fabricante(s) e ${selectedCategories.length} Categoria(s)`}
                    {targetType === 'specific' &&
                      `${selectedSpecificProducts.length} produto(s) específicos`}
                  </span>
                </div>
                {targetType !== 'specific' && (
                  <div className="space-y-1">
                    <span className="font-medium text-muted-foreground block">Exceções</span>
                    <span className="text-foreground">
                      {excludedProducts.length} produto(s) excluído(s)
                    </span>
                  </div>
                )}
              </div>

              {saveError && (
                <div className="p-3 bg-destructive/10 text-destructive rounded-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <span className="text-sm font-medium">{saveError}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSubmit(onSubmit)}
                    className="h-8 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  >
                    Tentar Novamente
                  </Button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-end gap-4 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !isFormValid}
                  className="bg-green-600 hover:bg-green-700 text-white min-w-[120px] w-full sm:w-auto"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                    </>
                  ) : (
                    'Salvar Desconto'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </fieldset>
      </form>
    </div>
  )
}
