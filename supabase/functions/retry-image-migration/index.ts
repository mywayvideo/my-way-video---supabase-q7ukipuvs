import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

const BUCKET_NAME = 'product-images'
const DEFAULT_BATCH_SIZE = 30
const MAX_BATCH_SIZE = 35
const SLEEP_BETWEEN_DOWNLOADS_MS = 2500 // Ritmo humano de 2.5s entre requisições
const BACKOFF_CEILING_HOURS = 24

function getFileExtension(url: string, contentType?: string | null): string {
  try {
    const pathname = new URL(url).pathname
    const ext = pathname.split('.').pop()?.toLowerCase()?.split('?')[0] || ''
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext
    }
  } catch {
    // ignore
  }

  if (contentType) {
    if (contentType.includes('png')) return 'png'
    if (contentType.includes('webp')) return 'webp'
    if (contentType.includes('gif')) return 'gif'
    if (contentType.includes('svg')) return 'svg'
    if (contentType.includes('avif')) return 'avif'
  }
  return 'jpg'
}

/**
 * Calcula se um registro de falha ainda está no período de cooldown (backoff exponencial).
 * attempt 1 -> 1 hora
 * attempt 2 -> 2 horas
 * attempt 3 -> 4 horas
 * attempt 4 -> 8 horas
 * attempt 5+ -> teto de 24 horas
 */
