import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.error('[send-email] Error: RESEND_API_KEY not configured')
      return new Response(JSON.stringify({ error: 'Email service not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body: any = {}
    try {
      body = await req.json()
    } catch {
      // Body is not valid JSON, use empty object
    }

    if (!body || typeof body !== 'object') body = {}

    const {
      to,
      subject,
      htmlContent,
      fromEmail = 'noreply@mywayvideo.com',
      fromName = 'My Way Video',
    } = body

    if (!to || !subject || !htmlContent) {
      console.warn('[send-email] Validation error: Missing required fields')
      return new Response(
        JSON.stringify({ error: 'Missing required fields (to, subject, htmlContent).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(to)) {
      console.warn(`[send-email] Validation error: Invalid email format (${to})`)
      return new Response(JSON.stringify({ error: 'Invalid email address.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = {
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html: htmlContent,
    }

    const maxAttempts = 3
    const backoffDelays = [1000, 2000, 4000]
    let lastError: any = null

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        if (response.ok) {
          const data = await response.json().catch(() => ({}))
          console.log(`[send-email] Email sent successfully to ${to}`)
          return new Response(
            JSON.stringify({
              success: true,
              emailId: data?.id || 'unknown',
              status: 'sent',
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }

        const errorText = await response.text().catch(() => 'No error text')
        lastError = new Error(`Resend API Error ${response.status}: ${errorText}`)

        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          console.error(`[send-email] Non-retryable error: ${lastError.message}`)
          break
        }

        if (attempt < maxAttempts - 1) {
          console.log(
            `[send-email] Attempt ${attempt + 1} failed (${response.status}), retrying in ${backoffDelays[attempt]}ms...`,
          )
          await new Promise((resolve) => setTimeout(resolve, backoffDelays[attempt]))
        }
      } catch (err: any) {
        lastError = err
        if (attempt < maxAttempts - 1) {
          console.log(
            `[send-email] Fetch error on attempt ${attempt + 1}, retrying in ${backoffDelays[attempt]}ms...`,
          )
          await new Promise((resolve) => setTimeout(resolve, backoffDelays[attempt]))
        }
      }
    }

    console.error('[send-email] All attempts failed:', lastError?.message || lastError)
    return new Response(
      JSON.stringify({ error: 'Failed to send email after multiple attempts.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[send-email] Unhandled error:', error?.message || error)
    return new Response(JSON.stringify({ error: 'Internal server error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
