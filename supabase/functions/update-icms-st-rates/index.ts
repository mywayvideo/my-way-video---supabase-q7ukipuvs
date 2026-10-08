import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IcmsStPayloadRecord {
  ncm_familia: string
  ncm_excecoes?: string[]
  uf?: string
  cest?: string | null
  mva_original?: number | null
  mva_ajustada?: number | null
  aliquota_interna?: number
  aliquota_interestadual?: number | null
  sujeito_st?: boolean
  regime?: string
  base_legal?: string
  fonte?: string
  vigencia_inicio?: string
  vigencia_fim?: string | null
}

interface IcmsStPayloadMeta {
  versao?: string
  gerado_em?: string
  descricao?: string
  uf_padrao?: string
  total_familias?: number
  [key: string]: unknown
}

interface IcmsStRpcResponse {
  total_upserted: number
  total_inserted: number
  total_updated: number
  ufs: string[]
}

interface IcmsStOverdueFamily {
  ncm_familia: string
  uf: string
  legal_reviewed_at: string | null
  legal_reviewed_by: string | null
  months_overdue: number | null
  status: 'never_reviewed' | 'overdue'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function jsonOk(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function timestampFromFilename(name: string): number {
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})(?:[-_T](\d{2})?(\d{2})?(\d{2})?)?/)
  if (!m) return 0
  const [, y, mo, d, hh = '00', mm = '00', ss = '00'] = m
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss))
  return isNaN(t) ? 0 : t
}

/**
 * Lê o payload mais recente de ICMS-ST no bucket 'tax-payloads'.
 * Procura primeiro na pasta/prefixo 'st/' e, se não encontrar, procura arquivos
 * com 'icms-st' no nome na raiz do bucket.
 */
async function readLatestIcmsStPayload(
  supabaseClient: ReturnType<typeof createClient>,
): Promise<
  | { ok: true; records: IcmsStPayloadRecord[]; metadata?: IcmsStPayloadMeta; filename: string }
  | { ok: false; resp: Response }
> {
  // 1. Tenta listar na pasta st/
  let targetFolder = 'st'
  let { data: files, error: listError } = await supabaseClient.storage
    .from('tax-payloads')
    .list('st')

  // Se não encontrar ou der erro, lista raiz
  let isRoot = false
  if (listError || !files || files.length === 0) {
    const rootList = await supabaseClient.storage.from('tax-payloads').list('')
    if (!rootList.error && rootList.data && rootList.data.length > 0) {
      // Filtra por arquivos que contenham 'icms-st' ou 'st'
      const stFiles = rootList.data.filter(
        (f) =>
          f.name.endsWith('.json') &&
          !f.name.endsWith('.json/') &&
          (f.name.toLowerCase().includes('icms-st') || f.name.toLowerCase().includes('icms_st')),
      )
      if (stFiles.length > 0) {
        files = stFiles
        targetFolder = ''
        isRoot = true
      }
    }
  }

  if (listError && !isRoot) {
    return {
      ok: false,
      resp: jsonError(`Erro ao acessar o bucket de payloads (st/): ${listError.message}`, 500),
    }
  }

  const jsonFiles = (files || []).filter(
    (f) => f.name.endsWith('.json') && !f.name.endsWith('.json/'),
  )

  if (jsonFiles.length === 0) {
    return {
      ok: false,
      resp: jsonError('Nenhum payload de ICMS-ST disponível no bucket tax-payloads.', 404),
    }
  }

  // Ordena pelo timestamp embutido no nome do arquivo ou data de criação
  jsonFiles.sort((a, b) => {
    const tA = timestampFromFilename(a.name) || new Date(a.created_at || 0).getTime()
    const tB = timestampFromFilename(b.name) || new Date(b.created_at || 0).getTime()
    return tB - tA
  })
  const latest = jsonFiles[0]
  const fullPath = targetFolder ? `${targetFolder}/${latest.name}` : latest.name
  console.log(`[INFO] Payload ICMS-ST mais recente selecionado: ${fullPath}`)

  const { data: fileData, error: dlError } = await supabaseClient.storage
    .from('tax-payloads')
    .download(fullPath)

  if (dlError || !fileData) {
    return {
      ok: false,
      resp: jsonError(
        `Erro ao baixar o payload "${fullPath}": ${dlError?.message ?? 'arquivo vazio'}`,
        500,
      ),
    }
  }

  let parsed: any
  try {
    parsed = JSON.parse(await fileData.text())
  } catch (e: any) {
    return {
      ok: false,
      resp: jsonError(`Payload de ICMS-ST inválido (JSON malformado): ${e.message}`, 400),
    }
  }

  // Suporte tanto para { records: [...] } quanto [...]
  let records: IcmsStPayloadRecord[] = []
  let metadata: IcmsStPayloadMeta | undefined

  if (Array.isArray(parsed)) {
    records = parsed
  } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.records)) {
    records = parsed.records
    metadata = parsed.metadata
  } else {
    return {
      ok: false,
      resp: jsonError(
        'Payload de ICMS-ST inválido: deve ser um array ou conter a chave "records".',
        400,
      ),
    }
  }

  if (records.length === 0) {
    return {
      ok: false,
      resp: jsonError('Payload de ICMS-ST inválido: lista de registros vazia.', 400),
    }
  }

  return { ok: true, records, metadata, filename: fullPath }
}

