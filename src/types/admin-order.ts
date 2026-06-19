export interface AdminOrder {
  id: string
  order_number: string
  customer_id: string
  customer_name: string
  customer_email: string
  total_amount: number
  status: string
  payment_method: string
  created_at: string
  updated_at: string
  items_count: number
  notes: string
}
