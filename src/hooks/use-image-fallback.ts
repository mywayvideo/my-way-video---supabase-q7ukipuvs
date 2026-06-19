import { supabase } from '@/lib/supabase/client'

export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null

  if (url.includes('bhphotovideo.com') || url.startsWith('http') || url.startsWith('https')) {
    return url
  }

  const { data } = supabase.storage.from('products').getPublicUrl(url)
  return data.publicUrl
}
