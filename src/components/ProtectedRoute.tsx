import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { clearOrphanSession, markSessionExpiredNotice } from '@/utils/session-utils'

type AllowedRole = 'admin' | 'reviewer' | 'catalog_manager'

/**
 * Protege rotas administrativas.
 *
 * Por padrão exige `admin` (comportamento histórico). Rotas que também devem
 * aceitar o Revisor de Categorias e NCMs passam `allow="staff"`.
 *
 * `allow="catalog"` aceita admin e catalog_manager — usado nas telas de
 * cadastro/edição de produto e importação, que o gestor de catálogo opera mas
 * onde o revisor não tem o que fazer.
 *
 * A restrição é de INTERFACE. O bloqueio efetivo de gravação é do banco (RLS).
 */
export default function ProtectedRoute({
  children,
  allow = 'admin',
}: {
  children: React.ReactNode
  allow?: AllowedRole | 'staff' | 'catalog'
}) {
  const { currentUser: user, loading: authLoading } = useAuthContext()
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionInvalid, setSessionInvalid] = useState(false)

  useEffect(() => {
    let isMounted = true

    if (authLoading) return

    if (!user) {
      if (isMounted) {
        setRole(null)
        setLoading(false)
      }
      return
    }

    const checkRole = async () => {
      try {
        // Validação com timeout de 8s no servidor
        const roleTimeoutPromise = new Promise<any>((_, reject) => {
          setTimeout(() => reject(new Error('Timeout ao verificar papel do usuário')), 8000)
        })

        const queryPromise = supabase
          .from('customers')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle()

        const { data, error } = await Promise.race([queryPromise, roleTimeoutPromise])

        if (error) throw error

        if (isMounted) {
          setRole((data?.role as string) ?? 'customer')
        }
      } catch (error: any) {
        console.error('Error fetching user role:', error)
        // Se houve erro de autenticação ou timeout, limpa sessão órfã e direciona para login
        if (
          error?.status === 401 ||
          error?.status === 403 ||
          error?.message?.includes('JWT') ||
          error?.message?.includes('Timeout')
        ) {
          await clearOrphanSession()
          markSessionExpiredNotice()
          if (isMounted) {
            setSessionInvalid(true)
          }
        }
        if (isMounted) {
          setRole(null)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    checkRole()

    return () => {
      isMounted = false
    }
  }, [user, authLoading, allow])

  if (sessionInvalid) {
    return <Navigate to="/login" replace />
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const allowed =
    allow === 'staff'
      ? role === 'admin' || role === 'reviewer' || role === 'catalog_manager'
      : allow === 'catalog'
        ? role === 'admin' || role === 'catalog_manager'
        : role === allow

  if (!allowed) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
