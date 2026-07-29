const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

const BH_PHOTO_DOMAINS = [
  'bhphotovideo.com',
  'bhphoto.com',
  'static.bhphoto.com',
  'images.bhphotovideo.com',
]

export function isBhPhotoUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  return BH_PHOTO_DOMAINS.some((domain) => lower.includes(domain))
}

export function getProxiedImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (isBhPhotoUrl(url)) {
    const proxyUrl = new URL(`${SUPABASE_URL}/functions/v1/image-proxy`)
    proxyUrl.searchParams.set('url', url)
    proxyUrl.searchParams.set('apikey', SUPABASE_ANON_KEY)
    return proxyUrl.toString()
  }
  return url
}
