import { z } from 'zod'

export const productSchema = z.object({
  name: z.string().min(5, 'Mínimo de 5 caracteres'),
  sku: z.string().min(1, 'Campo obrigatório'),
  price_cost: z.coerce.number().optional(),
  price_usa: z.coerce.number().min(0.01, 'Deve ser maior que zero'),
  price_brl: z.coerce.number().optional(),
  stock: z.coerce.number().optional(),
  category_id: z.string().uuid('Categoria inválida'),
  description: z.string().min(10, 'Mínimo de 10 caracteres'),
  weight: z.coerce.number().min(0.01, 'Deve ser maior que zero'),
  dimensions: z
    .string()
    .regex(/^\d+(\.\d+)?x\d+(\.\d+)?x\d+(\.\d+)?$/i, 'Formato inválido (ex: 10x10x10)'),
  image_url: z.string().url('URL inválida').optional().or(z.literal('')),
  ncm: z.string().regex(/^\d{8}$/, 'Deve conter exatamente 8 dígitos'),
  is_special: z.boolean().default(false),
  technical_info: z.string().optional(),
  is_discontinued: z.boolean().default(false),
  manual_related_ids: z.array(z.string()).optional().default([]),
  ai_related_ids: z.array(z.string()).optional().default([]),
  price_nationalized_sales: z.coerce.number().optional(),
  price_nationalized_cost: z.coerce.number().optional(),
  price_nationalized_currency: z.string().optional().default('BRL'),
  price_usa_rebate: z.coerce.number().optional().nullable(),
  price_cost_rebate: z.coerce.number().optional().nullable(),
  date_rebate: z.string().optional().nullable(),
})

export type ProductFormData = z.infer<typeof productSchema>
