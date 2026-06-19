export interface StripePaymentState {
  status: 'idle' | 'loading' | 'confirming' | 'success' | 'error'
  confirmationStep: boolean
  clientSecret: string | null
  paymentIntentId: string | null
  errorMessage: string | null
}

declare global {
  interface Window {
    Stripe: any
  }
}
