import { ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { useAuthContext } from '@/contexts/AuthContext'

// Background sync for SIGNED_IN events
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    supabase.rpc('sync_current_user_profile').then()
  }
})

export interface CustomerProfile {
  id: string
  user_id: string
  full_name: string | null
  email: string | null
  phone: string | null
  cpf: string | null
  company_name: string | null
  role: string
  status: string
  [key: string]: any
}

// Deprecated: useAuth now maps directly to AuthContext to prevent conflicts
export const useAuth = () => {
  const context = useAuthContext()

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/`,
      },
    })
    return { error }
  }

  const signIn = async (email: string, password: string) => {
    try {
      await context.signIn(email, password)
      await supabase.rpc('sync_current_user_profile')
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const signOut = async () => {
    try {
      await context.signOut()
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    return { error }
  }

  const refreshProfile = async () => {
    // Handled by AuthContext realtime subscription
  }

  return {
    user: context.currentUser,
    currentUser: context.currentUser,
    session: null as Session | null, // Session not exposed by modern context
    profile: context.userMetadata as unknown as CustomerProfile | null,
    signUp,
    signIn,
    signOut,
    resetPassword,
    refreshProfile,
    loading: context.isLoading,
  }
}

// Deprecated: use AuthProvider from @/contexts/AuthContext instead
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  return <>{children}</>
}
