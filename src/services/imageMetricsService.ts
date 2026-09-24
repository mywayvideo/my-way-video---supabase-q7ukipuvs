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
  try {
    // Query count total com imagem
    let totalWithImages = 0
    try {
      const { count, error: errTotal } = await supabase
        .from('products')
        .select('id', { count: 'exact' })
        .limit(0)
        .not('image_url', 'is', null)
        .neq('image_url', '')

      if (errTotal) {
        console.warn('Erro ao consultar métricas de produtos com imagem:', errTotal)
      } else {
        totalWithImages = count ?? 0
      }
    } catch (err) {
      console.warn('Exceção ao consultar métricas de produtos com imagem:', err)
    }

    // Query count com imagem no Supabase Storage (path product-images)
    let inStorage = 0
    try {
      const { count, error: errStorage } = await supabase
        .from('products')
        .select('id', { count: 'exact' })
        .limit(0)
        .not('image_url', 'is', null)
        .neq('image_url', '')
        .ilike('image_url', '%product-images%')

      if (errStorage) {
        console.warn('Erro ao consultar métricas de produtos no storage:', errStorage)
      } else {
        inStorage = count ?? 0
      }
    } catch (err) {
      console.warn('Exceção ao consultar métricas de produtos no storage:', err)
    }

    // Query count sem imagem
    let withoutImage = 0
    try {
      const { count, error: errWithoutImage } = await supabase
        .from('products')
        .select('id', { count: 'exact' })
        .limit(0)
        .or('image_url.is.null,image_url.eq.')

      if (errWithoutImage) {
        console.warn('Erro ao consultar métricas de produtos sem imagem:', errWithoutImage)
      } else {
        withoutImage = count ?? 0
      }
    } catch (err) {
      console.warn('Exceção ao consultar métricas de produtos sem imagem:', err)
    }

    const total = totalWithImages
    const storageCount = inStorage
    const proxyCount = Math.max(0, total - storageCount)
    const noImgCount = withoutImage

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
  } catch (error) {
    console.warn('Falha geral ao carregar métricas de imagens:', error)
    return {
      totalWithImages: 0,
      inStorage: 0,
      viaProxy: 0,
      withoutImage: 0,
      storagePercent: 0,
      proxyPercent: 0,
    }
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
