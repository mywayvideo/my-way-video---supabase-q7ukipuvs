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
  manufacturer?: Manufacturer
}

export type CompanyInfo = {
  id: string
  content: string
  updated_at: string
}
