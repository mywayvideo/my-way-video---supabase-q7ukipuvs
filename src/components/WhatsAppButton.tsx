import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

export function WhatsAppButton() {
  const [whatsappNumber, setWhatsappNumber] = useState('17867161170')

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'company_whatsapp')
      .single()
      .then(({ data }) => {
        if (data?.setting_value) {
          const cleanNumber = data.setting_value.replace(/\D/g, '')
          if (cleanNumber) {
            setWhatsappNumber(cleanNumber)
          }
        }
      })
  }, [])

  return (
    <a
      href={`https://wa.me/${whatsappNumber}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 p-4 bg-[#25D366] hover:bg-[#1DA851] text-white rounded-full shadow-lg shadow-[#25D366]/30 transition-all hover:scale-110 hover:shadow-xl flex items-center justify-center animate-fade-in-up"
      aria-label="Contato via WhatsApp"
    >
      <MessageCircle className="w-7 h-7" />
    </a>
  )
}
