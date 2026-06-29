export const STRIPE_KEY_ERROR_MESSAGE =
  'Chave Stripe nao configurada no servidor. Contate o suporte. (Missing: STRIPE_RESTRICTED_KEY or STRIPE_SECRET_KEY)'

export function getStripeKey(): string | null {
  const restrictedKey = Deno.env.get('STRIPE_RESTRICTED_KEY')
  if (restrictedKey && restrictedKey.trim().length > 0) {
    return restrictedKey.trim()
  }

  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (secretKey && secretKey.trim().length > 0) {
    return secretKey.trim()
  }

  return null
}

export function buildMissingKeyResponse(): Response {
  console.error('Stripe key not found. Checked: STRIPE_RESTRICTED_KEY, STRIPE_SECRET_KEY')
  return new Response(
    JSON.stringify({
      error: STRIPE_KEY_ERROR_MESSAGE,
      code: 'STRIPE_KEY_MISSING',
    }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}
