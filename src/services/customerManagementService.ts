import { supabase } from '@/lib/supabase/client'

export async function fetchAllCustomers(
  page: number,
  limit: number,
  searchTerm: string,
  statusFilter: string,
) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const user = session?.user
  let role = user?.app_metadata?.role || user?.user_metadata?.role

  if (user && role !== 'admin') {
    const { data: customerData } = await supabase
      .from('customers')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (customerData?.role) {
      role = customerData.role
    }
  }

  let query = supabase
    .from('customers')
    .select(
      'id, user_id, full_name, email, role, phone, status, created_at, last_login, cpf, billing_address, shipping_address',
      {
        count: 'exact',
      },
    )

  if (role !== 'admin' && user) {
    query = query.eq('user_id', user.id)
  }

  if (searchTerm) {
    query = query.or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
  }

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  const from = (page - 1) * limit
  const to = from + limit - 1

  console.log(
    'Query: SELECT id, user_id, full_name, email, role, phone, status, created_at, last_login, cpf, billing_address, shipping_address FROM customers',
  )

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.log('Query error: ' + error.message)
    console.error(error)
    throw new Error('Erro ao buscar clientes.')
  }

  let customersWithLogin = data || []

  if (customersWithLogin.length > 0) {
    const userIds = customersWithLogin.map((c: any) => c.user_id).filter(Boolean)
    if (userIds.length > 0) {
      const { data: sessions } = await supabase
        .from('user_sessions')
        .select('user_id, login_timestamp')
        .in('user_id', userIds)
        .order('login_timestamp', { ascending: false })

      if (sessions && sessions.length > 0) {
        customersWithLogin = customersWithLogin.map((c: any) => {
          const userSessions = sessions.filter((s) => s.user_id === c.user_id)
          const latestSession =
            userSessions.length > 0 ? userSessions[0].login_timestamp : c.last_login
          return { ...c, last_login: latestSession }
        })
      }
    }
  } else {
    console.log('Query returned empty array')
  }

  if (!customersWithLogin) {
    customersWithLogin = []
  }

  const totalCount = count || 0

  return { customers: customersWithLogin, total: totalCount }
}
