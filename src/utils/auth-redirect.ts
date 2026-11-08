import { supabase } from '@/lib/supabase/client'

export const ADMIN_DASHBOARD_PATH = '/dashboard-admin'
export const CUSTOMER_DASHBOARD_PATH = '/dashboard'

export const CATALOG_HOME_PATH = '/admin/catalog'

/**
 * Retorna o caminho do dashboard de acordo com o papel (role) do usuário.
 *
 *  - admin           → /dashboard-admin (painel completo, com vendas)
 *  - catalog_manager → /admin/catalog   (hub do catálogo)
 *  - demais          → /dashboard        (área do cliente)
 *
 * IMPORTANTE: o catalog_manager NÃO vai para /dashboard-admin de propósito.
 * Aquele painel mostra pedidos, receita e clientes — conteúdo fora do escopo
 * de um gestor de catálogo. A rota também é admin-only, então mandá-lo para lá
 * resultaria em redirecionamento para a home.
 */
export function getDashboardPathForRole(role?: string | null): string {
  if (role === 'admin') return ADMIN_DASHBOARD_PATH
  if (role === 'catalog_manager') return CATALOG_HOME_PATH
  return CUSTOMER_DASHBOARD_PATH
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
