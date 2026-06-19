import { supabase } from '@/lib/supabase/client'

export async function saveToCache(payload: {
  title: string
  raw_content: string
  source_url?: string
}) {
  try {
    // Prevent duplicates based on title and content snippet
    const contentSnippet = payload.raw_content.substring(0, 30)
    const { data: existing } = await supabase
      .from('market_intelligence')
      .select('id')
      .or(`title.ilike.%${payload.title}%,raw_content.ilike.%${contentSnippet}%`)
      .limit(1)
      .maybeSingle()

    if (!existing) {
      const { error } = await supabase.from('market_intelligence').insert([
        {
          title: payload.title,
          raw_content: payload.raw_content,
          source_url: payload.source_url || 'https://mywayvideo.com/search',
          status: 'published',
          metadata: { tags: ['NAB 2026', 'WebSearch'] },
        },
      ])

      if (error) {
        console.error('[saveToCache] Insert error:', error)
      }
    }
  } catch (e) {
    console.error('[saveToCache] Execution error:', e)
  }
}
