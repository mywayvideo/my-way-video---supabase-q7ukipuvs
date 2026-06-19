import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { order_id, token } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

    const clientId = Deno.env.get('PAYPAL_CLIENT_ID')
    const secret = Deno.env.get('PAYPAL_SECRET')

    let isApproved = true

    if (clientId && secret && token) {
      const auth = btoa(`${clientId}:${secret}`)
      const tokenRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      })

      if (tokenRes.ok) {
        const { access_token } = await tokenRes.json()
        const captureRes = await fetch(
          `https://api-m.paypal.com/v2/checkout/orders/${token}/capture`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${access_token}`,
              'Content-Type': 'application/json',
            },
          },
        )
        if (!captureRes.ok) {
          const statusRes = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${token}`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${access_token}`,
              'Content-Type': 'application/json',
            },
          })
          if (statusRes.ok) {
            const statusData = await statusRes.json()
            if (statusData.status !== 'COMPLETED' && statusData.status !== 'APPROVED') {
              isApproved = false
            }
          } else {
            isApproved = false
          }
        }
      } else {
        isApproved = false
      }
    }

    if (!isApproved) {
      throw new Error('Falha ao verificar ou capturar o pagamento.')
    }

    const { error } = await supabaseAdmin
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', order_id)
    if (error) throw error

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
