import { supabase } from '@/lib/supabase/client'

export const searchProducts = async (query: string) => {
  try {
    if (!query || !query.trim()) return []

    // Call RPC to get ranked IDs
    const { data: rpcData, error: rpcError } = await supabase.rpc('search_products_v2', {
      search_term: query,
      boost_multiplier: 1.0,
    })

    if (rpcError) {
      console.error('Database search error:', rpcError)
      return []
    }

    if (!rpcData || rpcData.length === 0) return []

    const ids = rpcData.map((item: any) => item.id)

    // Fetch full product details
    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('*')
      .in('id', ids)

    if (prodError) {
      console.error('Database fetch products error:', prodError)
      return []
    }

    // Sort by the RPC final_rank order
    const sortedProducts = ids.map((id) => products?.find((p) => p.id === id)).filter(Boolean)

    return sortedProducts
  } catch (error) {
    console.error('Database search error exception:', error)
    return []
  }
}
