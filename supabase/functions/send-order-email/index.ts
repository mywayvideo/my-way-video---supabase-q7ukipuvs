import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json()
    const {
      to,
      subject,
      htmlContent,
      fromEmail = 'support@noreply.mywayvideo.com',
      fromName = 'My Way Video',
    } = body || {}

    if (!to || !subject || !htmlContent) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields (to, subject, htmlContent).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    if (resendApiKey) {
      const payload = {
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject,
        html: htmlContent,
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'No error text')

        if (res.status === 403) {
          console.error(
            `[send-order-email] 403 Forbidden - Domain verification required for ${fromEmail}. The domain "${fromEmail.split('@')[1]}" may not be verified in Resend. Details: ${errorText}`,
          )
        } else {
          console.error(`[send-order-email] Resend API Error ${res.status}: ${errorText}`)
        }

        return new Response(JSON.stringify({ error: `Resend Error ${res.status}: ${errorText}` }), {
          status: res.status >= 400 && res.status < 500 ? res.status : 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const data = await res.json().catch(() => ({}))
      return new Response(JSON.stringify({ success: true, emailId: data?.id || 'unknown' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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
