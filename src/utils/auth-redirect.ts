import { supabase } from '@/lib/supabase/client'

export const ADMIN_DASHBOARD_PATH = '/dashboard-admin'
export const CUSTOMER_DASHBOARD_PATH = '/dashboard'

/**
 * Retorna o caminho do dashboard de acordo com o papel (role) do usuário.
 * Admin vai para /dashboard-admin; cliente (ou qualquer outro papel) vai para /dashboard.
 */
export function getDashboardPathForRole(role?: string | null): string {
  return role === 'admin' ? ADMIN_DASHBOARD_PATH : CUSTOMER_DASHBOARD_PATH
}

/**
 * Consulta a tabela 'customers' para determinar se o user_id fornecido é admin
 * e retorna a rota apropriada do dashboard (/dashboard-admin ou /dashboard).
 */
export async function resolveDashboardRouteForUserId(userId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('Erro ao verificar papel do usuário:', error)
      return CUSTOMER_DASHBOARD_PATH
    }

    return getDashboardPathForRole(data?.role)
  } catch (err) {
    console.error('Erro ao resolver rota de dashboard:', err)
    return CUSTOMER_DASHBOARD_PATH
  }
}
