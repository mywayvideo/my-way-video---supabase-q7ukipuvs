import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticate, getSiscomexHost } from '../_shared/siscomex-client.ts'

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
    const host = getSiscomexHost()
    const tokens = await authenticate(host)

    return new Response(
      JSON.stringify({
        success: true,
        host,
        environment: Deno.env.get('SISCOMEX_ENV') || 'homolog',
        csrfExpiration: new Date(tokens.csrfExpiration).toISOString(),
        message: 'Autenticação mTLS realizada com sucesso via Portal Único Siscomex.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('siscomex-auth error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erro na autenticação Siscomex',
      }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
