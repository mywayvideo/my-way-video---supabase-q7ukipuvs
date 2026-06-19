import { supabase } from '@/lib/supabase/client'

export const adminProfileService = {
  async fetchAdminProfile(userId: string) {
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (customerError) throw customerError

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError) throw userError

    if (!customer.last_login && user?.last_sign_in_at) {
      await supabase
        .from('customers')
        .update({ last_login: user.last_sign_in_at })
        .eq('user_id', userId)
      customer.last_login = user.last_sign_in_at
    }

    return { ...customer, email: user?.email }
  },

  async updateAdminProfile(userId: string, data: any) {
    const { error } = await supabase.from('customers').update(data).eq('user_id', userId)
    if (error) throw error
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const { data, error } = await supabase.functions.invoke('change-admin-password', {
      body: { user_id: userId, current_password: currentPassword, new_password: newPassword },
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    return data
  },

  async toggle2FA(userId: string, enable: boolean) {
    const { data, error } = await supabase.functions.invoke('toggle-2fa', {
      body: { user_id: userId, enable },
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    return data
  },
}
