import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (!mounted) return
        if (error) {
          console.warn('Silent auth error:', error.message)
        }
        setUser(session?.user ?? null)
        setIsLoading(false)
      })
      .catch((err) => {
        if (!mounted) return
        console.warn('Silent auth error:', err.message)
        setIsLoading(false)
      })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { user, isLoading }
}
