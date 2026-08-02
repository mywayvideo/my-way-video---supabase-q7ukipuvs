import { debugLog } from '@/utils/debug-front'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

const TRUSTED_IMAGE_DOMAINS = [
  'bhphotovideo.com',
  'bhphoto.com',
  'static.bhphoto.com',
  'images.bhphotovideo.com',
  'eimagevideo.com',
  'img.usecurling.com',
  'm.media-amazon.com',
  'images-na.ssl-images-amazon.com',
  'cdn.bhphotovideo.com',
]

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function isTrustedImageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const hostname = getHostname(url)
  if (!hostname) return false
  return TRUSTED_IMAGE_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith('.' + domain),
  )
}

export function getProxiedImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.includes('/functions/v1/image-proxy')) {
    debugLog('getProxiedImageUrl:skip', `reason="already proxied" url=${url.substring(0, 120)}`)
    return url
  }
  try {
    const parsed = new URL(url)
    if (parsed.searchParams.has('apikey')) {
      debugLog(
        'getProxiedImageUrl:skip',
        `reason="already has apikey" url=${url.substring(0, 120)}`,
      )
      return url
    }
    if (parsed.searchParams.has('url') && parsed.pathname.includes('proxy')) {
      debugLog(
        'getProxiedImageUrl:skip',
        `reason="already uses proxy service" url=${url.substring(0, 120)}`,
      )
      return url
    }
    if (parsed.hostname === 'wsrv.nl') {
      const originalUrl = parsed.searchParams.get('url')
      if (originalUrl) {
        const proxyUrl = new URL(`${SUPABASE_URL}/functions/v1/image-proxy`)
        proxyUrl.searchParams.set('url', originalUrl)
        proxyUrl.searchParams.set('apikey', SUPABASE_ANON_KEY)
        debugLog('getProxiedImageUrl:wsrv', `original=${originalUrl.substring(0, 80)}`)
        return proxyUrl.toString()
      }
    }
  } catch {
    // Not a valid URL, continue
  }
  if (isTrustedImageUrl(url)) {
    const proxyUrl = new URL(`${SUPABASE_URL}/functions/v1/image-proxy`)
    proxyUrl.searchParams.set('url', url)
    proxyUrl.searchParams.set('apikey', SUPABASE_ANON_KEY)
    debugLog('getProxiedImageUrl:proxied', `original=${url.substring(0, 80)}`)
    return proxyUrl.toString()
  }
  debugLog('getProxiedImageUrl:skip', `reason="not trusted domain" url=${url.substring(0, 120)}`)
  return url
}

export function normalizeImageUrl(url: string): string {
  if (!url) return ''
  try {
    const parsed = new URL(url)

    if (parsed.hostname === 'wsrv.nl') {
      const originalUrl = parsed.searchParams.get('url')
      if (originalUrl) return originalUrl
    }

    if (parsed.pathname.includes('/functions/v1/image-proxy')) {
      const originalUrl = parsed.searchParams.get('url')
      if (originalUrl) return originalUrl
    }

    return url
  } catch {
    return url
  }
}

export function proxyMarkdownImages(markdown: string): string {
  if (!markdown) return markdown
  let proxiedCount = 0
  let alreadyProxiedCount = 0
  const result = markdown.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (match, alt: string, url: string) => {
      if (url.includes('/functions/v1/image-proxy')) {
        alreadyProxiedCount++
      }
      const proxied = getProxiedImageUrl(url)
      if (proxied && proxied !== url) {
        proxiedCount++
        return `![${alt}](${proxied})`
      }
      return match
    },
  )
  debugLog(
    'proxyMarkdownImages',
    `inputLen=${markdown.length} outputLen=${result.length} proxied=${proxiedCount} alreadyProxied=${alreadyProxiedCount}`,
  )
  return result
}
