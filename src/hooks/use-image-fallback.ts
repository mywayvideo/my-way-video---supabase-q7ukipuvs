import { supabase } from '@/lib/supabase/client'
import { getProxiedImageUrl, isStorageImageUrl } from '@/lib/image-proxy'

export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null

  if (isStorageImageUrl(url)) {
    return url
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return getProxiedImageUrl(url) || url
  }

  const { data } = supabase.storage.from('product-images').getPublicUrl(url)
  return data.publicUrl
}
