import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number) => {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(id)
    return response
  } catch (error) {
    clearTimeout(id)
    throw error
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, status: 405, message: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const body = await req.json().catch(() => ({}))
    const imageUrl = body.imageUrl

    if (imageUrl === undefined || imageUrl === null || String(imageUrl).trim() === '') {
      return new Response(
        JSON.stringify({
          success: false,
          status: 400,
          message: 'URL da imagem nao pode estar vazia',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const urlString = String(imageUrl).trim()

    if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
      return new Response(
        JSON.stringify({
          success: false,
          status: 400,
          message: 'URL deve comear com http:// ou https://',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let response: Response
    let headOk = false

    try {
      response = await fetchWithTimeout(urlString, { method: 'HEAD' }, 5000)
      if (response.ok) {
        headOk = true
      }
    } catch (e) {
      // HEAD failed entirely (network or timeout)
    }

    if (!headOk) {
      try {
        response = await fetchWithTimeout(
          urlString,
          {
            method: 'GET',
            headers: { Range: 'bytes=0-1' },
          },
          5000,
        )
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, status: 0, message: 'Timeout ao validar imagem' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    const status = response!.status

    if (status >= 200 && status <= 299) {
      return new Response(JSON.stringify({ success: true, status: 200 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else if (status === 404) {
      return new Response(
        JSON.stringify({ success: false, status: 404, message: 'Imagem nao encontrada' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    } else if (status === 403) {
      return new Response(
        JSON.stringify({ success: false, status: 403, message: 'Acesso negado a imagem' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    } else {
      return new Response(
        JSON.stringify({ success: false, status: status, message: 'Erro ao validar imagem' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, status: 500, message: 'Erro interno ao validar imagem' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
