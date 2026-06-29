import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'

const DEFAULT_FROM_EMAIL = 'support@noreply.mywayvideo.com'
const DEFAULT_FROM_NAME = 'MY WAY VIDEO'
const BRAND_LOGO_URL =
  'https://ymlkyspcznrrmlktudxx.supabase.co/storage/v1/object/public/brand-assets/my-way-video-logo.png'

const formatCurrency = (value: any, currency: string | null): string => {
  const num = Number(value || 0)
  if (currency === 'BRL' || currency === 'Brazil') {
    return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `US$ ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatShippingLabel = (shippingCost: number, currency: string | null): string => {
  if (!shippingCost || shippingCost === 0) return 'incluso'
  return formatCurrency(shippingCost, currency)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json()
    const {
      to,
      subject,
      htmlContent,
      fromEmail = DEFAULT_FROM_EMAIL,
      fromName = DEFAULT_FROM_NAME,
      pricingContext,
      shippingContext,
    } = body || {}

    if (pricingContext) {
      const { country, itemCount, nationalizedItems } = pricingContext
      const resolvedCurrency =
        country &&
        (country.toLowerCase() === 'brasil' ||
          country.toLowerCase() === 'brazil' ||
          country.toLowerCase() === 'br')
          ? 'BRL'
          : 'USD'
      console.log(
        `[send-order-email] Pricing context: country=${country}, items=${itemCount}, nationalized=${nationalizedItems}, resolvedCurrency=${resolvedCurrency}`,
      )
    }

    if (shippingContext) {
      const { shippingCost, isIncluded } = shippingContext
      const label = formatShippingLabel(Number(shippingCost || 0), pricingContext?.country || null)
      console.log(
        `[send-order-email] Shipping context: cost=${shippingCost}, isIncluded=${isIncluded}, label=${label}`,
      )
    }

    if (!to || !subject || !htmlContent) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields (to, subject, htmlContent).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const brandedHtml = htmlContent.includes(BRAND_LOGO_URL) ? htmlContent : htmlContent

    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    if (resendApiKey) {
      const payload = {
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject,
        html: brandedHtml,
      }

      const maxAttempts = 3
      const backoffDelays = [1000, 2000, 4000]

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          })

          if (res.ok) {
            const data = await res.json().catch(() => ({}))
            console.log(`[send-order-email] Email sent to ${to}, id: ${data?.id || 'unknown'}`)
            return new Response(JSON.stringify({ success: true, emailId: data?.id || 'unknown' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }

          const errorText = await res.text().catch(() => 'No error text')

          if (res.status === 403) {
            console.error(
              `[send-order-email] 403 Forbidden - Domain verification required for ${fromEmail}. Details: ${errorText}`,
            )
            return new Response(
              JSON.stringify({ error: `Resend Error 403: Domain not verified for ${fromEmail}` }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            )
          }

          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            console.error(`[send-order-email] Non-retryable error (${res.status}): ${errorText}`)
            return new Response(
              JSON.stringify({ error: `Resend Error ${res.status}: ${errorText}` }),
              {
                status: res.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              },
            )
          }

          if (attempt < maxAttempts - 1) {
            console.log(
              `[send-order-email] Attempt ${attempt + 1} failed (${res.status}), retrying in ${backoffDelays[attempt]}ms...`,
            )
            await new Promise((resolve) => setTimeout(resolve, backoffDelays[attempt]))
          } else {
            return new Response(
              JSON.stringify({ error: `Resend Error ${res.status}: ${errorText}` }),
              { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            )
          }
        } catch (fetchErr: any) {
          if (attempt < maxAttempts - 1) {
            console.log(`[send-order-email] Fetch error on attempt ${attempt + 1}, retrying...`)
            await new Promise((resolve) => setTimeout(resolve, backoffDelays[attempt]))
          } else {
            throw fetchErr
          }
        }
      }

      return new Response(
        JSON.stringify({ error: 'Failed to send email after multiple attempts.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    } else {
      console.log('[send-order-email] RESEND_API_KEY not configured. Mock email:', to, subject)
      return new Response(JSON.stringify({ success: true, mock: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  } catch (error: any) {
    console.error('[send-order-email] Unhandled error:', error?.message || error)
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
