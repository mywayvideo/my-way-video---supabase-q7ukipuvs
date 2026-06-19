import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

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

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { description } = body

    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      return new Response(JSON.stringify({ error: 'Descricao invalida. Minimo 10 caracteres.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('COSMOS_BLUESOFT_API_KEY')
    const userAgent = Deno.env.get('COSMOS_BLUESOFT_USER_AGENT') || 'MyWayVideo/1.0'

    // Extract key technical terms from description
    const terms = description
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 6)
      .join(' ')

    const queryStr = encodeURIComponent(description.substring(0, 100))

    let attempt = 0
    const maxAttempts = 3
    const backoffDelays = [2000, 4000, 8000]
    let apiResponse = null
    let success = false
    let useFallback = false

    if (apiKey) {
      while (attempt < maxAttempts && !success && !useFallback) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 10000)

          const res = await fetch(`https://api.cosmos.bluesoft.com.br/search?q=${queryStr}`, {
            method: 'GET',
            headers: {
              'X-Cosmos-Token': apiKey,
              'User-Agent': userAgent,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
          })
          clearTimeout(timeoutId)

          if (res.ok) {
            apiResponse = await res.json()
            success = true
          } else if (res.status === 503 || res.status === 429) {
            attempt++
            if (attempt < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, backoffDelays[attempt - 1]))
            } else {
              useFallback = true
            }
          } else {
            // Do not retry on 400/401/404
            console.error(`Cosmos API Error: Status ${res.status}`)
            useFallback = true
          }
        } catch (err: any) {
          if (err.name === 'AbortError') {
            attempt++
            if (attempt < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, backoffDelays[attempt - 1]))
            } else {
              useFallback = true
            }
          } else {
            console.error('Fetch error:', err)
            useFallback = true
          }
        }
      }
    } else {
      useFallback = true
    }

    let suggestions: any[] = []

    if (success && apiResponse) {
      // Parse Cosmos response
      let results: any[] = []
      if (Array.isArray(apiResponse)) {
        results = apiResponse
      } else if (apiResponse && Array.isArray(apiResponse.ncms)) {
        results = apiResponse.ncms
      } else if (apiResponse && Array.isArray(apiResponse.results)) {
        results = apiResponse.results
      } else if (apiResponse && Array.isArray(apiResponse.products)) {
        results = apiResponse.products
      }

      suggestions = results
        .map((item: any, index: number) => {
          const code =
            item.code || item.ncm || item.ncm_code || (typeof item === 'string' ? item : '')
          const desc = item.description || item.nome || item.name || 'Descricao nao disponivel'
          const confidence =
            item.confidence !== undefined ? item.confidence : Math.max(10, 95 - index * 15)

          return {
            ncm: String(code).replace(/\D/g, '').substring(0, 8),
            description: desc,
            confidence: confidence,
            source: 'cosmos',
          }
        })
        .filter((item) => item.ncm.length > 0)
    }

    if (suggestions.length === 0) {
      useFallback = true
    }

    if (useFallback) {
      const fallbackRules = [
        {
          ncm: '85291000',
          desc: 'Aparelhos de captura de video',
          conf: 90,
          keywords: ['camera', 'video', 'capture', 'gravacao'],
        },
        {
          ncm: '90069090',
          desc: 'Instrumentos de medida e controle',
          conf: 85,
          keywords: ['converter', 'adapter', 'transformador'],
        },
        {
          ncm: '85044090',
          desc: 'Circuitos integrados',
          conf: 80,
          keywords: ['processor', 'chip', 'circuito', 'processador'],
        },
        {
          ncm: '85299090',
          desc: 'Partes e acessorios',
          conf: 75,
          keywords: ['accessory', 'cable', 'stand', 'suporte', 'cabo'],
        },
        {
          ncm: '49019900',
          desc: 'Livros e publicacoes',
          conf: 70,
          keywords: ['software', 'manual', 'guide', 'guia'],
        },
        {
          ncm: '85176290',
          desc: 'Aparelhos de som',
          conf: 85,
          keywords: ['audio', 'speaker', 'microphone', 'microfone', 'som'],
        },
      ]

      const descLower = description
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')

      for (const rule of fallbackRules) {
        if (rule.keywords.some((kw) => descLower.includes(kw))) {
          suggestions.push({
            ncm: rule.ncm,
            description: rule.desc,
            confidence: rule.conf,
            source: 'fallback',
          })
        }
      }
    }

    // Sort top 3
    suggestions.sort((a, b) => b.confidence - a.confidence)
    suggestions = suggestions.slice(0, 3)

    if (suggestions.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Nao foi possivel sugerir NCM. Tente novamente.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const allBelow50 = suggestions.every((s) => s.confidence < 50)

    if (allBelow50 && suggestions.length > 0) {
      suggestions[0].note = 'Nao conseguimos identificar o NCM com certeza. Valide manualmente.'
    }

    return new Response(JSON.stringify(suggestions), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Unhandled error in validate-ncm-suggestion:', error)
    return new Response(
      JSON.stringify({ error: 'Nao foi possivel sugerir NCM. Tente novamente.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
