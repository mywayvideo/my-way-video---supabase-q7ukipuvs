import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

export function useUserRole() {
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.user) {
          setRole(null)
          setLoading(false)
          return
        }

        const { data, error } = await supabase
          .from('customers')
          .select('role')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (!error && data) {
          setRole(data.role)
        }
      } catch (err) {
        console.error('Error fetching user role:', err)
      } finally {
        setLoading(false)
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
      subscription.unsubscribe()
    }
  }, [])

  return { role, loading }
}
