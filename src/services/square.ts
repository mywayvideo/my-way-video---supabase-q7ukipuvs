import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'

export const processSquarePayment = async (sourceId: string, amount: number, orderId: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('square-payment', {
      body: { sourceId, amount, orderId },
    })

    if (error) {
      let errorMessage = 'Erro ao processar pagamento.'
      try {
        if (error.context && typeof error.context.json === 'function') {
          const bodyJson = await error.context.json()
          if (bodyJson.error) errorMessage = bodyJson.error
        } else if (error.context && typeof error.context.text === 'function') {
          const bodyStr = await error.context.text()
          const bodyJson = JSON.parse(bodyStr)
          if (bodyJson.error) errorMessage = bodyJson.error
        } else if (
          error.message &&
          error.message !== 'Edge Function returned a non-2xx status code'
        ) {
          errorMessage = error.message
        }
      } catch {
        // ignore parsing errors
      }
      throw new Error(errorMessage)
    }

    if (data?.error) throw new Error(data.error)

    toast.success('Pagamento processado com sucesso!')
    return data
  } catch (error: any) {
    console.error('Erro no pagamento via Square:', error)
    toast.error(error.message || 'Erro ao processar pagamento. Tente novamente.')
    throw error
  }
}
