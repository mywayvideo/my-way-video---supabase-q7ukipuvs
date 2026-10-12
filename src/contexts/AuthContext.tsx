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

    // Validação com servidor e timeout para evitar sessões órfãs presas no cliente
    let isCancelled = false
    const checkUser = async () => {
      try {
        const timeoutPromise = new Promise<{ user: User | null; error: any }>((resolve) => {
          setTimeout(() => {
            resolve({ user: null, error: new Error('Auth validation timeout') })
          }, 10000)
        })

        const getUserPromise = supabase.auth
          .getUser()
          .then(({ data, error }) => ({ user: data?.user ?? null, error }))
          .catch((err) => ({ user: null, error: err }))

        const result = await Promise.race([getUserPromise, timeoutPromise])

        if (!mounted || isCancelled) return

        if (result.error || !result.user) {
          // Sessão ausente ou rejeitada pelo servidor
          if (result.error) {
            console.warn('Sessão rejeitada ou expirada:', result.error.message || result.error)
          }
          setSession(null)
          setCurrentUser(null)
        } else {
          // Usuário validado no servidor
          const { data: sessionData } = await supabase.auth
            .getSession()
            .catch(() => ({ data: { session: null } }))
          if (mounted && !isCancelled) {
            setSession(sessionData.session)
            setCurrentUser(result.user)
          }
        }
      } catch (err: any) {
        if (!mounted || isCancelled) return
        console.warn('Erro ao validar usuário no servidor:', err?.message || err)
        setSession(null)
        setCurrentUser(null)
      } finally {
        if (mounted && !isCancelled) {
          setLoading(false)
        }
      }
    }

    checkUser()

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
