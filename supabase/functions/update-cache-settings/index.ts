import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: customerData } = await supabaseAdmin
      .from('customers')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (customerData?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Acesso negado.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const { id, mi_expiration_days, product_search_cache_expiration_days } = body

    if (mi_expiration_days === undefined || product_search_cache_expiration_days === undefined) {
      return new Response(JSON.stringify({ error: 'Dados inválidos ou incompletos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let targetId = id
    if (!targetId || targetId === '00000000-0000-0000-0000-000000000001') {
      const { data: existing } = await supabaseAdmin
        .from('cache_settings')
        .select('id')
        .limit(1)
        .maybeSingle()
      if (existing) {
        targetId = existing.id
      }
    }

    const payload = {
      mi_expiration_days,
      product_search_cache_expiration_days,
      updated_at: new Date().toISOString(),
    }

    let query
    if (targetId && targetId !== '00000000-0000-0000-0000-000000000001') {
      query = supabaseAdmin
        .from('cache_settings')
        .update(payload)
        .eq('id', targetId)
        .select()
        .single()
    } else {
      query = supabaseAdmin.from('cache_settings').insert(payload).select().single()
    }

    const { data, error } = await query
    if (error) throw error

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Error in update-cache-settings:', error)
    return new Response(JSON.stringify({ error: 'Erro interno ao atualizar cache_settings.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
