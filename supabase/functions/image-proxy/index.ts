import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
  'Access-Control-Allow-Headers': '*',
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
  ]

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

  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://www.bhphotovideo.com/',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    })

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch image' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const contentType = response.headers.get('Content-Type') || 'image/jpeg'
    const imageBuffer = await response.arrayBuffer()

    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (_error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch image' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