function isUnderBackoff(attemptCount: number, updatedAtStr: string | null): boolean {
  if (!updatedAtStr || attemptCount <= 0) return false
  const hoursDelay = Math.min(Math.pow(2, Math.max(0, attemptCount - 1)), BACKOFF_CEILING_HOURS)
  const lastAttemptTime = new Date(updatedAtStr).getTime()
  if (isNaN(lastAttemptTime)) return false
  const retryAfter = lastAttemptTime + hoursDelay * 60 * 60 * 1000
  return Date.now() < retryAfter
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // Leitura de parâmetros (query params ou corpo JSON)
  const urlObj = new URL(req.url)
  let limit = parseInt(urlObj.searchParams.get('limit') || `${DEFAULT_BATCH_SIZE}`, 10)
  let forceAll = urlObj.searchParams.get('force') === 'true'

  if (req.method === 'POST') {
    try {
      const body = await req.json()
      if (body.limit) limit = parseInt(body.limit, 10)
      if (body.force !== undefined) forceAll = !!body.force
    } catch {
      // Body vazio ou não JSON, prosseguir com defaults
    }
  }

  if (isNaN(limit) || limit <= 0) limit = DEFAULT_BATCH_SIZE
  if (limit > MAX_BATCH_SIZE) limit = MAX_BATCH_SIZE

  // 1. Buscar produtos pendentes que NÃO estão no Storage
  // Limite seguro de busca para filtrar em memória por backoff
  const { data: pendingProducts, error: prodError } = await supabase
    .from('products')
    .select('id, name, sku, image_url')
    .not('image_url', 'is', null)
    .not('image_url', 'ilike', `%${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}%`)
    .not('image_url', 'ilike', '%/storage/v1/object/public/product-images%')
    .order('created_at', { ascending: true })
    .limit(1000)

  if (prodError) {
    return new Response(JSON.stringify({ error: prodError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!pendingProducts || pendingProducts.length === 0) {
    return new Response(
      JSON.stringify({
        message: 'Nenhum produto pendente de migração encontrado',
        processed: 0,
        converted: 0,
        failed: 0,
        pendingTotal: 0,
        skippedBackoff: 0,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // 2. Buscar tabela image_migration_failures para mapear histórico de falhas e backoff
  const { data: failureRecords } = await supabase
    .from('image_migration_failures')
    .select('id, product_id, attempt_count, updated_at, error_message')

  const failureMap = new Map<
    string,
    { id: string; attempt_count: number; updated_at: string; error_message?: string }
  >()
  if (failureRecords) {
    for (const f of failureRecords) {
      if (f.product_id) {
        failureMap.set(f.product_id, f)
      }
    }
  }

  // 3. Filtrar e ordenar candidatos:
  // - Produtos sem falhas primeiro
  // - Produtos cujo backoff já expirou, priorizando os de menor attempt_count ou atualizados há mais tempo
  // - Respeitar flag forceAll para bypass de backoff se disparado manualmente
  let eligibleProducts: typeof pendingProducts = []
  let skippedBackoffCount = 0

  for (const prod of pendingProducts) {
    const failInfo = failureMap.get(prod.id)
    if (!failInfo) {
      // Nunca falhou ou falha anterior foi limpa -> prioridade alta
      eligibleProducts.push(prod)
      continue
    }

    if (!forceAll && isUnderBackoff(failInfo.attempt_count, failInfo.updated_at)) {
      skippedBackoffCount++
      continue
    }

    eligibleProducts.push(prod)
  }

  // Ordenação inteligente: primeiro os que nunca falharam (0 tentativas), depois os com menor número de tentativas
  eligibleProducts.sort((a, b) => {
    const attemptsA = failureMap.get(a.id)?.attempt_count || 0
    const attemptsB = failureMap.get(b.id)?.attempt_count || 0
    if (attemptsA !== attemptsB) return attemptsA - attemptsB
    const dateA = new Date(failureMap.get(a.id)?.updated_at || 0).getTime()
    const dateB = new Date(failureMap.get(b.id)?.updated_at || 0).getTime()
    return dateA - dateB
  })

  // Selecionar o lote exato de até ~30 itens
  const batch = eligibleProducts.slice(0, limit)

  let convertedCount = 0
  let failedCount = 0
  const results: Array<{
    id: string
    sku?: string
    name?: string
    success: boolean
    storageUrl?: string
    error?: string
    attemptCount?: number
  }> = []

  // 4. Processamento sequencial com pausa para imitar ritmo humano
  for (let idx = 0; idx < batch.length; idx++) {
    const prod = batch[idx]
    const extUrl = prod.image_url?.trim()

    if (!extUrl || extUrl.includes('/storage/v1/object/public/product-images')) {
      continue
    }

    // Se não for o primeiro item, aplicar pausa de ritmo humano
    if (idx > 0) {
      await sleep(SLEEP_BETWEEN_DOWNLOADS_MS)
    }

    const candidateUrls: string[] = [extUrl]
    if (extUrl.includes('/cdn-cgi/image/')) {
      const directMatch = extUrl.match(/(https?:\/\/[^/]+\/images\/.*)/)
      if (directMatch && directMatch[1]) {
        candidateUrls.push(directMatch[1])
      }
    }

    let downloadSuccess = false
    let arrayBuffer: ArrayBuffer | null = null
    let contentType = 'image/jpeg'
    let lastError = ''

    for (const candidate of candidateUrls) {
      if (downloadSuccess) break

      const headerSets = [
        {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          Referer: 'https://www.bhphotovideo.com/',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Sec-Ch-Ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'image',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'same-origin',
        },
        {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
          Referer: 'https://www.google.com/',
          Accept: '*/*',
        },
      ]

      for (const headers of headerSets) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 12000)

          const resp = await fetch(candidate, {
            signal: controller.signal,
            headers,
          })
          clearTimeout(timeoutId)

          if (resp.ok) {
            contentType = resp.headers.get('Content-Type') || 'image/jpeg'
            const buf = await resp.arrayBuffer()
            if (buf && buf.byteLength > 500) {
              arrayBuffer = buf
              downloadSuccess = true
              break
            }
          } else {
            lastError = `HTTP ${resp.status} ${resp.statusText}`
          }
        } catch (e: any) {
          lastError = e?.message || 'Download error'
        }

        await sleep(500)
      }
    }

    if (downloadSuccess && arrayBuffer) {
      try {
        const ext = getFileExtension(extUrl, contentType)
        const filePath = `products/${prod.id}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(filePath, arrayBuffer, {
            contentType,
            upsert: true,
          })

        if (uploadError) throw uploadError

        const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath)
        const storageUrl = publicUrlData.publicUrl

        const { error: updateError } = await supabase
          .from('products')
          .update({ image_url: storageUrl })
          .eq('id', prod.id)

        if (updateError) throw updateError

        convertedCount++
        results.push({
          id: prod.id,
          sku: prod.sku,
          name: prod.name,
          success: true,
          storageUrl,
        })

        // Sucesso: remove da tabela de falhas
        await supabase.from('image_migration_failures').delete().eq('product_id', prod.id)
        continue
      } catch (saveErr: any) {
        lastError = `Upload/Update error: ${saveErr?.message || saveErr}`
      }
    }

    // Em caso de falha: registrar ou atualizar image_migration_failures com backoff exponencial
    failedCount++
    const existingFail = failureMap.get(prod.id)
    const newAttemptCount = existingFail ? (existingFail.attempt_count || 1) + 1 : 1

    results.push({
      id: prod.id,
      sku: prod.sku,
      name: prod.name,
      success: false,
      error: lastError,
      attemptCount: newAttemptCount,
    })

    try {
      if (existingFail) {
        await supabase
          .from('image_migration_failures')
          .update({
            error_message: lastError,
            attempt_count: newAttemptCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingFail.id)
      } else {
        await supabase.from('image_migration_failures').insert({
          product_id: prod.id,
          external_url: extUrl,
          error_message: lastError,
          attempt_count: 1,
        })
      }
    } catch (_logErr) {
      console.warn('Falha ao atualizar log de migração:', _logErr)
    }
  }

  // 5. Total restante pendente
  const { count: pendingTotal } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .not('image_url', 'is', null)
    .not('image_url', 'ilike', `%${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}%`)
    .not('image_url', 'ilike', '%/storage/v1/object/public/product-images%')

  return new Response(
    JSON.stringify({
      message: `Lote processado: ${batch.length} produtos analisados`,
      processed: batch.length,
      converted: convertedCount,
      failed: failedCount,
      skippedBackoff: skippedBackoffCount,
      pendingTotal: pendingTotal ?? 0,
      results,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
})
