import { useState, useEffect, useCallback, useRef } from 'react'

const STRIPE_PK =
  'pk_test_51TJNpuCdgoPTpkApWlzlJzlPeqsTHmrbITutsHkVq8zI9yeux7hVXYGN1ygGKTu9vFZUguDO3muKjI2E7ezvI8vw00APSiHyYh'

export const useStripePayment = () => {
  const [stripe, setStripe] = useState<any>(null)
  const [elements, setElements] = useState<any>(null)
  const [cardElement, setCardElement] = useState<any>(null)
  const [isCardReady, setIsCardReady] = useState(false)

  useEffect(() => {
    if (!window.Stripe) {
      const script = document.createElement('script')
      script.src = 'https://js.stripe.com/v3/'
      script.async = true
      script.onload = () => {
        const stripeInstance = window.Stripe(STRIPE_PK)
        setStripe(stripeInstance)
        const elementsInstance = stripeInstance.elements()
        setElements(elementsInstance)
      }
      document.head.appendChild(script)
    } else {
      const stripeInstance = window.Stripe(STRIPE_PK)
      setStripe(stripeInstance)
      const elementsInstance = stripeInstance.elements()
      setElements(elementsInstance)
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
    mountCardElement,
    unmountCardElement,
  }
}
