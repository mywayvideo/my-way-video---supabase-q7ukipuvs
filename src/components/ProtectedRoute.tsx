import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { clearOrphanSession, markSessionExpiredNotice } from '@/utils/session-utils'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser: user, loading: authLoading } = useAuthContext()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionInvalid, setSessionInvalid] = useState(false)

  useEffect(() => {
    let isMounted = true

    if (authLoading) return

    if (!user) {
      if (isMounted) {
        setIsAdmin(false)
        setLoading(false)
      }
      return
    }

    const checkAdminStatus = async () => {
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
          setIsAdmin(data?.role === 'admin')
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
          setIsAdmin(false)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    checkAdminStatus()

    return () => {
      isMounted = false
    }
  }, [user, authLoading])

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

  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
