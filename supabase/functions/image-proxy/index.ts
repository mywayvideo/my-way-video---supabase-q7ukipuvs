import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

const BUCKET_NAME = 'product-images'
const CACHE_PREFIX = 'cache'

const TRUSTED_DOMAINS = [
  'bhphotovideo.com',
  'bhphoto.com',
  'static.bhphoto.com',
  'images.bhphotovideo.com',
  'cdn.bhphotovideo.com',
  'eimagevideo.com',
  'img.usecurling.com',
  'm.media-amazon.com',
  'images-na.ssl-images-amazon.com',
  'shopic.mcmcclass.com',
  'd3c9kujynjspib.cloudfront.net',
  'image.made-in-china.com',
  'led-studiolights.com',
]

async function hashUrl(url: string): Promise<string> {
  const enc = new TextEncoder().encode(url)
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

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

  const requestUrl = new URL(req.url)
  let imageUrl = requestUrl.searchParams.get('url')
  let forceUpload = requestUrl.searchParams.get('forceUpload') === 'true'
  let returnJson = requestUrl.searchParams.get('json') === 'true'
  let productId = requestUrl.searchParams.get('productId') || ''

  // If POST request, allow parameters from JSON body
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      if (body.url) imageUrl = body.url
      if (body.forceUpload !== undefined) forceUpload = !!body.forceUpload
      if (body.json !== undefined) returnJson = !!body.json
      if (body.productId) productId = body.productId
    } catch {
      // not JSON or empty body, ignore
    }
  }

  if (!imageUrl) {
    return new Response(JSON.stringify({ error: 'URL parameter is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(imageUrl)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '')
  const isTrusted = TRUSTED_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d))

  if (!isTrusted) {
    return new Response(JSON.stringify({ error: 'Origem não autorizada' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // If already in Storage, return public URL directly
  if (imageUrl.includes('/storage/v1/object/public/product-images')) {
    if (returnJson) {
      return new Response(
        JSON.stringify({
          success: true,
          storageUrl: imageUrl,
          cached: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }
  }

  const urlHash = await hashUrl(imageUrl)
  const defaultExt = getFileExtension(imageUrl)
  const cachePath = `${CACHE_PREFIX}/${urlHash}.${defaultExt}`
  const publicStorageUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${cachePath}`

  // 1. Check if cached in Storage (unless forceUpload without cache check)
  if (!forceUpload) {
    try {
      const { data: cachedBlob, error: downloadError } = await supabase.storage
        .from(BUCKET_NAME)
        .download(cachePath)

      if (cachedBlob && !downloadError) {
        if (returnJson) {
          return new Response(
            JSON.stringify({
              success: true,
              storageUrl: publicStorageUrl,
              cached: true,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          )
        }

        const arrayBuffer = await cachedBlob.arrayBuffer()
        const contentType = cachedBlob.type || 'image/jpeg'
        return new Response(arrayBuffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=604800, s-maxage=604800',
            'Access-Control-Allow-Origin': '*',
            'X-Cache': 'HIT-STORAGE',
            'X-Storage-Url': publicStorageUrl,
          },
        })
      }
    } catch (_e) {
      // Storage lookup failed, fall through to fetch
    }
  }

  // 2. Fetch from external source
  try {
    const candidateUrls = [imageUrl]
    if (imageUrl.includes('/cdn-cgi/image/')) {
      const directMatch = imageUrl.match(/(https?:\/\/[^/]+\/images\/.*)/)
      if (directMatch && directMatch[1]) {
        candidateUrls.push(directMatch[1])
      }
    }

    let downloadSuccess = false
    let imageBuffer: ArrayBuffer | null = null
    let contentType = 'image/jpeg'
    let lastError = ''

    for (const candUrl of candidateUrls) {
      if (downloadSuccess) break

      const headerSets = [
        {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          Referer: `${parsedUrl.origin}/`,
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
          Referer: 'https://www.google.com/',
          Accept: '*/*',
        },
      ]

      for (const hdrs of headerSets) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 12000)

          const response = await fetch(candUrl, {
            signal: controller.signal,
            headers: hdrs,
          })
          clearTimeout(timeoutId)

          if (response.ok) {
            contentType = response.headers.get('Content-Type') || 'image/jpeg'
            const buf = await response.arrayBuffer()
            if (buf && buf.byteLength > 200) {
              imageBuffer = buf
              downloadSuccess = true
              break
            }
          } else {
            lastError = `HTTP ${response.status} ${response.statusText}`
          }
        } catch (fetchErr: any) {
          lastError = fetchErr?.message || 'Fetch failed'
        }
      }
    }

    if (!downloadSuccess || !imageBuffer) {
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch image',
          message: lastError || 'All download attempts failed',
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 3. Persist to Storage
    const ext = getFileExtension(imageUrl, contentType)
    const finalCachePath = `${CACHE_PREFIX}/${urlHash}.${ext}`
    const finalStorageUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${finalCachePath}`

    const syncProductImageUrl = async (storageUrl: string) => {
      try {
        if (productId) {
          await supabase.from('products').update({ image_url: storageUrl }).eq('id', productId)
          await supabase.from('image_migration_failures').delete().eq('product_id', productId)
        } else {
          const { data: matchedProducts } = await supabase
            .from('products')
            .select('id')
            .eq('image_url', imageUrl)
            .limit(10)

          if (matchedProducts && matchedProducts.length > 0) {
            const pids = matchedProducts.map((p) => p.id)
            await supabase.from('products').update({ image_url: storageUrl }).in('id', pids)
            await supabase.from('image_migration_failures').delete().in('product_id', pids)
          }
        }
      } catch (syncErr) {
        console.warn('Failed to sync product image_url from proxy:', syncErr)
      }
    }

    const uploadPromise = supabase.storage.from(BUCKET_NAME).upload(finalCachePath, imageBuffer, {
      contentType,
      upsert: true,
    })

    if (forceUpload || returnJson) {
      const { error: uploadErr } = await uploadPromise
      if (uploadErr) {
        console.warn('Failed to upload image to storage:', uploadErr)
        return new Response(
          JSON.stringify({
            error: 'Failed to upload image to storage',
            message: uploadErr.message,
          }),
          {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      await syncProductImageUrl(finalStorageUrl)

      return new Response(
        JSON.stringify({
          success: true,
          storageUrl: finalStorageUrl,
          cached: false,
          productId: productId || null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Background upload and product sync for standard image streaming
    uploadPromise
      .then(async ({ error: upErr }) => {
        if (!upErr) {
          await syncProductImageUrl(finalStorageUrl)
        }
      })
      .catch((err) => console.warn('Failed to cache image in storage:', err))

    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'MISS',
        'X-Storage-Url': finalStorageUrl,
      },
    })
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: 'Failed to process image', message: error?.message }),
      {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
