import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Database } from '@/lib/supabase/types'

type CacheEntry = Database['public']['Tables']['product_search_cache']['Row']

const formSchema = z.object({
  search_query: z.string().min(1, 'Obrigatório'),
  product_name: z.string().min(1, 'Obrigatório'),
  product_description: z.string().optional(),
  product_price: z.preprocess(
    (val) => (val === '' || val == null ? undefined : Number(val)),
    z.number().min(0, 'Deve ser positivo').optional().nullable(),
  ),
  product_currency: z.enum(['USD', 'BRL', 'EUR']).default('USD'),
  product_image_url: z.string().url('URL inválida').optional().or(z.literal('')),
  product_specs: z
    .string()
    .optional()
    .refine((v) => {
      if (!v) return true
      try {
        JSON.parse(v)
        return true
      } catch {
        return false
      }
    }, 'JSON inválido (use aspas duplas)'),
  source: z.enum(['ai_generated', 'manual_entry', 'web_search']).default('manual_entry'),
})

export type ProductCacheFormValues = z.infer<typeof formSchema>

interface Props {
  initialData?: CacheEntry | null
  onSubmit: (values: ProductCacheFormValues) => void
  onCancel?: () => void
  loading?: boolean
}

export function AdminCacheForm({ initialData, onSubmit, onCancel, loading }: Props) {
  const form = useForm<ProductCacheFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      search_query: '',
      product_name: '',
      product_description: '',
      product_price: '' as any,
      product_currency: 'USD',
      product_image_url: '',
      product_specs: '',
      source: 'manual_entry',
    },
  })

  useEffect(() => {
    if (initialData) {
      form.reset({
        search_query: initialData.search_query,
        product_name: initialData.product_name,
        product_description: initialData.product_description || '',
        product_price: initialData.product_price ?? ('' as any),
        product_currency: (initialData.product_currency as any) || 'USD',
        product_image_url: initialData.product_image_url || '',
        product_specs: initialData.product_specs
          ? JSON.stringify(initialData.product_specs, null, 2)
          : '',
        source: (initialData.source as any) || 'manual_entry',
      })
    } else {
      form.reset()
    }
  }, [initialData, form])

  const mkInput = (
    name: keyof ProductCacheFormValues,
    label: string,
    type = 'text',
    step?: string,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={type}
              step={step}
              {...field}
              value={field.value ?? ''}
              disabled={loading}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {mkInput('search_query', 'Query de Pesquisa')}
          {mkInput('product_name', 'Nome do Produto')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {mkInput('product_price', 'Preço (Opcional)', 'number', '0.01')}
          <FormField
            control={form.control}
            name="product_currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Moeda</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={loading}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="BRL">BRL</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="source"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fonte</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={loading}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="manual_entry">Entrada Manual</SelectItem>
                  <SelectItem value="ai_generated">Gerado por IA</SelectItem>
                  <SelectItem value="web_search">Busca Web</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="product_description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} disabled={loading} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {mkInput('product_image_url', 'URL da Imagem')}
        <FormField
          control={form.control}
          name="product_specs"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Especificações (JSON)</FormLabel>
              <FormControl>
                <Textarea
                  className="font-mono text-xs"
                  {...field}
                  value={field.value ?? ''}
                  disabled={loading}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              form.reset()
              onCancel?.()
            }}
            disabled={loading}
          >
            Limpar
          </Button>
          <Button type="submit" disabled={loading}>
            {initialData ? 'Atualizar' : 'Adicionar Produto'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
