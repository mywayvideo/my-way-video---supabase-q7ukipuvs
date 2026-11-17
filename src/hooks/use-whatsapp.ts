import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

/**
 * Número de WhatsApp unificado do site (fonte única).
 *
 * Lê `company_whatsapp` de app_settings — a MESMA fonte que o botão
 * flutuante (WhatsAppButton), o rodapé e o Consultor IA já usam — e cai
 * para 17867161170 quando a configuração não está disponível.
 *
 * Nenhum componente deve montar seu próprio link wa.me com número
 * hardcoded: use este hook (ou um utilitário que o consuma).
 */
export const WHATSAPP_FALLBACK_NUMBER = '17867161170'

/**
 * Limpa o número para o formato internacional exigido pelo wa.me
 * (apenas dígitos, com código do país). Aceita formatos como
 * "+1 (786) 716-1170".
 */
export function cleanWhatsappNumber(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/\D/g, '')
}

export function useWhatsappNumber() {
  const [whatsappNumber, setWhatsappNumber] = useState(WHATSAPP_FALLBACK_NUMBER)

  useEffect(() => {
    let mounted = true
    supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'company_whatsapp')
      .single()
      .then(({ data }) => {
        if (!mounted) return
        const clean = cleanWhatsappNumber(data?.setting_value)
        if (clean) setWhatsappNumber(clean)
      })
    return () => {
      mounted = false
    }
  }, [])

  /**
   * Abre o WhatsApp com o número unificado. `message` é o texto puro
   * (a codificação da URL é feita aqui).
   */
  const openWhatsapp = (message: string) => {
    const text = encodeURIComponent(message)
    window.open(`https://wa.me/${whatsappNumber}?text=${text}`, '_blank')
  }

  return { whatsappNumber, openWhatsapp }
}
