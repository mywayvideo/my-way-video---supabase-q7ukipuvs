import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'

export const processSquarePayment = async (sourceId: string, amount: number, orderId: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('square-payment', {
      body: { sourceId, amount, orderId },
    })

    if (error) throw error
    if (data?.error) throw new Error(data.error)

    toast.success('Pagamento processado com sucesso!')
    return data
  } catch (error: any) {
    console.error('Erro no pagamento via Square:', error)
    toast.error('Erro ao processar pagamento: ' + (error.message || 'Tente novamente.'))
    throw error
  }
}
