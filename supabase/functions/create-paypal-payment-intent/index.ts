import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { order_id, amount } = await req.json()

    const clientId = Deno.env.get('PAYPAL_CLIENT_ID')
    const secret = Deno.env.get('PAYPAL_SECRET')

    // Default fallback to success redirect if credentials are not fully set
    let paypal_approval_url = `https://my-way-beta-ia.goskip.app/checkout/success?order_id=${order_id}&payment_method=paypal`

    if (clientId && secret) {
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
        const orderRes = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [
              {
                reference_id: order_id,
                amount: {
                  currency_code: 'USD',
                  value: (amount / 100).toFixed(2),
                },
              },
            ],
            application_context: {
              return_url: `https://my-way-beta-ia.goskip.app/checkout/success?order_id=${order_id}&payment_method=paypal`,
              cancel_url: `https://my-way-beta-ia.goskip.app/checkout?cancel=paypal`,
            },
          }),
        })

        if (orderRes.ok) {
          const orderData = await orderRes.json()
          const approveLink = orderData.links?.find((l: any) => l.rel === 'approve')
          if (approveLink) {
            paypal_approval_url = approveLink.href
          }
        } else {
          const errText = await orderRes.text()
          throw new Error(`PayPal Order Error: ${errText}`)
        }
      } else {
        const errText = await tokenRes.text()
        throw new Error(`PayPal Token Error: ${errText}`)
      }
    }

    return new Response(JSON.stringify({ paypal_approval_url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
