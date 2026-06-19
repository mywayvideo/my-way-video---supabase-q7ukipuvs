import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { orderId, orderNumber, customerName, customerEmail, customerPhone, amount, currency } =
      body

    if (!orderId || !orderNumber || !customerName || !customerEmail || amount === undefined) {
      return new Response(JSON.stringify({ error: 'Dados invalidos para notificacao.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'admin@mywayvideo.com'

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Configuracao email nao encontrada.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const curr = currency || 'USD'
    const origin = req.headers.get('origin') || 'https://my-way-beta-ia.goskip.app'

    const subject = `Novo Pedido Pendente de Transferencia - ${orderNumber}`
    let text = `Ola Admin,\n\n`
    text += `Novo pedido pendente de pagamento via Transferencia (Brasil).\n\n`
    text += `Detalhes do Pedido:\n`
    text += `- Numero do Pedido: ${orderNumber}\n`
    text += `- Cliente: ${customerName}\n`
    text += `- Email: ${customerEmail}\n`
    if (customerPhone) {
      text += `- Telefone: ${customerPhone}\n`
    }
    text += `- Valor: ${curr} ${amount}\n\n`
    text += `Acao necessaria: Fornecer dados bancarios para este cliente via dashboard\n`
    text += `Link do pedido: ${origin}/admin/orders/${orderId}\n\n`
    text += `Acesse o painel admin para fornecer os dados bancarios.`

    let attempt = 0
    const maxAttempts = 3
    const backoffDelays = [2000, 4000, 8000]
    let success = false
    let lastError = null

    while (attempt < maxAttempts && !success) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'noreply@mywayvideo.com',
            to: [adminEmail],
            subject: subject,
            text: text,
          }),
        })

        if (response.ok) {
          success = true
        } else {
          const errorData = await response.text()
          lastError = new Error(`Resend Error ${response.status}: ${errorData}`)

          if (response.status === 503) {
            attempt++
            if (attempt < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, backoffDelays[attempt - 1]))
            }
          } else {
            // Do not retry on 400/401/404 or other errors
            break
          }
        }
      } catch (err: any) {
        lastError = err
        attempt++
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, backoffDelays[attempt - 1]))
        }
      }
    }

    if (!success) {
      console.error('Erro ao enviar notificacao via Resend:', lastError)
      return new Response(JSON.stringify({ error: 'Erro ao enviar notificacao.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ message: 'Notificacao enviada para admin' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Unhandled error in notify-admin-transferencia-brasil:', error)
    return new Response(JSON.stringify({ error: 'Erro interno do servidor.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
