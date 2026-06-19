export interface Customer {
  id: string
  user_id: string
  full_name: string | null
  phone: string | null
  date_of_birth: string | null
  gender: string | null
  company_name: string | null
  profile_photo_url: string | null
  cpf: string | null
  created_at: string
  updated_at: string
  email?: string
}

export interface Product {
  id: string
  name: string
  price_usd: number | null
  image_url: string | null
  manufacturer_id: string | null
  category: string | null
  manufacturers?: { name: string }
}

export interface Favorite {
  id: string
  customer_id: string
  product_id: string
  products?: Product
}

export interface CartItem {
  id: string
  cart_id: string
  product_id: string
  quantity: number
  products?: Product
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  unit_price: number
  total_price: number
  products?: Product
}

export interface Order {
  id: string
  customer_id: string
  order_number: string
  status: string
  total: number
  discount_amount: number | null
  created_at: string
  order_items?: OrderItem[]
}

export interface DiscountRule {
  id: string
  rule_name: string
  discount_value: number
  discount_calculation_type: string
  scope_type: string
  is_active: boolean
}

export interface DiscountRuleCustomer {
  id: string
  discount_rule_id: string
  customer_id: string
  discount_rules?: DiscountRule
}

export interface CustomerAddress {
  id: string
  customer_id: string
  address_type: 'shipping' | 'billing'
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
  zip_code: string
  country: string
  is_default: boolean
  created_at: string
  updated_at: string
}
