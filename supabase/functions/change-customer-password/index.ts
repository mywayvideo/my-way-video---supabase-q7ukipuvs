import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autorizado')

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) throw new Error('Não autorizado')

    const { data: adminCustomer } = await supabaseAdmin
      .from('customers')
      .select('role')
      .eq('user_id', user.id)
      .single()
    if (adminCustomer?.role !== 'admin') throw new Error('Acesso negado')

    const { customerId, newPassword } = await req.json()

    if (!customerId || !newPassword || newPassword.length < 8) {
      return new Response(JSON.stringify({ error: 'Dados inválidos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('user_id')
      .eq('id', customerId)
      .single()
    if (!customer) throw new Error('Cliente não encontrado')

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(customer.user_id, {
      password: newPassword,
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
