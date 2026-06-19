import { supabase } from '@/lib/supabase/client'
import { AuthResponse } from '@/types/auth'

// Setup global auth listener for auto-logout
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
    const hadToken =
      localStorage.getItem('supabase-auth-token') || localStorage.getItem('auth-token')
    if (hadToken) {
      localStorage.removeItem('auth-token') // Cleanup old key
      localStorage.removeItem('supabase-auth-token')
      localStorage.removeItem('supabase-refresh-token')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
  } else if (session) {
    localStorage.setItem('supabase-auth-token', session.access_token)
    localStorage.setItem('supabase-refresh-token', session.refresh_token)
  }
})

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        return { success: false, error: error.message }
      }

      if (data.session) {
        localStorage.setItem('supabase-auth-token', data.session.access_token)
        localStorage.setItem('supabase-refresh-token', data.session.refresh_token)

        if (data.user) {
          const now = new Date().toISOString()
          await supabase.from('customers').update({ last_login: now }).eq('user_id', data.user.id)
          await supabase
            .from('user_sessions')
            .insert({ user_id: data.user.id, login_timestamp: now })
        }
      }

      return { success: true, token: data.session?.access_token }
    } catch (err: any) {
      return { success: false, error: err.message || 'network_error' }
    }
  },

  async signup(full_name: string, email: string, password: string): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: full_name,
          },
        },
      })

      if (error) {
        return { success: false, error: error.message }
      }

      if (data.session) {
        localStorage.setItem('supabase-auth-token', data.session.access_token)
        localStorage.setItem('supabase-refresh-token', data.session.refresh_token)
      }

      return { success: true, token: data.session?.access_token }
    } catch (err: any) {
      return { success: false, error: err.message || 'network_error' }
    }
  },
}
