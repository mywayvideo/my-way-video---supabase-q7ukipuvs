export interface Discount {
  id: string
  name: string
  description?: string | null
  discount_type: string
  discount_value: number
  product_selection?: any | null
  start_date?: string | null
  end_date?: string | null
  is_active?: boolean | null
  created_at?: string | null
  updated_at?: string | null
  customer_application_type?: string | null
  customer_role?: string | null
  customers?: string[] | null
  target_type?: string | null
  excluded_products?: string[] | null
  category_id?: string | null
  manufacturer_id?: string | null
}

export interface DiscountRule {
  id: string
  rule_name: string
  rule_type: string
  discount_calculation_type: string
  discount_value: number
  scope_type: string
  scope_data: any
  application_type: string | null
  role: string | null
  customers: string[] | null
  start_date: string | null
  end_date: string | null
  is_active: boolean | null
}
