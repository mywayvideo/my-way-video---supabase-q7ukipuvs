import { supabase } from '@/lib/supabase/client'

export interface SpamCleanupResult {
  total_processed: number
  spam_removed: number
  kept: number
}

export async function runSpamCleanup(): Promise<SpamCleanupResult> {
  const { data, error } = await supabase.functions.invoke('cleanup-spam-customers')
  if (error) throw new Error(error.message || 'Erro ao executar limpeza')
  return data as SpamCleanupResult
}
