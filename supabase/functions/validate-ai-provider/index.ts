import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const timestamp = new Date().toISOString()

  try {
    const body = await req.json().catch(() => ({}))
    const { model_id, api_key_secret_name, endpoint, provider_type } = body

    if (!model_id || !api_key_secret_name || !endpoint || !provider_type) {
      console.log(
        `[${timestamp}] provider_type: ${provider_type || 'unknown'}, model_id: ${model_id || 'unknown'}, endpoint: ${endpoint || 'unknown'}, request status: failed_validation, response status: 400`,
      )
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Campos obrigatorios: model_id, api_key_secret_name, endpoint, provider_type.',
          provider_type: provider_type || 'unknown',
          error_details: 'Missing required fields in request body',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const apiKey = Deno.env.get(api_key_secret_name)

    if (apiKey === undefined || apiKey === null) {
      console.log(
        `[${timestamp}] provider_type: ${provider_type}, model_id: ${model_id}, endpoint: ${endpoint}, request status: missing_secret, response status: 400`,
      )
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Chave de API nao encontrada em Secrets.',
          provider_type,
          error_details: `Secret ${api_key_secret_name} not found`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (apiKey.trim() === '') {
      console.log(
        `[${timestamp}] provider_type: ${provider_type}, model_id: ${model_id}, endpoint: ${endpoint}, request status: empty_secret, response status: 400`,
      )
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Chave de API esta vazia.',
          provider_type,
          error_details: `Secret ${api_key_secret_name} is empty`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    let fetchBody: any = {}

    if (provider_type === 'gemini') {
      headers['x-goog-api-key'] = apiKey
      fetchBody = {
        contents: [{ role: 'user', parts: [{ text: 'Teste de conexao. Responda com OK.' }] }],
      }
    } else if (endpoint.includes('anthropic.com')) {
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
      fetchBody = {
        model: model_id,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Teste de conexao. Responda com OK.' }],
      }
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`
      fetchBody = {
        model: model_id,
        messages: [{ role: 'user', content: 'Teste de conexao. Responda com OK.' }],
      }
    }

    let attempt = 0
    const maxAttempts = 3
    const backoffDelays = [2000, 4000, 8000]
    let finalResponse: Response | null = null
    let fetchError: any = null

    while (attempt < maxAttempts) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(fetchBody),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        finalResponse = res

        if (res.status === 503) {
          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, backoffDelays[attempt]))
            attempt++
            continue
          }
        }
        break
      } catch (e: any) {
        clearTimeout(timeoutId)
        fetchError = e
        if (e.name === 'AbortError') {
          break
        }
        break
      }
    }

    const logTimestamp = new Date().toISOString()

    if (fetchError && fetchError.name === 'AbortError') {
      console.log(
        `[${logTimestamp}] provider_type: ${provider_type}, model_id: ${model_id}, endpoint: ${endpoint}, request status: timeout, response status: 504`,
      )
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Timeout ao conectar ao provedor. Tente novamente.',
          provider_type,
          error_details: 'Request timed out after 10 seconds',
        }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!finalResponse) {
      console.log(
        `[${logTimestamp}] provider_type: ${provider_type}, model_id: ${model_id}, endpoint: ${endpoint}, request status: fetch_error, response status: 500`,
      )
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Erro interno ao tentar conectar com a API.',
          provider_type,
          error_details: fetchError?.message || 'Unknown network error',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const statusCode = finalResponse.status
    console.log(
      `[${logTimestamp}] provider_type: ${provider_type}, model_id: ${model_id}, endpoint: ${endpoint}, request status: completed, response status: ${statusCode}`,
    )

    if (statusCode === 401 || statusCode === 403) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Chave de API invalida ou expirada.',
          provider_type,
          error_details: `HTTP ${statusCode}`,
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (statusCode === 400 || statusCode === 404) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Endpoint ou modelo invalido.',
          provider_type,
          error_details: `HTTP ${statusCode}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (statusCode === 200 || statusCode === 201) {
      return new Response(
        JSON.stringify({
          status: 'success',
          message: 'Conexao testada com sucesso',
          provider_type,
          model_id,
          endpoint,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const errorText = await finalResponse.text().catch(() => 'No error text returned')
    return new Response(
      JSON.stringify({
        status: 'error',
        message: 'Falha inesperada na conexao com o provedor.',
        provider_type,
        error_details: `HTTP ${statusCode}: ${errorText.substring(0, 200)}`,
      }),
      {
        status: statusCode >= 500 ? 502 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err: any) {
    console.log(
      `[${new Date().toISOString()}] provider_type: unknown, model_id: unknown, endpoint: unknown, request status: fatal_error, response status: 500`,
    )
    return new Response(
      JSON.stringify({
        status: 'error',
        message: 'Erro interno do servidor.',
        provider_type: 'unknown',
        error_details: err.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
