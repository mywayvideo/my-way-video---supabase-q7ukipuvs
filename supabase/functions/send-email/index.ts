import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  const timestamp = new Date().toISOString()
  const functionName = 'send-email'

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.error(`[${timestamp}] [${functionName}] Error: RESEND_API_KEY not configured`)
      return new Response(JSON.stringify({ error: 'Erro: Chave de API Resend nao configurada.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const {
      to,
      subject,
      htmlContent,
      fromEmail = 'noreply@mywayvideo.com',
      fromName = 'My Way Video',
    } = body

    if (!to || !subject || !htmlContent) {
      console.warn(`[${timestamp}] [${functionName}] Validation error: Missing required fields`)
      return new Response(
        JSON.stringify({ error: 'Erro: Campos obrigatorios ausentes (to, subject, htmlContent).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(to)) {
      console.warn(
        `[${timestamp}] [${functionName}] Validation error: Invalid email format (${to})`,
      )
      return new Response(JSON.stringify({ error: 'Erro: Email invalido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = {
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject: subject,
      html: htmlContent,
    }

    let attempt = 0
    const maxAttempts = 3
    const backoffDelays = [2000, 4000, 8000]
    let success = false
    let apiResponseData: any = null
    let lastError: any = null

    while (attempt <= maxAttempts && !success) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          apiResponseData = await response.json()
          success = true
        } else {
          const errorText = await response.text().catch(() => 'No error text')
          lastError = new Error(`Resend API Error ${response.status}: ${errorText}`)

          if (response.status === 503 && attempt < maxAttempts) {
            console.log(
              `[${timestamp}] [${functionName}] Received 503, retrying in ${backoffDelays[attempt]}ms...`,
            )
            await new Promise((resolve) => setTimeout(resolve, backoffDelays[attempt]))
            attempt++
          } else {
            // Do not retry on 400, 401, 404, or if max attempts reached
            break
          }
        }
      } catch (err: any) {
        lastError = err
        if (err.name === 'AbortError') {
          lastError = new Error('Request timeout exceeded (30 seconds)')
        }

        if (attempt < maxAttempts) {
          console.log(
            `[${timestamp}] [${functionName}] Fetch error, retrying in ${backoffDelays[attempt]}ms...`,
          )
          await new Promise((resolve) => setTimeout(resolve, backoffDelays[attempt]))
          attempt++
        } else {
          break
        }
      }
    }

    if (!success) {
      console.error(
        `[${timestamp}] [${functionName}] Error sending email:`,
        lastError?.message || lastError,
      )
      return new Response(JSON.stringify({ error: 'Erro ao enviar email. Tente novamente.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        emailId: apiResponseData?.id || 'unknown',
        status: 'sent',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error(`[${timestamp}] [${functionName}] Unhandled error:`, error.message || error)
    return new Response(JSON.stringify({ error: 'Erro ao enviar email. Tente novamente.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
