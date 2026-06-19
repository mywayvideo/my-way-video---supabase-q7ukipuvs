import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const defaultResponse = {
    role: 'customer',
    user_id: null,
    authenticated: false,
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')

      if (!authHeader) {
        clearTimeout(timeoutId)
        return new Response(JSON.stringify(defaultResponse), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

      const token = authHeader.replace('Bearer ', '')
      const {
        data: { user },
        error: authError,
      } = await supabaseAdmin.auth.getUser(token)

      if (authError || !user) {
        clearTimeout(timeoutId)
        console.error('Auth error or user not found:', authError?.message)
        return new Response(JSON.stringify(defaultResponse), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: customerData, error: dbError } = await supabaseAdmin
        .from('customers')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()

      clearTimeout(timeoutId)

      if (dbError) {
        console.error('Database error:', dbError.message)
      }

      return new Response(
        JSON.stringify({
          role: customerData?.role || 'customer',
          user_id: user.id,
          authenticated: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    } catch (innerError: any) {
      clearTimeout(timeoutId)
      throw innerError
    }
  } catch (error: any) {
    console.error('Error verifying user role:', error.message || error)
    return new Response(JSON.stringify(defaultResponse), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
