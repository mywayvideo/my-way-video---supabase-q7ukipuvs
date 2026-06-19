export type CancellationReason =
  | 'Mudei de ideia'
  | 'Encontrei preco melhor'
  | 'Nao preciso mais'
  | 'Produto nao atende minhas necessidades'
  | 'Outro'

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  unit_price: number
  total_price: number
  products?: any
}

export interface Order {
  id: string
  customer_id: string
  order_number: string
  status: string
  shipping_address_id: string | null
  billing_address_id: string | null
  payment_method_id: string | null
  payment_method_type: string | null
  subtotal: number
  discount_amount: number | null
  tax_amount: number | null
  shipping_cost: number | null
  total: number
  shipping_method: string | null
  tracking_number: string | null
  estimated_delivery_date: string | null
  created_at: string
  updated_at: string
  payment_data?: any
  order_items?: OrderItem[]
}
