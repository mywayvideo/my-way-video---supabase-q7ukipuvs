import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

// Regras de força da senha definida pelo admin (espelham o front).
function isStrongPassword(password: string): boolean {
  return (
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  )
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { user_id, password } = await req.json()

    if (!user_id || typeof user_id !== 'string' || !password || typeof password !== 'string') {
      return new Response(JSON.stringify({ error: 'Informe o usuário e a nova senha.' }), {
        status: 400,
        headers: jsonHeaders,
      })
    }

    if (!isStrongPassword(password)) {
      return new Response(
        JSON.stringify({
          error:
            'A senha deve ter no mínimo 12 caracteres, com letras maiúsculas, minúsculas, números e símbolos.',
        }),
        { status: 400, headers: jsonHeaders },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: jsonHeaders,
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: jsonHeaders,
      })
    }

    const { data: adminCustomer } = await supabaseAdmin
      .from('customers')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    if (adminCustomer?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403,
        headers: jsonHeaders,
      })
    }

    // A senha só trafega nesta requisição: não é gravada em nenhuma tabela nem logada.
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password,
    })

    if (updateError) {
      console.error('set-user-password: falha ao atualizar senha do usuário', user_id)
      return new Response(
        JSON.stringify({ error: 'Não foi possível alterar a senha deste usuário.' }),
        { status: 400, headers: jsonHeaders },
      )
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: jsonHeaders })
  } catch (err: any) {
    console.error('set-user-password: erro inesperado', err?.message)
    return new Response(
      JSON.stringify({ error: 'Erro ao definir a nova senha. Tente novamente.' }),
      {
        status: 500,
        headers: jsonHeaders,
      },
    )
  }
})
