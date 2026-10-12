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

    const timeoutPromise = new Promise<{ user: User | null }>((resolve) => {
      setTimeout(() => resolve({ user: null }), 10000)
    })

    const getUserPromise = supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (error) {
          console.warn('Silent auth error:', error.message)
          return { user: null }
        }
        return { user: data?.user ?? null }
      })
      .catch((err) => {
        console.warn('Silent auth error:', err?.message || err)
        return { user: null }
      })

    Promise.race([getUserPromise, timeoutPromise])
      .then((res) => {
        if (!mounted) return
        setUser(res.user)
      })
      .catch(() => {
        if (!mounted) return
        setUser(null)
      })
      .finally(() => {
        if (!mounted) return
        setIsLoading(false)
      })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { user, isLoading }
}
