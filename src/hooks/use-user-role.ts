import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

/**
 * Papéis do sistema:
 *  - admin           : acesso completo (CRUD de categorias e produtos)
 *  - reviewer        : Revisor de Categorias e NCMs — lê tudo, classifica
 *                      produtos, exporta listas, mas NÃO cria/edita/exclui
 *                      categoria nem produto.
 *  - catalog_manager : Gestor de Catálogo — cadastra e edita produto (inclusive
 *                      price_usd) e acessa as telas de cadastro/importação.
 *                      NÃO exclui produto e NÃO mexe em categorias.
 *
 * O bloqueio real é feito no banco (RLS). Este hook existe para a UI não
 * oferecer botões que o banco irá recusar.
 */
export type UserRole = 'admin' | 'reviewer' | 'catalog_manager' | 'customer' | null

export function useUserRole() {
  const [role, setRole] = useState<UserRole>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const fetchRole = async () => {
      try {
        const timeoutPromise = new Promise<{ user: any }>((resolve) => {
          setTimeout(() => resolve({ user: null }), 10000)
        })
        const getUserPromise = supabase.auth
          .getUser()
          .then(({ data }) => ({ user: data?.user ?? null }))
          .catch(() => ({ user: null }))

        const { user } = await Promise.race([getUserPromise, timeoutPromise])

        if (!mounted) return

        if (!user) {
          setRole(null)
          setLoading(false)
          return
        }

        const { data, error } = await supabase
          .from('customers')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle()

        if (!mounted) return
        if (!error && data) {
          setRole((data.role as UserRole) ?? 'customer')
        }
      } catch (err) {
        console.error('Error fetching user role:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchRole()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchRole()
      } else {
        setRole(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const isAdmin = role === 'admin'
  const isReviewer = role === 'reviewer'
  const isCatalogManager = role === 'catalog_manager'
  /**
   * Staff = quem enxerga o painel administrativo.
   * admin, reviewer e catalog_manager.
   */
  const isStaff = isAdmin || isReviewer || isCatalogManager

  return { role, loading, isAdmin, isReviewer, isCatalogManager, isStaff }
}
