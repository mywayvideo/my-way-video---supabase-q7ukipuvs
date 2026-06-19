import { supabase } from '@/lib/supabase/client'

export const adminService = {
  async fetchAllCustomers(page = 1, limit = 20, searchTerm = '', roleFilter = '') {
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase.from('customers').select('*', { count: 'exact' })

    if (searchTerm) {
      query = query.ilike('full_name', `%${searchTerm}%`)
    }
    if (roleFilter && roleFilter !== 'all') {
      query = query.eq('role', roleFilter)
    }

    const { data, error, count } = await query
      .range(from, to)
      .order('created_at', { ascending: false })
    if (error) throw error

    const mapped =
      data?.map((c) => ({
        ...c,
        email: `${(c.full_name || 'usuario').split(' ')[0].toLowerCase()}@example.com`,
      })) || []

    return { data: mapped, count }
  },

  async fetchAllDiscounts(page = 1, limit = 10, searchTerm = '') {
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
      .from('discount_rules')
      .select('*, discount_rule_customers(count)', { count: 'exact' })

    if (searchTerm) {
      query = query.ilike('rule_name', `%${searchTerm}%`)
    }

    const { data, error, count } = await query
      .range(from, to)
      .order('created_at', { ascending: false })
    if (error) throw error

    const mapped =
      data?.map((d) => ({
        ...d,
        customerCount: d.discount_rule_customers?.[0]?.count || 0,
      })) || []

    return { data: mapped, count }
  },

  async fetchAdminMetrics() {
    const { data: customers } = await supabase.from('customers').select('role')
    const totalCustomers = customers?.length || 0
    const customersByRole = { customer: 0, vip: 0, reseller: 0, collaborator: 0, admin: 0 }

    customers?.forEach((c) => {
      if (customersByRole[c.role as keyof typeof customersByRole] !== undefined) {
        customersByRole[c.role as keyof typeof customersByRole]++
      }
    })

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const { data: orders } = await supabase
      .from('orders')
      .select('total, discount_amount, created_at')
      .gte('created_at', startOfMonth)

    const totalOrders = orders?.length || 0
    const totalRevenue = orders?.reduce((acc, o) => acc + (o.total || 0), 0) || 0
    const totalDiscounts = orders?.reduce((acc, o) => acc + (o.discount_amount || 0), 0) || 0

    const startOfLastYear = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString()
    const { data: allOrders } = await supabase
      .from('orders')
      .select('total, created_at')
      .gte('created_at', startOfLastYear)

    const salesByMonthMap: Record<string, number> = {}
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthStr = d.toLocaleString('pt-BR', { month: 'short' })
      salesByMonthMap[monthStr] = 0
    }

    allOrders?.forEach((o) => {
      if (o.created_at) {
        const d = new Date(o.created_at)
        const monthStr = d.toLocaleString('pt-BR', { month: 'short' })
        if (salesByMonthMap[monthStr] !== undefined) {
          salesByMonthMap[monthStr] += o.total || 0
        }
      }
    })

    const salesByMonth = Object.entries(salesByMonthMap).map(([month, total]) => ({ month, total }))

    return {
      totalCustomers,
      customersByRole,
      totalOrders,
      totalRevenue,
      totalDiscounts,
      salesByMonth,
    }
  },

  async updateCustomerRole(customerId: string, newRole: string) {
    const { error } = await supabase
      .from('customers')
      .update({ role: newRole })
      .eq('id', customerId)
    if (error) throw error
  },

  async deleteDiscountRule(discountId: string) {
    const { error } = await supabase.from('discount_rules').delete().eq('id', discountId)
    if (error) throw error
  },

  async duplicateDiscountRule(discountId: string) {
    const { data: rule, error: fetchError } = await supabase
      .from('discount_rules')
      .select('*')
      .eq('id', discountId)
      .single()
    if (fetchError) throw fetchError
    if (rule) {
      const { id, created_at, updated_at, ...rest } = rule
      const copy = { ...rest, rule_name: `${rest.rule_name}_copy` }
      const { error: insertError } = await supabase.from('discount_rules').insert(copy)
      if (insertError) throw insertError
    }
  },
}
