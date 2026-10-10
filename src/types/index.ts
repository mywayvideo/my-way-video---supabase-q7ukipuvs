export type Manufacturer = {
  id: string
  name: string
  created_at?: string
}

export type Product = {
  id: string
  manufacturer_id: string | null
  name: string
  sku: string | null
  description: string | null
  price_usd: number
  price_cost: number
  price_brl: number
  stock: number
  image_url: string | null
  ncm: string | null
  weight: number | null
  dimensions: string | null
  category: string | null
  is_special: boolean
  is_discontinued: boolean
  created_at?: string
  updated_at?: string
  last_reviewed_at?: string
  website_url?: string | null
  price_usa_rebate?: number | null
  price_cost_rebate?: number | null
  date_rebate?: string | null
  manufacturer?: Manufacturer
}

export type CompanyInfo = {
  id: string
  content: string
  updated_at: string
}
