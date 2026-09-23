// list-tax-payloads
//
// No external imports — uses only Deno's native `fetch()` to call the Supabase
// Storage REST API directly. This avoids any crash during module resolution
// (jsr:/npm: imports) that would prevent CORS headers from being sent, which
// is what causes "Failed to fetch / HTTP N/A" on the front-end.
//
// Lists the private `tax-payloads` bucket using the service role key and
// returns the name + created_at of the most recent file.
//
// Response shape:
//   { name: string, created_at: string }   — most recent file
//   { name: null, created_at: null }       — bucket empty / error

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // Preflight — must return 200 with CORS headers.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const supabaseUrl = (Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL') ?? '').replace(
      /\/+$/,
      '',
    )
    const serviceRoleKey =
      Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        '[ERROR] PROJECT_URL / SUPABASE_URL ou SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY ausente.',
      )
      console.log('[INFO] nenhum arquivo encontrado')
      return new Response(JSON.stringify({ name: null, created_at: null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const listUrl = `${supabaseUrl}/storage/v1/object/list/tax-payloads`
    const method = 'POST'
    const maskedAuth = serviceRoleKey ? `${serviceRoleKey.slice(0, 10)}...` : 'N/A'
    const maskedApiKey = serviceRoleKey ? `${serviceRoleKey.slice(0, 10)}...` : 'N/A'

    console.log('[DEBUG] Chamando API de Storage:')
    console.log(`[DEBUG] URL: ${listUrl}`)
    console.log(`[DEBUG] Método HTTP: ${method}`)
    console.log(
      `[DEBUG] Headers enviados: Authorization: Bearer ${maskedAuth}, apikey: ${maskedApiKey}, Content-Type: application/json`,
    )

    const res = await fetch(listUrl, {
      method,
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix: '' }),
    })

    console.log(`[DEBUG] Status da resposta HTTP: ${res.status} ${res.statusText}`)

    const rawBody = await res.text().catch((err) => `[Falha ao ler corpo: ${err}]`)
    const truncatedBody = rawBody.length > 500 ? `${rawBody.slice(0, 500)}... (truncado)` : rawBody
    console.log(`[DEBUG] Corpo da resposta HTTP (primeiros 500 chars): ${truncatedBody}`)

    if (!res.ok) {
      console.error(`[ERROR] Storage respondeu com erro ${res.status}: ${truncatedBody}`)
      console.log('[INFO] nenhum arquivo encontrado')
      return new Response(JSON.stringify({ name: null, created_at: null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let data: unknown
    try {
      data = JSON.parse(rawBody)
    } catch (parseError) {
      console.error(`[ERROR] Falha no parse JSON da resposta: ${parseError}`)
      console.log('[INFO] nenhum arquivo encontrado')
      return new Response(JSON.stringify({ name: null, created_at: null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!Array.isArray(data) || data.length === 0) {
      console.log('[DEBUG] Resposta vazia: array de arquivos retornado vazio ou inválido.')
      console.log('[INFO] nenhum arquivo encontrado')
      return new Response(JSON.stringify({ name: null, created_at: null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Sort by created_at descending (falls back to updated_at).
    const sorted = [...data].sort((a, b) => {
      const ta = new Date(a.created_at || a.updated_at || 0).getTime()
      const tb = new Date(b.created_at || b.updated_at || 0).getTime()
      return tb - ta
    })

    const first = sorted[0]
    const name = first?.name ?? null
    const created_at = first?.created_at || first?.updated_at || null

    if (name) {
      console.log(`[INFO] Arquivo de payload mais recente encontrado: ${name}`)
    } else {
      console.log('[INFO] nenhum arquivo encontrado')
    }

    return new Response(JSON.stringify({ name, created_at }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[ERROR] Unhandled error in list-tax-payloads:', error)
    console.log('[INFO] nenhum arquivo encontrado')
    return new Response(JSON.stringify({ name: null, created_at: null }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
