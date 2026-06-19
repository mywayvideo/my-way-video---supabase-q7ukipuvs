import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

interface AuthContextType {
  currentUser: User | null
  session: Session | null
  loading: boolean
  user?: User | null
  signUp?: any
  signIn?: any
  signOut?: any
  login?: any
  logout?: any
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuthContext = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuthContext must be used within an AuthProvider')
  return context
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      setSession(session)
      setCurrentUser(session?.user ?? null)
      setLoading(false)
    })

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (!mounted) return
        if (error) {
          console.warn('Silent auth error:', error.message)
        }
        setSession(session)
        setCurrentUser(session?.user ?? null)
        setLoading(false)
      })
      .catch((err) => {
        if (!mounted) return
        console.warn('Silent auth error:', err.message)
        setLoading(false)
      })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signUp = async (email: string, password: string) => {
    return await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
  }
  const signIn = async (email: string, password: string) => {
    return await supabase.auth.signInWithPassword({ email, password })
  }
  const signOut = async () => {
    return await supabase.auth.signOut()
  }

  const value = {
    currentUser,
    user: currentUser,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    login: signIn,
    logout: signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
