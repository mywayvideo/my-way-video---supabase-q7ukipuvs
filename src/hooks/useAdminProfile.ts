import { useState, useEffect, useCallback } from 'react'
import { adminProfileService } from '@/services/adminProfileService'
import { useAuthContext } from '@/contexts/AuthContext'

export function useAdminProfile() {
  const { currentUser: user } = useAuthContext()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProfile = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    try {
      const data = await adminProfileService.fetchAdminProfile(user.id)
      setProfile(data)
    } catch (err: any) {
      setError('Não foi possível carregar o perfil.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const updateProfile = async (data: any) => {
    if (!user?.id) throw new Error('Usuário não autenticado')
    await adminProfileService.updateAdminProfile(user.id, data)
    setProfile((prev: any) => ({ ...prev, ...data }))
  }

  const changePassword = async (curr: string, newP: string) => {
    if (!user?.id) throw new Error('Usuário não autenticado')
    await adminProfileService.changePassword(user.id, curr, newP)
  }

  const toggle2FA = async (enable: boolean) => {
    if (!user?.id) throw new Error('Usuário não autenticado')
    const res = await adminProfileService.toggle2FA(user.id, enable)
    setProfile((prev: any) => ({ ...prev, two_factor_enabled: enable }))
    return res
  }

  return { profile, loading, error, updateProfile, changePassword, toggle2FA, loadProfile }
}
