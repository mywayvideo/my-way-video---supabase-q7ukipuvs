import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

export const corsHeaders = {
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
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let url = ''

  try {
    const body = await req.json()
    url = body.url
    console.log(`[extract-product] Started extraction for URL: ${url}`)

    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      console.log(`[extract-product] Invalid URL format provided: ${url}`)
      return new Response(JSON.stringify({ error: 'URL invalida. Use um link valido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const firecrawlToken = Deno.env.get('FIRECRAWL_API_KEY')
    if (!firecrawlToken) {
      console.error(`[extract-product] Missing FIRECRAWL_API_KEY environment variable.`)
      return new Response(JSON.stringify({ error: 'Chave de API do Firecrawl nao configurada.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const firecrawlUrl = `https://api.firecrawl.dev/v2/scrape`

    let firecrawlResponse
    try {
      console.log(`[extract-product] Calling Firecrawl API...`)
      const res = await fetch(firecrawlUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${firecrawlToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url,
          formats: [
            {
              type: 'json',
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  sku: { type: 'string' },
                  manufacturer: { type: 'string' },
                  price_usa: { type: 'string' },
                  description: { type: 'string' },
                  technical_info: { type: 'string' },
                  weight: { type: 'string' },
                  dimensions: { type: 'string' },
                  image_url: { type: 'string' },
                  category: { type: 'string' },
                  is_discontinued: { type: 'boolean' },
                  stock: { type: 'string' },
                },
                required: ['name'],
              },
              prompt:
                "Extract the product name, sku (prefer the Manufacturer's code, e.g. MFR # over the store's internal SKU), manufacturer name, price in USD (only numbers), description (Extract the main product description and any visible bullet points), technical_info (Locate the 'Specs' or 'Specifications' tab container in the HTML. Capture the entire key-value pair list from the technical data table. If 'Specs' tab is not found, leave this field empty), weight (CRITICAL: extract ONLY 'Package Weight' from the 'Packaging Info' block within the 'Specs' tab. Ignore general physical specifications weight), dimensions (CRITICAL: extract ONLY 'Box Dimensions (LxWxH)' from the 'Packaging Info' block within the 'Specs' tab. Ignore general physical dimensions. Remove trailing quotes or inch symbols), main image URL, category, whether it is discontinued, and stock availability.",
            },
          ],
          onlyMainContent: true,
        }),
      })

      if (res.status === 429) {
        return new Response(
          JSON.stringify({
            error: 'Limite de requisicoes atingido. Tente novamente em alguns minutos.',
          }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      if (!res.ok) {
        const errorText = await res.text()
        console.error(
          `[extract-product] Firecrawl HTTP error! Status: ${res.status}, Response: ${errorText}`,
        )
        throw new Error(`Firecrawl HTTP error! status: ${res.status}`)
      }

      firecrawlResponse = await res.json()
    } catch (error: any) {
      console.error(`[extract-product] Fetch error:`, error.message)
      return new Response(
        JSON.stringify({ error: 'Nao foi possivel acessar a pagina informada.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (!firecrawlResponse.success || !firecrawlResponse.data) {
      console.error(
        `[extract-product] Empty or invalid response from Firecrawl.`,
        firecrawlResponse,
      )
      return new Response(JSON.stringify({ error: 'Nao foi possivel extrair dados da pagina.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const extractedData = firecrawlResponse.data.json || firecrawlResponse.data

    let name = extractedData.name || ''
    let sku = extractedData.sku || ''

    let price_usa = ''
    if (extractedData.price_usa) {
      price_usa = String(extractedData.price_usa).replace(/[^0-9.]/g, '')
    }

    let description = extractedData.description || ''
    let technical_info = extractedData.technical_info || ''

    let weight = ''
    if (extractedData.weight) {
      const wStr = String(extractedData.weight)
      const wMatch = wStr.match(/([\d.]+)/)
      if (wMatch) {
        weight = wMatch[1]
        if (wStr.toLowerCase().includes('kg')) {
          weight = (parseFloat(weight) * 2.20462).toFixed(2)
        }
      }
    }

    let dimensions = extractedData.dimensions || ''
    if (typeof dimensions === 'string') {
      dimensions = dimensions.replace(/['"]+$/g, '').trim()
    }
    let image_url = extractedData.image_url || ''
    let category = extractedData.category || ''
    let manufacturer = extractedData.manufacturer || ''

    let is_discontinued = 'false'
    if (
      extractedData.is_discontinued === true ||
      String(extractedData.is_discontinued).toLowerCase() === 'true'
    ) {
      is_discontinued = 'true'
    }

    let stock = ''
    if (extractedData.stock) {
      const stockMatch = String(extractedData.stock).match(/(\d+)/)
      if (stockMatch) {
        stock = stockMatch[1]
      }
    }

    console.log(`[extract-product] Raw extracted: Name: ${name}, SKU: ${sku}, Price: ${price_usa}`)

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (apiKey && (description || technical_info)) {
      try {
        console.log(`[extract-product] Calling OpenAI for formatting...`)
        let contentStr = ''
        if (description)
          contentStr += `Description: ${typeof description === 'string' ? description.substring(0, 1500) : JSON.stringify(description).substring(0, 1500)}\n\n`
        if (technical_info)
          contentStr += `Specs: ${typeof technical_info === 'string' ? technical_info.substring(0, 1500) : JSON.stringify(technical_info).substring(0, 1500)}\n\n`
        if (category)
          contentStr += `Category: ${typeof category === 'string' ? category : JSON.stringify(category)}`

        const llmRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are a professional technical cataloger for My Way Business.
TASK: Extract ALL technical data from the provided B&H product page HTML.
RULES:
- technical_info: Generate a comprehensive Markdown table containing EVERY spec found.
- Do NOT summarize. Do NOT skip rows. Include dimensions, weight, sensor, resolution, etc.
- LANGUAGE: Translate all technical terms and descriptions to Portuguese (PT-BR).
- CLEANING: Remove marketing fluff, store ads, and shipping availability text.
- MANUFACTURER: Identify the brand name clearly for database matching.
- OUTPUT: Return a clean JSON object matching the existing product schema with keys: "description", "technical_info", "category", "manufacturer".`,
              },
              {
                role: 'user',
                content: contentStr,
              },
            ],
            response_format: { type: 'json_object' },
          }),
        })
        if (llmRes.ok) {
          const llmData = await llmRes.json()
          const parsed = JSON.parse(llmData.choices[0].message.content)
          if (parsed.description) description = parsed.description
          if (parsed.technical_info) technical_info = parsed.technical_info
          if (parsed.category) category = parsed.category
          if (parsed.manufacturer) manufacturer = parsed.manufacturer
          console.log(`[extract-product] OpenAI formatting successful`)
        } else {
          const llmErr = await llmRes.text()
          console.error(`[extract-product] OpenAI error status: ${llmRes.status}, body: ${llmErr}`)
        }
      } catch (e: any) {
        console.error('[extract-product] LLM Formatting exception:', e.message)
      }
    } else {
      if (typeof description === 'string') description = description.substring(0, 500)
      else description = JSON.stringify(description).substring(0, 500)
      if (typeof technical_info === 'string') technical_info = technical_info.substring(0, 1000)
      else technical_info = JSON.stringify(technical_info).substring(0, 1000)
    }

    let category_id = ''
    try {
      console.log(`[extract-product] Matching category in DB: ${category}`)
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      if (supabaseUrl && supabaseKey && category) {
        const supabase = createClient(supabaseUrl, supabaseKey)

        const { data: dbCategories, error: dbErr } = await supabase
          .from('categories')
          .select('id, name')
        if (dbErr) {
          console.error(`[extract-product] Error querying categories: ${dbErr.message}`)
        } else if (dbCategories && dbCategories.length > 0) {
          const catNameLower = String(category).toLowerCase()
          const matchedCategory = dbCategories.find(
            (c: any) =>
              catNameLower.includes(c.name.toLowerCase()) ||
              c.name.toLowerCase().includes(catNameLower),
          )
          if (matchedCategory) {
            category_id = matchedCategory.id
            console.log(
              `[extract-product] Matched category ID: ${category_id} (${matchedCategory.name})`,
            )
          } else {
            console.log(`[extract-product] No matching category found for: ${category}`)
          }
        }
      }
    } catch (e: any) {
      console.error(`[extract-product] Error fetching categories from DB:`, e.message)
    }

    let manufacturer_id: string | null = null
    let extracted_brand = manufacturer || ''
    try {
      console.log(`[extract-product] Matching manufacturer in DB: ${extracted_brand}`)
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      if (supabaseUrl && supabaseKey && extracted_brand) {
        const supabase = createClient(supabaseUrl, supabaseKey)

        const { data: dbMfgs, error: dbErr } = await supabase
          .from('manufacturers')
          .select('id, name')
          .ilike('name', `%${extracted_brand}%`)
          .limit(1)

        if (dbErr) {
          console.error(`[extract-product] Error querying manufacturers: ${dbErr.message}`)
        } else if (dbMfgs && dbMfgs.length > 0) {
          manufacturer_id = dbMfgs[0].id
          console.log(
            `[extract-product] Matched manufacturer ID: ${manufacturer_id} (${dbMfgs[0].name})`,
          )
        } else {
          console.log(`[extract-product] No matching manufacturer found for: ${extracted_brand}`)
        }
      }
    } catch (e: any) {
      console.error(`[extract-product] Error fetching manufacturers from DB:`, e.message)
    }

    const result = {
      name: name || '',
      sku: sku || '',
      price_cost: '',
      price_usa: price_usa || '',
      price_brl: '',
      stock: stock || '',
      category_id: category_id || '',
      manufacturer_id: manufacturer_id,
      extracted_brand: extracted_brand,
      description: description || '',
      weight: weight || '',
      dimensions: dimensions || '',
      image_url: image_url || '',
      ncm: '',
      is_special: 'false',
      technical_info: technical_info || '',
      is_discontinued: is_discontinued,
      partial_data: !technical_info,
    }

    console.log(`[extract-product] Extraction complete. Returning result for ${sku || name}`)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error(`[extract-product] Unhandled error for URL ${url}:`, error.message, error.stack)
    return new Response(JSON.stringify({ error: 'Nao foi possivel acessar a pagina informada.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
