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
  if (isTrustedImageUrl(url)) {
    const proxyUrl = new URL(`${SUPABASE_URL}/functions/v1/image-proxy`)
    proxyUrl.searchParams.set('url', url)
    proxyUrl.searchParams.set('apikey', SUPABASE_ANON_KEY)
    return proxyUrl.toString()
  }
  return url
}

export function proxyMarkdownImages(markdown: string): string {
  if (!markdown) return markdown
  return markdown.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (match, alt: string, url: string) => {
      const proxied = getProxiedImageUrl(url)
      if (proxied && proxied !== url) {
        return `![${alt}](${proxied})`
      }
      return match
    },
  )
}
