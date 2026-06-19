import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function extractKeywords(query: string): string[] {
  const stopWords = new Set([
    'o',
    'a',
    'os',
    'as',
    'um',
    'uma',
    'uns',
    'umas',
    'de',
    'do',
    'da',
    'dos',
    'das',
    'em',
    'no',
    'na',
    'nos',
    'nas',
    'por',
    'para',
    'com',
    'sem',
    'como',
    'que',
    'qual',
    'quais',
    'quem',
    'onde',
    'quando',
    'porque',
    'e',
    'ou',
    'mas',
    'se',
    'equipamento',
    'equipamentos',
    'câmera',
    'camera',
    'procurar',
    'busca',
    'busco',
    'quero',
    'queria',
    'gostaria',
    'preciso',
  ])

  const words = query
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.trim().length > 0)

  if (words.length === 0) return []

  const scoredWords = words.map((word) => {
    let score = 0
    const lowerWord = word.toLowerCase()

    if (stopWords.has(lowerWord)) {
      score = -100
    } else {
      // Is acronym (all uppercase, length >= 2)
      if (/^[A-Z0-9-]{2,}$/.test(word)) {
        score += 50
      }
      // Contains numbers (model numbers, years)
      if (/\d/.test(word)) {
        score += 30
        // 4 digit year
        if (/^\d{4}$/.test(word)) {
          score += 10
        }
      }
      // Word length bonus
      if (word.length > 3) {
        score += word.length
      }
    }

    return { word, score }
  })

  // Sort keywords by highest score
  scoredWords.sort((a, b) => b.score - a.score)

  const validWords = scoredWords.filter((w) => w.score > -100)

  if (validWords.length === 0) {
    // Fallback to top 3 original words if all were filtered
    return words.slice(0, 3)
  }

  // Get the top 3 scored keywords
  return validWords.slice(0, 3).map((w) => w.word)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query } = await req.json()

    if (!query) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const keywords = extractKeywords(query)

    // Default response structure expected by the frontend
    const responseData = {
      stock: [] as any[],
      mi: [] as any[],
      psc: [] as any[],
      pc: null as any,
      domain_rejected: false,
    }

    if (keywords.length > 0) {
      // 1. Search Stock (products table)
      // Requirement: MUST use name and description columns, NOT title.
      let stockQuery = supabase.from('products').select('*')
      for (const kw of keywords) {
        stockQuery = stockQuery.or(`name.ilike.%${kw}%,description.ilike.%${kw}%`)
      }
      const { data: stockData } = await stockQuery.limit(10)
      if (stockData) responseData.stock = stockData

      // 2. Search Market Intelligence
      // Requirement: MUST use ai_summary column
      let miQuery = supabase.from('market_intelligence').select('*')
      for (const kw of keywords) {
        miQuery = miQuery.ilike('ai_summary', `%${kw}%`)
      }
      const { data: miData } = await miQuery.limit(10)
      if (miData) responseData.mi = miData

      // 3. Search Product Search Cache
      let pscQuery = supabase.from('product_search_cache').select('*')
      for (const kw of keywords) {
        pscQuery = pscQuery.ilike('query', `%${kw}%`)
      }
      const { data: pscData } = await pscQuery.limit(5)
      if (pscData) responseData.psc = pscData

      // 4. Search Product Cache
      let pcQuery = supabase.from('product_cache').select('*')
      for (const kw of keywords) {
        pcQuery = pcQuery.ilike('product_name', `%${kw}%`)
      }
      const { data: pcData } = await pcQuery.limit(5)
      if (pcData && pcData.length > 0) {
        responseData.pc = pcData[0]
      }
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    console.error('[ERRO] execute_ai_search_v2:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