// ---------------------------------------------------------------------------
// Request Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json().catch(() => ({}))

    const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey =
      Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonError(
        'Configuração do servidor incompleta (URL ou chave de serviço ausente).',
        500,
      )
    }

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey)

    // Se a requisição solicitar upload/seed do payload canônico no storage:
    if (
      body?.action === 'upload-canonical' &&
      ((Array.isArray(body?.records) && body.records.length > 0) ||
        (body?.record && typeof body?.record === 'object'))
    ) {
      const recordsToUpload = Array.isArray(body?.records) ? body.records : [body.record]
      const filename =
        body?.filename || `st/payload-icms-st-${new Date().toISOString().slice(0, 10)}.json`
      const payloadContent = JSON.stringify(
        {
          metadata: body.metadata || {
            versao: '1.0',
            gerado_em: new Date().toISOString(),
            uf_padrao: 'DF',
            total_familias: recordsToUpload.length,
          },
          records: recordsToUpload,
        },
        null,
        2,
      )

      const { error: uploadError } = await supabaseClient.storage
        .from('tax-payloads')
        .upload(filename, new Blob([payloadContent], { type: 'application/json' }), {
          upsert: true,
          contentType: 'application/json',
        })

      if (uploadError) {
        console.error('[ERROR] Falha no upload do payload canônico de ICMS-ST:', uploadError)
        return jsonError(`Falha ao gravar payload no bucket: ${uploadError.message}`, 500)
      }

      console.log(`[INFO] Payload canônico de ICMS-ST salvo com sucesso em ${filename}`)
      return jsonOk({
        success: true,
        message: 'Payload de ICMS-ST salvo no storage com sucesso.',
        filename,
      })
    }

    // Se o cliente enviar registros diretamente no body, usa diretamente
    let recordsToProcess: IcmsStPayloadRecord[] = []
    let sourceFilename: string | null = null
    let metadata: IcmsStPayloadMeta | undefined

    // Se o usuário pedir para usar inline ou se não houver arquivo no storage
    if (Array.isArray(body?.records) && body.records.length > 0) {
      recordsToProcess = body.records
      metadata = body.metadata
      sourceFilename = body.source_file || 'inline-payload'
    } else if (Array.isArray(body) && body.length > 0) {
      recordsToProcess = body
      sourceFilename = 'inline-payload'
    } else {
      // Busca no bucket de storage
      const payloadResult = await readLatestIcmsStPayload(supabaseClient)
      if (!payloadResult.ok) {
        return payloadResult.resp
      }
      recordsToProcess = payloadResult.records
      metadata = payloadResult.metadata
      sourceFilename = payloadResult.filename
    }

    // Sobrescrita canônica de segurança para a família 8537 (Prot. ICMS 84/11, Anexo Único, item 18: 29% MVA original e 61.25% MVA ajustada)
    recordsToProcess = recordsToProcess.map((rec) => {
      if (rec.ncm_familia === '8537') {
        return {
          ...rec,
          mva_original: 29.0,
          mva_ajustada: 61.25,
        }
      }
      return rec
    })

    console.log(
      `[INFO] Invocando RPC update_icms_st_from_payload com ${recordsToProcess.length} registros...`,
    )

    // Chama a RPC update_icms_st_from_payload
    const { data: rpcData, error: rpcError } = await supabaseClient.rpc(
      'update_icms_st_from_payload',
      {
        p_payload: recordsToProcess,
      },
    )

    if (rpcError) {
      console.error('[ERROR] Falha na RPC update_icms_st_from_payload:', rpcError)
      return jsonError(
        `Erro ao persistir alíquotas de ICMS-ST no banco: ${rpcError.message || JSON.stringify(rpcError)}`,
        500,
      )
    }

    const res = (rpcData || {}) as IcmsStRpcResponse
    console.log('[INFO] Atualização de ICMS-ST concluída com sucesso:', res)

    // Consulta famílias com revisão pendente ou vencida (default: 6 meses ou configurado via body)
    const overdueMonthsThreshold = Number(body?.review_threshold_months || 6)
    const targetUfs = Array.isArray(res.ufs) && res.ufs.length > 0 ? res.ufs : ['DF']

    let overdueFamilies: IcmsStOverdueFamily[] = []
    try {
      const { data: ratesList, error: queryError } = await supabaseClient
        .from('imp_sim_icms_st_rates')
        .select('ncm_familia, uf, legal_reviewed_at, legal_reviewed_by')
        .in('uf', targetUfs)

      if (!queryError && ratesList) {
        const now = Date.now()
        const msInMonth = 30.4375 * 24 * 60 * 60 * 1000
        overdueFamilies = ratesList
          .map((row) => {
            if (!row.legal_reviewed_at) {
              return {
                ncm_familia: row.ncm_familia,
                uf: row.uf,
                legal_reviewed_at: null,
                legal_reviewed_by: row.legal_reviewed_by ?? null,
                months_overdue: null,
                status: 'never_reviewed' as const,
              }
            }
            const reviewedTime = new Date(row.legal_reviewed_at).getTime()
            const diffMonths = (now - reviewedTime) / msInMonth
            if (diffMonths >= overdueMonthsThreshold) {
              return {
                ncm_familia: row.ncm_familia,
                uf: row.uf,
                legal_reviewed_at: row.legal_reviewed_at,
                legal_reviewed_by: row.legal_reviewed_by ?? null,
                months_overdue: Math.floor(diffMonths),
                status: 'overdue' as const,
              }
            }
            return null
          })
          .filter((item): item is IcmsStOverdueFamily => item !== null)
      }
    } catch (e) {
      console.warn('[WARN] Não foi possível verificar famílias com revisão vencida:', e)
    }

    return jsonOk({
      total_upserted: Number(res.total_upserted ?? 0),
      total_inserted: Number(res.total_inserted ?? 0),
      total_updated: Number(res.total_updated ?? 0),
      ufs: Array.isArray(res.ufs) ? res.ufs : [],
      source_file: sourceFilename,
      metadata: metadata || null,
      review_check: {
        threshold_months: overdueMonthsThreshold,
        total_overdue: overdueFamilies.length,
        overdue_families: overdueFamilies,
      },
    })
  } catch (error: any) {
    console.error('Unhandled error in update-icms-st-rates:', error)
    return new Response(JSON.stringify({ error: error.message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
