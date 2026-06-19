import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    console.log('[ups-get-token] Starting token request...')
    const clientId = Deno.env.get('UPS_CLIENT_ID')
    const clientSecret = Deno.env.get('UPS_CLIENT_SECRET')
    const environment = Deno.env.get('UPS_ENVIRONMENT')

    console.log(`[ups-get-token] Environment: ${environment}`)
    console.log(`[ups-get-token] Client ID exists: ${!!clientId}`)
    console.log(`[ups-get-token] Client Secret exists: ${!!clientSecret}`)

    if (!clientId || !clientSecret || !environment) {
      console.error('[ups-get-token] Missing required environment variables.')
      return new Response(JSON.stringify({ error: 'Credenciais UPS nao configuradas.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const oauthEndpoint =
      environment === 'production'
        ? 'https://onlinetools.ups.com/security/v1/oauth/token'
        : 'https://wwwcie.ups.com/security/v1/oauth/token'

    console.log(`[ups-get-token] Calling OAuth endpoint: ${oauthEndpoint}`)

    const params = new URLSearchParams()
    params.append('grant_type', 'client_credentials')
    params.append('client_id', clientId)
    params.append('client_secret', clientSecret)

    const tokenResponse = await fetch(oauthEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: params.toString(),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error(`[ups-get-token] UPS OAuth Error (${tokenResponse.status}):`, errorText)
      return new Response(
        JSON.stringify({ error: 'Nao foi possivel autenticar com UPS.', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const tokenData = await tokenResponse.json()
    console.log('[ups-get-token] Successfully obtained token.')

    return new Response(
      JSON.stringify({
        access_token: tokenData.access_token,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[ups-get-token] Unhandled error:', error)
    return new Response(
      JSON.stringify({ error: 'Nao foi possivel autenticar com UPS.', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
