import { supabase } from '@/lib/supabase/client'
import { AdminOrder } from '@/types/admin-order'

export interface GetOrdersFilters {
  status?: string
  startDate?: string
  endDate?: string
  search?: string
  minAmount?: number
  maxAmount?: number
  page?: number
  limit?: number
}

export const adminOrdersService = {
  getOrders: async (filters: GetOrdersFilters) => {
    const {
      status,
      startDate,
      endDate,
      search,
      minAmount,
      maxAmount,
      page = 1,
      limit = 10,
    } = filters
    let query = supabase
      .from('orders')
      .select('*, customers!inner(full_name, email), order_items(id)', { count: 'exact' })

    if (status && status !== 'ALL') {
      query = query.eq('status', status)
    }
    if (startDate) {
      query = query.gte('created_at', startDate)
    }
    if (endDate) {
      query = query.lte('created_at', `${endDate}T23:59:59.999Z`)
    }
    if (minAmount !== undefined) {
      query = query.gte('total', minAmount)
    }
    if (maxAmount !== undefined) {
      query = query.lte('total', maxAmount)
    }
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`, {
        foreignTable: 'customers',
      })
    }

    query = query.order('created_at', { ascending: false })

    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data, error, count } = await query
    if (error) throw error

    const orders: AdminOrder[] = data.map((o: any) => ({
      id: o.id,
      order_number: o.order_number,
      customer_id: o.customer_id,
      customer_name: o.customers?.full_name || '',
      customer_email: o.customers?.email || '',
      total_amount: o.total,
      status: o.status,
      payment_method: o.payment_method_type || '',
      created_at: o.created_at,
      updated_at: o.updated_at,
      items_count: o.order_items?.length || 0,
      notes: o.notes || '',
    }))

    return { orders, count }
  },

  updateOrderStatus: async (orderId: string, newStatus: string) => {
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    if (error) throw error
  },

  rejectOrder: async (orderId: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId)
    if (error) throw error
  },

  processRefund: async (orderId: string, refundData: any) => {
    const { error } = await supabase.from('order_refunds').insert({
      order_id: orderId,
      amount: refundData.amount,
      reason: refundData.reason,
      bank_holder_name: refundData.bankHolderName,
      bank_account_number: refundData.bankAccountNumber,
      bank_routing_number: refundData.bankRoutingNumber,
      bank_name: refundData.bankName,
    })
    if (error) throw error
  },

  updateOrderNotes: async (orderId: string, notes: string) => {
    const { error } = await supabase.from('orders').update({ notes }).eq('id', orderId)
    if (error) throw error
  },

  getOrderDetails: async (orderId: string) => {
    const { data, error } = await supabase
      .from('orders')
      .select(`
           *,
           customers!inner(full_name, email, phone),
           order_items(id, product_id, quantity, unit_price, total_price, products(name)),
           shipping_address:customer_addresses!orders_shipping_address_id_fkey(*),
           billing_address:customer_addresses!orders_billing_address_id_fkey(*)
        `)
      .eq('id', orderId)
      .single()

    if (error) throw error
    return data
  },
}
