import { supabase } from '@/lib/supabase/client'

export const processSquarePayment = async (sourceId: string, amount: number, orderId: string) => {
  const { data, error } = await supabase.functions.invoke('square-payment', {
    body: { sourceId, amount, orderId },
  })

  if (error) {
    let errorMessage = 'Pagamento recusado pelo provedor.'

    if (data?.error) {
      errorMessage = data.error
    } else {
      try {
        if (error.context && typeof error.context.json === 'function') {
          const bodyJson = await error.context.json()
          if (bodyJson?.error) errorMessage = bodyJson.error
        } else if (error.context && typeof error.context.text === 'function') {
          const bodyStr = await error.context.text()
          const bodyJson = JSON.parse(bodyStr)
          if (bodyJson?.error) errorMessage = bodyJson.error
        } else if (
          error.message &&
          error.message !== 'Edge Function returned a non-2xx status code'
        ) {
          errorMessage = error.message
        }
      } catch {
        if (error.message && error.message !== 'Edge Function returned a non-2xx status code') {
          errorMessage = error.message
        }
      }
    }

    throw new Error(errorMessage)
  }

  if (data?.error) throw new Error(data.error)

  return data
}
