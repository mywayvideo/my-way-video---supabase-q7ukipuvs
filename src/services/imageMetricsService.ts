import { supabase } from '@/lib/supabase/client'

export interface ImageStorageMetrics {
  totalWithImages: number
  inStorage: number
  viaProxy: number
  withoutImage: number
  storagePercent: number
  proxyPercent: number
  loading: boolean
}

export async function fetchProductImageMetrics(): Promise<{
  totalWithImages: number
  inStorage: number
  viaProxy: number
  withoutImage: number
  storagePercent: number
  proxyPercent: number
}> {
  // Query count total com imagem
  const { count: totalWithImages, error: errTotal } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .not('image_url', 'is', null)
    .neq('image_url', '')

  if (errTotal) {
    throw errTotal
  }

  // Query count com imagem no Supabase Storage (path product-images)
  const { count: inStorage, error: errStorage } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .not('image_url', 'is', null)
    .neq('image_url', '')
    .ilike('image_url', '%product-images%')

  if (errStorage) {
    throw errStorage
  }

  // Query count sem imagem
  const { count: withoutImage } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .or('image_url.is.null,image_url.eq.')

  const total = totalWithImages ?? 0
  const storageCount = inStorage ?? 0
  const proxyCount = Math.max(0, total - storageCount)
  const noImgCount = withoutImage ?? 0

  const storagePercent = total > 0 ? Number(((storageCount / total) * 100).toFixed(1)) : 0
  const proxyPercent = total > 0 ? Number(((proxyCount / total) * 100).toFixed(1)) : 0

  return {
    totalWithImages: total,
    inStorage: storageCount,
    viaProxy: proxyCount,
    withoutImage: noImgCount,
    storagePercent,
    proxyPercent,
  }
}

export interface RetryBatchResult {
  message: string
  processed: number
  converted: number
  failed: number
  skippedBackoff: number
  pendingTotal: number
  results?: Array<{
    id: string
    sku?: string
    name?: string
    success: boolean
    storageUrl?: string
    error?: string
    attemptCount?: number
  }>
}

export async function triggerManualImageRetryBatch(options?: {
  limit?: number
  force?: boolean
}): Promise<RetryBatchResult> {
  const { data, error } = await supabase.functions.invoke('retry-image-migration', {
    body: {
      limit: options?.limit ?? 30,
      force: options?.force ?? false,
    },
  })

  if (error) {
    throw new Error(error.message || 'Falha ao executar lote de re-tentativa')
  }

  return data as RetryBatchResult
}
