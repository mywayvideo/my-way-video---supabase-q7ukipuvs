import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

export function useLegalSettings() {
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [adminEmail, setAdminEmail] = useState('admin@mywayvideo.com')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function fetchSettings() {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('setting_key, setting_value')
          .in('setting_key', [
            'company_address',
            'company_whatsapp',
            'company_phone',
            'company_admin_email',
          ])

        if (error) throw error

        if (data && mounted) {
          let foundPhone = ''
          let foundWhatsapp = ''

          data.forEach((setting) => {
            if (setting.setting_key === 'company_address') setAddress(setting.setting_value)
            if (setting.setting_key === 'company_whatsapp') foundWhatsapp = setting.setting_value
            if (setting.setting_key === 'company_phone') foundPhone = setting.setting_value
            if (setting.setting_key === 'company_admin_email') setAdminEmail(setting.setting_value)
          })

          if (foundWhatsapp) setPhone(foundWhatsapp)
          else if (foundPhone) setPhone(foundPhone)
        }
      } catch (error) {
        console.error('Error fetching legal settings:', error)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchSettings()

    return () => {
      mounted = false
    }
  }, [])

  return { address, phone, adminEmail, loading }
}
