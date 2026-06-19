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

    const { customerId } = await req.json()

    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('email')
      .eq('id', customerId)
      .single()
    if (!customer || !customer.email) throw new Error('Cliente ou email não encontrado')

    const { error: generateError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: customer.email,
    })

    if (generateError) throw generateError

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
