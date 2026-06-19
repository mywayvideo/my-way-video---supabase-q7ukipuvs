import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'

export function usePageTracking() {
  const location = useLocation()
  const { user } = useAuth()

  useEffect(() => {
    let sessionId = sessionStorage.getItem('mw_session_id')
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      sessionStorage.setItem('mw_session_id', sessionId)
    }

    const trackPage = async () => {
      try {
        const currentPath = location.pathname + location.search

        const { data } = await supabase
          .from('user_sessions')
          .select('id')
          .eq('session_id', sessionId)
          .is('logout_timestamp', null)
          .order('login_timestamp', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (data) {
          await supabase
            .from('user_sessions')
            .update({
              user_id: user?.id || null,
              page_viewed: currentPath,
              login_timestamp: new Date().toISOString(),
            })
            .eq('id', data.id)
        } else {
          await supabase.from('user_sessions').insert({
            session_id: sessionId,
            user_id: user?.id || null,
            page_viewed: currentPath,
            login_timestamp: new Date().toISOString(),
          })
        }
      } catch (err) {
        console.error('Failed to track page view', err)
      }
    }

    trackPage()
  }, [location.pathname, location.search, user])

  useEffect(() => {
    const handleBeforeUnload = () => {
      const sessionId = sessionStorage.getItem('mw_session_id')
      if (sessionId) {
        fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_sessions?session_id=eq.${sessionId}&logout_timestamp=is.null`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({ logout_timestamp: new Date().toISOString() }),
            keepalive: true,
          },
        ).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])
}
