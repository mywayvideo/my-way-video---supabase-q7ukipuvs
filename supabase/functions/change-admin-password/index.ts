import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const { user_id, current_password, new_password } = await req.json()

    if (!user_id || !current_password || !new_password) {
      return new Response(JSON.stringify({ error: 'Dados inválidos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.admin.getUserById(user_id)
    if (userError || !user || !user.email) {
      throw new Error('Usuário não encontrado')
    }

    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email,
      password: current_password,
    })

    if (signInError) {
      return new Response(JSON.stringify({ error: 'Senha atual incorreta' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: new_password,
    })

    if (updateError) throw updateError

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
