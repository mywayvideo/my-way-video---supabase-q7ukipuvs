import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

const BUCKET_NAME = 'product-images'

function getFileExtension(url: string, contentType?: string | null): string {
  try {
    const pathname = new URL(url).pathname
    const ext = pathname.split('.').pop()?.toLowerCase()?.split('?')[0] || ''
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext
    }
  } catch {
    // ignore
  }

  if (contentType) {
    if (contentType.includes('png')) return 'png'
    if (contentType.includes('webp')) return 'webp'
    if (contentType.includes('gif')) return 'gif'
    if (contentType.includes('svg')) return 'svg'
    if (contentType.includes('avif')) return 'avif'
  }
  return 'jpg'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // Query params
  const urlParams = new URL(req.url).searchParams
  const batchSize = parseInt(urlParams.get('limit') || '100', 10)
  const offset = parseInt(urlParams.get('offset') || '0', 10)
  const onlyPending = urlParams.get('only_pending') !== 'false'

  // Query products needing migration
  let query = supabase
    .from('products')
    .select('id, name, sku, image_url')
    .not('image_url', 'is', null)

  if (onlyPending) {
    query = query
      .not('image_url', 'ilike', `%${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}%`)
      .not('image_url', 'ilike', '%/storage/v1/object/public/product-images%')
  }

  const { data: products, error: queryError } = await query
    .order('created_at', { ascending: true })
    .range(offset, offset + batchSize - 1)

  if (queryError) {
    return new Response(JSON.stringify({ error: queryError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!products || products.length === 0) {
    return new Response(
      JSON.stringify({
        message: 'No products to migrate in this batch',
        migratedCount: 0,
        failedCount: 0,
        pendingCount: 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  let migratedCount = 0
  let failedCount = 0
  const results: Array<{
    id: string
    sku?: string
    success: boolean
    storageUrl?: string
    error?: string
  }> = []

  const CONCURRENCY = 6
  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const chunk = products.slice(i, i + CONCURRENCY)
    await Promise.all(
      chunk.map(async (p) => {
        let extUrl = p.image_url
        if (!extUrl || extUrl.includes('/storage/v1/object/public/product-images')) {
          return
        }

        // Clean cdn-cgi wrappers if any: e.g. https://www.bhphotovideo.com/cdn-cgi/image/.../https://www.bhphotovideo.com/...
        // Sometimes direct bhphoto /images500x500 works better without cdn-cgi or vice-versa
        const candidateUrls: string[] = [extUrl]
        if (extUrl.includes('/cdn-cgi/image/')) {
          const directMatch = extUrl.match(/(https?:\/\/[^/]+\/images\/.*)/)
          if (directMatch && directMatch[1]) {
            candidateUrls.push(directMatch[1])
          }
        }

        let downloadSuccess = false
        let arrayBuffer: ArrayBuffer | null = null
        let contentType = 'image/jpeg'
        let lastError = ''

        for (const candidate of candidateUrls) {
          if (downloadSuccess) break

          // Try download with different headers
          const headerSets = [
            {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
              Referer: 'https://www.bhphotovideo.com/',
              Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
              'Sec-Ch-Ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
              'Sec-Ch-Ua-Mobile': '?0',
              'Sec-Ch-Ua-Platform': '"Windows"',
              'Sec-Fetch-Dest': 'image',
              'Sec-Fetch-Mode': 'no-cors',
              'Sec-Fetch-Site': 'same-origin',
            },
            {
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
              Referer: 'https://www.google.com/',
              Accept: '*/*',
            },
          ]

          for (const headers of headerSets) {
            try {
              const controller = new AbortController()
              const timeoutId = setTimeout(() => controller.abort(), 10000)

              const resp = await fetch(candidate, {
                signal: controller.signal,
                headers,
              })
              clearTimeout(timeoutId)

              if (resp.ok) {
                contentType = resp.headers.get('Content-Type') || 'image/jpeg'
                arrayBuffer = await resp.arrayBuffer()
                if (arrayBuffer && arrayBuffer.byteLength > 500) {
                  downloadSuccess = true
                  break
                }
              } else {
                lastError = `HTTP ${resp.status} ${resp.statusText}`
              }
            } catch (e: any) {
              lastError = e?.message || 'Download error'
            }

            await new Promise((r) => setTimeout(r, 400))
          }
        }

        if (downloadSuccess && arrayBuffer) {
          try {
            const ext = getFileExtension(extUrl, contentType)
            const filePath = `products/${p.id}.${ext}`

            const { error: uploadError } = await supabase.storage
              .from(BUCKET_NAME)
              .upload(filePath, arrayBuffer, {
                contentType,
                upsert: true,
              })

            if (uploadError) throw uploadError

            const { data: publicUrlData } = supabase.storage
              .from(BUCKET_NAME)
              .getPublicUrl(filePath)

            const storageUrl = publicUrlData.publicUrl

            const { error: updateError } = await supabase
              .from('products')
              .update({ image_url: storageUrl })
              .eq('id', p.id)

            if (updateError) throw updateError

            migratedCount++
            results.push({ id: p.id, sku: p.sku, success: true, storageUrl })

            await supabase.from('image_migration_failures').delete().eq('product_id', p.id)
            return
          } catch (e: any) {
            lastError = `Upload/Update error: ${e?.message || e}`
          }
        }

        failedCount++
        results.push({ id: p.id, sku: p.sku, success: false, error: lastError })

        try {
          const { data: existingFail } = await supabase
            .from('image_migration_failures')
            .select('id, attempt_count')
            .eq('product_id', p.id)
            .maybeSingle()

          if (existingFail) {
            await supabase
              .from('image_migration_failures')
              .update({
                error_message: lastError,
                attempt_count: (existingFail.attempt_count || 1) + 1,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingFail.id)
          } else {
            await supabase.from('image_migration_failures').insert({
              product_id: p.id,
              external_url: extUrl,
              error_message: lastError,
              attempt_count: 1,
            })
          }
        } catch (_logErr) {
          // ignore fail logging error
        }
      }),
    )
  }

  const { count: pendingCount } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .not('image_url', 'is', null)
    .not('image_url', 'ilike', '%/storage/v1/object/public/product-images%')

  return new Response(
    JSON.stringify({
      processedCount: products.length,
      migratedCount,
      failedCount,
      pendingCount: pendingCount ?? 0,
      results,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
})
