import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { email, name, password } = await req.json()

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Faltam dados para envio do email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Mock sending email - In a real scenario, integrate with Resend or external SMTP here
    console.log(
      `[Mock Email Send] To: ${email} | Name: ${name} | Password: ${password.substring(0, 3)}...`,
    )

    return new Response(JSON.stringify({ success: true, message: 'Email simulado com sucesso' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Erro ao enviar email' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
