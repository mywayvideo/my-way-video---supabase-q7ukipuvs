import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser: user, loading: authLoading } = useAuthContext()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

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
        const { data, error } = await supabase
          .from('customers')
          .select('role')
          .eq('user_id', user.id)
          .single()

        if (error) throw error

        if (isMounted) {
          setIsAdmin(data?.role === 'admin')
        }
      } catch (error) {
        console.error('Error fetching user role:', error)
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
