import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'

export const useStripePayment = () => {
  const [stripe, setStripe] = useState<any>(null)
  const [elements, setElements] = useState<any>(null)
  const [cardElement, setCardElement] = useState<any>(null)
  const [isCardReady, setIsCardReady] = useState(false)
  const [stripeLoading, setStripeLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const initStripe = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'stripe_publishable_key')
          .single()

        if (error || !data || !data.setting_value) {
          if (mounted) setStripeLoading(false)
          return
        }

        const publishableKey = data.setting_value

        const initInstance = (pk: string) => {
          if (!mounted) return
          const stripeInstance = window.Stripe(pk)
          setStripe(stripeInstance)
          const elementsInstance = stripeInstance.elements()
          setElements(elementsInstance)
          setStripeLoading(false)
        }

        if (!window.Stripe) {
          const script = document.createElement('script')
          script.src = 'https://js.stripe.com/v3/'
          script.async = true
          script.onload = () => {
            if (mounted) initInstance(publishableKey)
          }
          document.head.appendChild(script)
        } else {
          initInstance(publishableKey)
        }
      } catch {
        if (mounted) setStripeLoading(false)
      }
    }

    initStripe()

    return () => {
      mounted = false
    }
  }, [])

  const cardRef = useRef<any>(null)

  const mountCardElement = useCallback(
    (node: HTMLDivElement | null) => {
      if (!elements) return

      if (node) {
        if (!cardRef.current) {
          const card = elements.create('card', {
            style: {
              base: {
                fontSize: '16px',
                color: '#334155',
                '::placeholder': {
                  color: '#94a3b8',
                },
              },
              invalid: {
                color: '#ef4444',
              },
            },
          })

          card.on('ready', () => {
            setIsCardReady(true)
          })

          card.mount(node)
          cardRef.current = card
          setCardElement(card)
        } else {
          try {
            cardRef.current.mount(node)
          } catch (e) {
            // Ignore if already mounted
          }
        }
      } else {
        if (cardRef.current) {
          cardRef.current.unmount()
        }
      }
    },
    [elements],
  )

  const unmountCardElement = useCallback(() => {
    if (cardRef.current) {
      cardRef.current.destroy()
      cardRef.current = null
      setCardElement(null)
      setIsCardReady(false)
    }
  }, [])

  return {
    stripe,
    elements,
    cardElement,
    isCardReady,
    stripeLoading,
    mountCardElement,
    unmountCardElement,
  }
}
