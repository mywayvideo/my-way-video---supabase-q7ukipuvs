import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function loadCacheSettings() {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data, error } = await supabase.from('cache_settings').select('*').limit(1).maybeSingle()

  if (error) {
    console.error('Error loading cache settings:', error)
  }

  // O segredo está no ponto de interrogação (data?.)
  // Se a tabela estiver vazia (data = null), ele não quebra e usa os valores padrão.
  return {
    miExpirationDays: data?.mi_expiration_days ?? 365,
    productSearchCacheExpirationDays: data?.product_search_cache_expiration_days ?? 30,
    productCacheExpirationDays: data?.product_cache_expiration_days ?? 90,
  }
}
