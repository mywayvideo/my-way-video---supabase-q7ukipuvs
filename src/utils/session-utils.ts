import { supabase } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

export const SESSION_EXPIRED_MESSAGE =
  'Sua sessão anterior expirou ou foi invalidada. Por favor, insira suas credenciais novamente.'

const SESSION_EXPIRED_FLAG = 'sb-session-expired-notice'

export function markSessionExpiredNotice(): void {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_FLAG, 'true')
  } catch {
    // noop
  }
}

export function consumeSessionExpiredNotice(): boolean {
  try {
    const hasNotice = sessionStorage.getItem(SESSION_EXPIRED_FLAG) === 'true'
    if (hasNotice) {
      sessionStorage.removeItem(SESSION_EXPIRED_FLAG)
      return true
    }
  } catch {
    // noop
  }
  return false
}

/**
 * Limpa qualquer sessão órfã / corrompida:
 * 1. signOut local via supabase.auth.signOut({ scope: 'local' }) em try/catch
 * 2. Remove todas as chaves com prefixo `sb-` do localStorage (tokens salvos do Supabase)
 * 3. Opcionalmente remove chaves auxiliares de sessão
 */
export async function clearOrphanSession(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch (err) {
    console.warn('Erro silencioso ao executar signOut local:', err)
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const keysToRemove: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)
        if (key && (key.startsWith('sb-') || key.includes('-auth-token'))) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((key) => {
        try {
          window.localStorage.removeItem(key)
        } catch {
          // noop
        }
      })
    }
  } catch (storageErr) {
    console.warn('Erro ao limpar tokens sb- do localStorage:', storageErr)
  }
}

/**
 * Valida o usuário atual no servidor via supabase.auth.getUser()
 * envolvido em Promise.race com timeout (padrão 10s).
 *
 * Se houver erro de autenticação (AuthSessionMissingError, JWT expirado, invalid claim, 401/403)
 * OU timeout de 10s:
 * - Executa clearOrphanSession()
 * - Retorna { user: null, error, timedOut }
 */
export async function validateServerUser(timeoutMs = 10000): Promise<{
  user: User | null
  error: Error | null
  timedOut: boolean
}> {
  let timeoutId: any = null

  const timeoutPromise = new Promise<{
    user: User | null
    error: Error | null
    timedOut: boolean
  }>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        user: null,
        error: new Error('Tempo limite excedido ao validar sessão com o servidor.'),
        timedOut: true,
      })
    }, timeoutMs)
  })

  const getUserPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.getUser()
      if (error) {
        return {
          user: null,
          error: new Error(error.message || 'Sessão inválida'),
          timedOut: false,
        }
      }
      return {
        user: data?.user ?? null,
        error: null,
        timedOut: false,
      }
    } catch (err: any) {
      return {
        user: null,
        error: err instanceof Error ? err : new Error(String(err)),
        timedOut: false,
      }
    }
  })()

  try {
    const result = await Promise.race([getUserPromise, timeoutPromise])
    if (timeoutId) clearTimeout(timeoutId)

    if (result.timedOut || result.error) {
      await clearOrphanSession()
    }

    return result
  } catch (raceErr: any) {
    if (timeoutId) clearTimeout(timeoutId)
    await clearOrphanSession()
    return {
      user: null,
      error: raceErr instanceof Error ? raceErr : new Error(String(raceErr)),
      timedOut: false,
    }
  }
}
