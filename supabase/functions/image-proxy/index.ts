import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
  const imageUrl = requestUrl.searchParams.get('url')

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

  const urlHash = await hashUrl(imageUrl)
  const defaultExt = getFileExtension(imageUrl)
  const cachePath = `${CACHE_PREFIX}/${urlHash}.${defaultExt}`

  // 1. Check if cached in Storage
  try {
    const { data: cachedBlob, error: downloadError } = await supabase.storage
      .from(BUCKET_NAME)
      .download(cachePath)

    if (cachedBlob && !downloadError) {
      const arrayBuffer = await cachedBlob.arrayBuffer()
      const contentType = cachedBlob.type || 'image/jpeg'
      return new Response(arrayBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=604800, s-maxage=604800',
          'Access-Control-Allow-Origin': '*',
          'X-Cache': 'HIT-STORAGE',
        },
      })
    }
  } catch (_e) {
    // Storage lookup failed, fall through to fetch
  }

  // 2. Fetch from external source
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Referer: `${parsedUrl.origin}/`,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch image', status: response.status }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const contentType = response.headers.get('Content-Type') || 'image/jpeg'
    const imageBuffer = await response.arrayBuffer()

    // 3. Persist to Storage in background / async (non-blocking for response)
    const ext = getFileExtension(imageUrl, contentType)
    const finalCachePath = `${CACHE_PREFIX}/${urlHash}.${ext}`
    supabase.storage
      .from(BUCKET_NAME)
      .upload(finalCachePath, imageBuffer, {
        contentType,
        upsert: true,
      })
      .catch((err) => console.warn('Failed to cache image in storage:', err))

    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'MISS',
      },
    })
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch image', message: error?.message }),
      {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
