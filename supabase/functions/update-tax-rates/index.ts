import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { queryTTCE, authenticate, getSiscomexHost } from '../_shared/siscomex-client.ts'

const REQUEST_DELAY_MS = 1500

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedTaxRates {
  ii_rate: number
  ipi_rate: number
  pis_rate: number
  cofins_rate: number
  has_ex_tarifario: boolean
  legal_basis: Record<string, string>
}

interface ParsedExTarifario {
  ex: string
  ex_descricao: string | null
  ex_regime: string | null
  ex_resolucao: string | null
  ex_data_inicio: string | null
  ex_data_fim: string | null
  ii_ex: number
}

interface PayloadRecord {
  ncm: string
  ex: string | null
  descricao?: string | null
  ncm_descricao?: string | null
  ii_rate: number
  ii_base: number
  ipi_rate: number
  pis_rate: number
  cofins_rate: number
  legal_basis: Record<string, string>
  has_ex_tarifario: boolean
  source: string
  last_updated_at: string
  ex_descricao?: string | null
  ex_regime?: string | null
  ex_resolucao?: string | null
  ex_data_inicio?: string | null
  ex_data_fim?: string | null
  ii_ex?: number | null
  ipi_base?: number | null
  ipi_ex?: number | null
  ipi_ex_codigo?: string | null
  ipi_ex_descricao?: string | null
  ipi_ex_regime?: string | null
  ipi_ex_resolucao?: string | null
  ipi_ex_data_inicio?: string | null
  ipi_ex_data_fim?: string | null
}

interface PayloadMeta {
  gerado_em: string
  total_ncms: number
  total_ex: number
  vigencia_referencia: string
}

// ---------------------------------------------------------------------------
// Payload-based selective update (chapters flow)
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

function isTwoDigitChapter(v: unknown): v is string {
  return typeof v === 'string' && /^\d{2}$/.test(v)
}

function timestampFromFilename(name: string): number {
  // Matches payload-tributos-2026-08-16.json (optionally with time digits).
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})(?:[-_T](\d{2})?(\d{2})?(\d{2})?)?/)
  if (!m) return 0
  const [, y, mo, d, hh = '00', mm = '00', ss = '00'] = m
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss))
  return isNaN(t) ? 0 : t
}

/**
 * Reads the most recent payload file (by date in filename) from the private
 * 'tax-payloads' bucket using the service role client. Returns 404 when none.
 */
async function readLatestPayload(
  supabaseClient: ReturnType<typeof createClient>,
): Promise<
  { ok: true; records: PayloadRecord[]; metadata: PayloadMeta } | { ok: false; resp: Response }
> {
  const { data: files, error: listError } = await supabaseClient.storage.from('tax-payloads').list()

  if (listError) {
    return {
      ok: false,
      resp: jsonError(`Erro ao acessar o bucket de payloads: ${listError.message}`, 500),
    }
  }

  const jsonFiles = (files || []).filter(
    (f) => f.name.endsWith('.json') && !f.name.endsWith('.json/'),
  )

  if (jsonFiles.length === 0) {
    return {
      ok: false,
      resp: jsonError('Nenhum payload disponível. Gere o payload primeiro no batch local.', 404),
    }
  }

  // Pick the most recent by date embedded in the filename.
  jsonFiles.sort((a, b) => timestampFromFilename(b.name) - timestampFromFilename(a.name))
  const latest = jsonFiles[0]
  console.log(`[INFO] Payload mais recente selecionado: ${latest.name}`)

  const { data: fileData, error: dlError } = await supabaseClient.storage
    .from('tax-payloads')
    .download(latest.name)

  if (dlError || !fileData) {
    return {
      ok: false,
      resp: jsonError(
        `Erro ao baixar o payload "${latest.name}": ${dlError?.message ?? 'arquivo vazio'}`,
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
      resp: jsonError(`Payload inválido (JSON malformado): ${e.message}`, 400),
    }
  }

  // Validate payload structure.
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, resp: jsonError('Payload inválido: raiz não é um objeto.', 400) }
  }
  if (!parsed.metadata) {
    return { ok: false, resp: jsonError('Payload inválido: metadados ausentes.', 400) }
  }
  if (!Array.isArray(parsed.records) || parsed.records.length === 0) {
    return { ok: false, resp: jsonError('Payload inválido: records ausente ou vazio.', 400) }
  }

  const records: PayloadRecord[] = parsed.records
  const invalid: string[] = []
  for (const r of records) {
    if (typeof r?.ncm !== 'string' || !/^\d{8}$/.test(r.ncm)) {
      invalid.push(JSON.stringify(r?.ncm ?? r))
    }
  }
  if (invalid.length > 0) {
    return {
      ok: false,
      resp: jsonError('Payload inválido: registros com NCM não numérico de 8 dígitos.', 400, {
        registros_invalidos: invalid.slice(0, 50),
        total_invalidos: invalid.length,
      }),
    }
  }

  return { ok: true, records, metadata: parsed.metadata }
}

function isStatementTimeout(err: any): boolean {
  if (!err) return false
  if (err.code === '57014') return true
  const msg = String(err.message || '').toLowerCase()
  const details = String(err.details || '').toLowerCase()
  return (
    msg.includes('57014') ||
    msg.includes('statement timeout') ||
    msg.includes('canceling statement due to statement timeout') ||
    details.includes('57014') ||
    details.includes('statement timeout')
  )
}

interface ChunkCounters {
  total_removed: number
  total_upserted: number
  total_inserted: number
  total_updated: number
  total_ex: number
}

/**
 * Invokes update_tax_rates_from_payload RPC for a batch of records.
 * If statement_timeout occurs (57014), splits the batch into smaller sub-chunks recursively.
 */
async function processChunkWithTimeoutFallback(
  supabaseClient: ReturnType<typeof createClient>,
  chunk: Record<string, unknown>[],
  chapters: string[],
  subChunkSize = 500,
): Promise<{ ok: true; counters: ChunkCounters } | { ok: false; error: any }> {
  try {
    const { data, error } = await supabaseClient.rpc('update_tax_rates_from_payload', {
      p_records: chunk,
      p_chapters: chapters,
    })

    if (error) {
      if (isStatementTimeout(error) && chunk.length > subChunkSize) {
        console.warn(
          `[WARN] Statement timeout no chunk de ${chunk.length} registros. Dividindo em sub-chunks de até ${subChunkSize}...`,
        )
        const subCounters: ChunkCounters = {
          total_removed: 0,
          total_upserted: 0,
          total_inserted: 0,
          total_updated: 0,
          total_ex: 0,
        }

        for (let j = 0; j < chunk.length; j += subChunkSize) {
          const subChunk = chunk.slice(j, j + subChunkSize)
          const subRes = await processChunkWithTimeoutFallback(
            supabaseClient,
            subChunk,
            chapters,
            Math.max(100, Math.floor(subChunkSize / 2)),
          )
          if (!subRes.ok) {
            return subRes
          }
          subCounters.total_removed += subRes.counters.total_removed
          subCounters.total_upserted += subRes.counters.total_upserted
          subCounters.total_inserted += subRes.counters.total_inserted
          subCounters.total_updated += subRes.counters.total_updated
          subCounters.total_ex = subRes.counters.total_ex // total_ex is the current total of ex rows in chapter
        }

        return { ok: true, counters: subCounters }
      }

      return { ok: false, error }
    }

    const res = (data || {}) as Record<string, unknown>
    return {
      ok: true,
      counters: {
        total_removed: Number(res.total_removed ?? 0),
        total_upserted: Number(res.total_upserted ?? 0),
        total_inserted: Number(res.total_inserted ?? 0),
        total_updated: Number(res.total_updated ?? 0),
        total_ex: Number(res.total_ex ?? 0),
      },
    }
  } catch (err: any) {
    if (isStatementTimeout(err) && chunk.length > subChunkSize) {
      console.warn(
        `[WARN] Statement timeout capturado no catch (chunk: ${chunk.length}). Dividindo em sub-chunks...`,
      )
      const subCounters: ChunkCounters = {
        total_removed: 0,
        total_upserted: 0,
        total_inserted: 0,
        total_updated: 0,
        total_ex: 0,
      }

      for (let j = 0; j < chunk.length; j += subChunkSize) {
        const subChunk = chunk.slice(j, j + subChunkSize)
        const subRes = await processChunkWithTimeoutFallback(
          supabaseClient,
          subChunk,
          chapters,
          Math.max(100, Math.floor(subChunkSize / 2)),
        )
        if (!subRes.ok) {
          return subRes
        }
        subCounters.total_removed += subRes.counters.total_removed
        subCounters.total_upserted += subRes.counters.total_upserted
        subCounters.total_inserted += subRes.counters.total_inserted
        subCounters.total_updated += subRes.counters.total_updated
        subCounters.total_ex = subRes.counters.total_ex
      }

      return { ok: true, counters: subCounters }
    }

    return { ok: false, error: err }
  }
}

/**
 * Runs the selective chapter-based update in chunks of at most 2,000 records.
 * Bypasses any full-payload attempt to avoid Edge Function 30s wall-clock timeouts.
 */
async function runChapterUpdate(
  supabaseClient: ReturnType<typeof createClient>,
  records: PayloadRecord[],
  chapters: string[],
): Promise<Response> {
  // Filtra os registros pelo capítulo (dois primeiros dígitos do NCM) antes
  // de normalizar e chamar a RPC, evitando enviar os ~29.898 itens quando
  // apenas alguns capítulos foram selecionados.
  const chapterSet = new Set(chapters)
  const filtered = records.filter((r) => chapterSet.has(r.ncm.slice(0, 2)))
  console.log(
    `[INFO] Filtro por capítulos ${JSON.stringify(chapters)}: ${filtered.length} de ${records.length} registros selecionados.`,
  )

  // Normalize ex: NULL → "" for the JSONB passed to the RPC (the RPC maps
  // empty string back to NULL).
  const normalized = filtered.map((r) => ({
    ...r,
    descricao: r.descricao ?? r.ncm_descricao ?? '',
    ex: r.ex ?? '',
    ex_descricao: r.ex_descricao ?? '',
    ex_regime: r.ex_regime ?? '',
    ex_resolucao: r.ex_resolucao ?? '',
    ex_data_inicio: r.ex_data_inicio ?? '',
    ex_data_fim: r.ex_data_fim ?? '',
    ii_ex: r.ex ? (r.ii_ex ?? 0) : null,
    ipi_base: r.ipi_base ?? r.ipi_rate ?? 0,
    ipi_ex: r.ipi_ex ?? null,
    ipi_ex_codigo: r.ipi_ex_codigo ?? '',
    ipi_ex_descricao: r.ipi_ex_descricao ?? '',
    ipi_ex_regime: r.ipi_ex_regime ?? '',
    ipi_ex_resolucao: r.ipi_ex_resolucao ?? '',
    ipi_ex_data_inicio: r.ipi_ex_data_inicio ?? '',
    ipi_ex_data_fim: r.ipi_ex_data_fim ?? '',
  }))

  const warnings: string[] = []
  const CHUNK_SIZE = 2000

  const totalChunks = Math.ceil(normalized.length / CHUNK_SIZE) || 1
  if (totalChunks > 1) {
    warnings.push(
      `Processamento realizado em ${totalChunks} chunks de até ${CHUNK_SIZE} registros para evitar timeout.`,
    )
  } else {
    warnings.push(`Processamento realizado em chunk direto (máx ${CHUNK_SIZE} registros).`)
  }

  const totals: ChunkCounters = {
    total_removed: 0,
    total_upserted: 0,
    total_inserted: 0,
    total_updated: 0,
    total_ex: 0,
  }

  if (normalized.length === 0) {
    // Caso não haja registros filtrados para os capítulos informados, executa uma chamada
    // com array vazio para limpar os capítulos se aplicável e retornar os contadores zerados.
    const emptyRes = await processChunkWithTimeoutFallback(supabaseClient, [], chapters)
    if (!emptyRes.ok) {
      return jsonError(
        `Erro ao aplicar atualização seletiva: ${emptyRes.error?.message || JSON.stringify(emptyRes.error)}`,
        500,
        { warnings },
      )
    }
    return jsonOk({
      ...emptyRes.counters,
      chapters,
      warnings,
    })
  }

  for (let i = 0; i < normalized.length; i += CHUNK_SIZE) {
    const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1
    const chunk = normalized.slice(i, i + CHUNK_SIZE)
    console.log(
      `[INFO] Processando chunk ${chunkIndex}/${totalChunks} (${chunk.length} registros)...`,
    )

    const chunkRes = await processChunkWithTimeoutFallback(supabaseClient, chunk, chapters)
    if (!chunkRes.ok) {
      const errMsg = chunkRes.error?.message || JSON.stringify(chunkRes.error)
      console.error(`[ERROR] Falha no chunk ${chunkIndex}/${totalChunks}:`, errMsg)
      return jsonError(
        `Erro ao aplicar atualização seletiva no chunk ${chunkIndex}/${totalChunks}: ${errMsg}`,
        500,
        { warnings },
      )
    }

    totals.total_removed += chunkRes.counters.total_removed
    totals.total_upserted += chunkRes.counters.total_upserted
    totals.total_inserted += chunkRes.counters.total_inserted
    totals.total_updated += chunkRes.counters.total_updated
    totals.total_ex = chunkRes.counters.total_ex
  }

  return jsonOk({
    ...totals,
    chapters,
    warnings,
  })
}

// ---------------------------------------------------------------------------
// Existing TTCE-based parsing (single / batch modes) — unchanged
// ---------------------------------------------------------------------------

function parseExTarifariosFromTTCE(rawData: any, ncm: string): ParsedExTarifario[] {
  const out: ParsedExTarifario[] = []
  const seen = new Set<string>()

  const normEx = (v: any): string | null => {
    if (v === null || v === undefined) return null
    const s = String(v).replace(/\D/g, '')
    if (s === '') return null
    return s.padStart(3, '0')
  }

  const normDate = (v: any): string | null => {
    if (v === null || v === undefined || v === '') return null
    if (typeof v === 'number') {
      const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000)
      if (isNaN(d.getTime())) return null
      return d.toISOString().slice(0, 10)
    }
    const s = String(v).trim()
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    return null
  }

  const pushEx = (e: any) => {
    const ex = normEx(e?.ex ?? e?.exTarifario ?? e?.codigoEx ?? e?.numeroEx)
    if (!ex || seen.has(ex)) return
    seen.add(ex)

    const descricaoRaw =
      e?.descricao ?? e?.descricaodoEx ?? e?.descricaoEx ?? e?.descricaoMercadoria ?? null
    const descricao =
      descricaoRaw !== null && descricaoRaw !== undefined ? String(descricaoRaw).trim() : ''
    if (!descricao) {
      console.warn(
        `[WARN] NCM ${ncm} ex ${ex}: ex_descricao indisponível no payload TTCE — armazenando NULL.`,
      )
    }

    const regimeRaw = e?.tipo ?? e?.regime ?? e?.categoria ?? e?.tipoEx ?? null
    const regime =
      regimeRaw !== null && regimeRaw !== undefined
        ? String(regimeRaw)
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
        : null

    const resolucaoRaw =
      e?.resolucao ?? e?.ato ?? e?.resolucaoCamex ?? e?.resolucaoGelex ?? e?.numeroResolucao ?? null
    const resolucao =
      resolucaoRaw !== null && resolucaoRaw !== undefined ? String(resolucaoRaw).trim() : null

    const dataInicio = normDate(e?.dataInicio ?? e?.inicioVigencia ?? e?.data_inicio ?? e?.inicio)
    const dataFim = normDate(e?.dataFim ?? e?.fimVigencia ?? e?.data_fim ?? e?.fim)

    let ii_ex = 0
    const aliq = e?.aliquota ?? e?.iiEfetivo ?? e?.ii_efetivo ?? e?.aliquotaII
    if (aliq !== null && aliq !== undefined) {
      const n = Number(aliq)
      if (!isNaN(n) && n >= 0) ii_ex = n
    }

    out.push({
      ex,
      ex_descricao: descricao || null,
      ex_regime: regime || null,
      ex_resolucao: resolucao,
      ex_data_inicio: dataInicio,
      ex_data_fim: dataFim,
      ii_ex,
    })
  }

  const exArr = rawData?.exTarifarios ?? rawData?.exTarifario
  if (Array.isArray(exArr)) {
    for (const e of exArr) pushEx(e)
  } else if (exArr && typeof exArr === 'object') {
    pushEx(exArr)
  }

  const ttArray = rawData?.tratamentosTributarios
  if (Array.isArray(ttArray)) {
    for (const item of ttArray) {
      const exRef = item?.ex ?? item?.exTarifario ?? item?.codigoEx
      if (exRef !== null && exRef !== undefined && normEx(exRef)) {
        pushEx(item)
      }
    }
  }

  return out
}

function normalizeNcm(ncm: string): string {
  return ncm.replace(/\D/g, '').substring(0, 8)
}

function extractRate(text: string, patterns: RegExp[]): number | null {
  if (!text) return null
  const lower = text.toLowerCase()
  for (const p of patterns) {
    const m = lower.match(p)
    if (m && m[1]) {
      const v = parseFloat(m[1].replace(',', '.'))
      if (!isNaN(v) && v >= 0 && v <= 500) return v
    }
  }
  return null
}

function detectExTarifario(text: string): boolean {
  if (!text) return false
  const l = text.toLowerCase()
  return l.includes('ex-tarif') || l.includes('ex tarifa') || l.includes('extarif')
}

function parseTaxRates(rawData: any): ParsedTaxRates {
  const legal_basis: Record<string, string> = {}
  let ii_rate: number | null = null
  let ipi_rate: number | null = null
  let pis_rate: number | null = null
  let cofins_rate: number | null = null
  let has_ex_tarifario = false

  const ttArray = rawData?.tratamentosTributarios
  if (Array.isArray(ttArray)) {
    for (const item of ttArray) {
      const imp = String(item.imposto || item.tipo || '').toUpperCase()
      const aliq = Number(item.aliquota)
      if (isNaN(aliq)) continue
      if (imp === 'II' || imp.includes('IMPORTACAO')) ii_rate = aliq
      else if (imp === 'IPI' || imp.includes('PRODUTO')) ipi_rate = aliq
      else if (imp === 'PIS') pis_rate = aliq
      else if (imp === 'COFINS') cofins_rate = aliq
      if (item.fundamentoLegal) legal_basis[imp.toLowerCase()] = String(item.fundamentoLegal)
    }
    has_ex_tarifario = detectExTarifario(JSON.stringify(ttArray))
  } else {
    const tt = rawData?.tratamentosTributarios || rawData?.tratamentoTributario
    if (tt && typeof tt === 'object') {
      if (tt.ii?.aliquota !== undefined) ii_rate = Number(tt.ii.aliquota)
      if (tt.ipi?.aliquota !== undefined) ipi_rate = Number(tt.ipi.aliquota)
      if (tt.pis?.aliquota !== undefined) pis_rate = Number(tt.pis.aliquota)
      if (tt.cofins?.aliquota !== undefined) cofins_rate = Number(tt.cofins.aliquota)
      if (ii_rate === null && tt.impostoImportacao?.aliquota !== undefined) {
        ii_rate = Number(tt.impostoImportacao.aliquota)
      }
      if (ipi_rate === null && tt.impostoProdutosIndustrializados?.aliquota !== undefined) {
        ipi_rate = Number(tt.impostoProdutosIndustrializados.aliquota)
      }
      if (tt.ii?.fundamentoLegal) legal_basis.ii = String(tt.ii.fundamentoLegal)
      if (tt.ipi?.fundamentoLegal) legal_basis.ipi = String(tt.ipi.fundamentoLegal)
      if (tt.pis?.fundamentoLegal) legal_basis.pis = String(tt.pis.fundamentoLegal)
      if (tt.cofins?.fundamentoLegal) legal_basis.cofins = String(tt.cofins.fundamentoLegal)
      has_ex_tarifario = detectExTarifario(JSON.stringify(tt))
    }
  }

  if (rawData?.exTarifario || rawData?.exTarifarios) {
    has_ex_tarifario = true
  }

  const flText = rawData?.fundamentosLegais || rawData?.fundamentoLegal || JSON.stringify(rawData)
  if (ii_rate === null) {
    ii_rate = extractRate(flText, [
      /(?:ii|imposto\s+de\s+importa[çc][ãa]o)\s*:?\s*(\d+[,.]?\d*)\s*%/i,
    ])
  }
  if (ipi_rate === null) {
    ipi_rate = extractRate(flText, [/(?:ipi)\s*:?\s*(\d+[,.]?\d*)\s*%/i])
  }
  if (pis_rate === null) {
    pis_rate = extractRate(flText, [/(?:pis)\s*:?\s*(\d+[,.]?\d*)\s*%/i])
  }
  if (cofins_rate === null) {
    cofins_rate = extractRate(flText, [/(?:cofins)\s*:?\s*(\d+[,.]?\d*)\s*%/i])
  }

  if (pis_rate === null) pis_rate = 2.1
  if (cofins_rate === null) cofins_rate = 9.65

  return {
    ii_rate: ii_rate ?? 0,
    ipi_rate: ipi_rate ?? 0,
    pis_rate,
    cofins_rate,
    has_ex_tarifario,
    legal_basis,
  }
}

// ---------------------------------------------------------------------------
// Request handler
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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    let userId: string | null = null
    const authHeader = req.headers.get('Authorization')
    if (authHeader && anonKey) {
      try {
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        })
        const { data: userData } = await userClient.auth.getUser()
        userId = userData.user?.id ?? null
      } catch {
        // Continue without user ID
      }
    }

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey)

    // =====================================================================
    // CHAPTERS flow — selective update from the latest uploaded payload.
    // No retry needed: storage + RPC are local. 404/400 are terminal.
    // =====================================================================
    if (body && Array.isArray(body.chapters)) {
      const chaptersRaw: unknown[] = body.chapters
      // Default to '85' and '90' when the array is empty.
      const chapters: string[] =
        chaptersRaw.length === 0
          ? ['85', '90']
          : (chaptersRaw.filter(isTwoDigitChapter) as string[])

      if (chaptersRaw.length > 0 && chapters.length !== chaptersRaw.length) {
        return jsonError(
          'Capítulos inválidos: cada capítulo deve ter exatamente dois dígitos.',
          400,
          { recebidos: chaptersRaw },
        )
      }

      const payload = await readLatestPayload(supabaseClient)
      if (!payload.ok) return payload.resp

      return await runChapterUpdate(supabaseClient, payload.records, chapters)
    }

    // =====================================================================
    // Legacy single / batch flow (unchanged) — TTCE per NCM with mTLS.
    // Retry 503 with backoff 2s/4s/8s, max 3; no retry on 400/401/404.
    // =====================================================================
    const { mode, ncm: singleNcm } = body

    let ncms: string[] = []

    if (mode === 'single' && singleNcm) {
      ncms = [normalizeNcm(singleNcm)]
    } else {
      const { data: moduleProducts } = await supabaseClient
        .from('imp_sim_products')
        .select('ncm')
        .not('ncm', 'is', null)
        .neq('ncm', '')

      const { data: siteProducts } = await supabaseClient
        .from('products')
        .select('ncm')
        .not('ncm', 'is', null)
        .neq('ncm', '')

      const ncmSet = new Set<string>()
      for (const row of [...(moduleProducts || []), ...(siteProducts || [])]) {
        const n = normalizeNcm(row.ncm || '')
        if (n.length >= 4) ncmSet.add(n)
      }
      ncms = Array.from(ncmSet)
    }

    if (ncms.length === 0) {
      return jsonOk({ results: [], message: 'Nenhum NCM encontrado para atualizar.' })
    }

    const host = getSiscomexHost()

    try {
      await authenticate(host)
    } catch (authErr: any) {
      return new Response(
        JSON.stringify({
          error: `Falha na autenticação Siscomex (mTLS): ${authErr.message}`,
          results: [],
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const results: any[] = []

    for (let i = 0; i < ncms.length; i++) {
      const ncmCode = ncms[i]

      try {
        const ttceData = await queryTTCE(ncmCode, host)

        if (!ttceData) {
          results.push({
            ncm: ncmCode,
            success: false,
            message: 'NCM não encontrado na fonte TTCE ou indisponível após retentativas.',
          })
        } else {
          const parsed = parseTaxRates(ttceData)

          const exList = parseExTarifariosFromTTCE(ttceData, ncmCode)

          const ii_base = parsed.ii_rate ?? 0

          const { error: baseUpsertError } = await supabaseClient.from('imp_sim_tax_rates').upsert(
            {
              ncm: ncmCode,
              ex: null,
              ii_rate: parsed.ii_rate,
              ipi_rate: parsed.ipi_rate,
              pis_rate: parsed.pis_rate,
              cofins_rate: parsed.cofins_rate,
              has_ex_tarifario: parsed.has_ex_tarifario || exList.length > 0,
              legal_basis: parsed.legal_basis,
              source: 'siscomex',
              updated_by_user_id: userId,
              last_updated_at: new Date().toISOString(),
              ex_descricao: null,
              ex_regime: null,
              ex_resolucao: null,
              ex_data_inicio: null,
              ex_data_fim: null,
              ii_base,
              ii_ex: null,
            },
            { onConflict: 'ncm,ex' },
          )

          if (baseUpsertError) {
            results.push({
              ncm: ncmCode,
              success: false,
              message: `Erro ao salvar registro base: ${baseUpsertError.message}`,
            })
            continue
          }

          let exFailures = 0
          for (const ex of exList) {
            const { error: exUpsertError } = await supabaseClient.from('imp_sim_tax_rates').upsert(
              {
                ncm: ncmCode,
                ex: ex.ex,
                ii_rate: parsed.ii_rate,
                ipi_rate: parsed.ipi_rate,
                pis_rate: parsed.pis_rate,
                cofins_rate: parsed.cofins_rate,
                has_ex_tarifario: true,
                legal_basis: parsed.legal_basis,
                source: 'siscomex',
                updated_by_user_id: userId,
                last_updated_at: new Date().toISOString(),
                ex_descricao: ex.ex_descricao,
                ex_regime: ex.ex_regime,
                ex_resolucao: ex.ex_resolucao,
                ex_data_inicio: ex.ex_data_inicio,
                ex_data_fim: ex.ex_data_fim,
                ii_base,
                ii_ex: ex.ii_ex,
              },
              { onConflict: 'ncm,ex' },
            )

            if (exUpsertError) {
              exFailures++
              console.warn(
                `[WARN] NCM ${ncmCode} ex ${ex.ex}: falha ao persistir — ${exUpsertError.message}`,
              )
            }
          }

          if (exFailures > 0) {
            results.push({
              ncm: ncmCode,
              success: false,
              message: `Registro base salvo, mas ${exFailures} de ${exList.length} ex-tarifário(s) falharam.`,
              data: parsed,
            })
          } else {
            results.push({
              ncm: ncmCode,
              success: true,
              message:
                exList.length > 0
                  ? `Atualizado com ${exList.length} ex-tarifário(s).`
                  : parsed.has_ex_tarifario
                    ? 'Atualizado com Ex-Tarifário detectado.'
                    : 'Atualizado com sucesso.',
              data: parsed,
            })
          }
        }
      } catch (err: any) {
        results.push({
          ncm: ncmCode,
          success: false,
          message: `Erro: ${err.message || 'Erro desconhecido'}`,
        })
      }

      if (i < ncms.length - 1) {
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS))
      }
    }

    const successCount = results.filter((r) => r.success).length
    const failCount = results.length - successCount

    if (mode === 'single') {
      return jsonOk({
        result: results[0] || { ncm: singleNcm, success: false, message: 'Nenhum resultado.' },
      })
    }

    return jsonOk({
      results,
      summary: { total: results.length, success: successCount, failed: failCount },
    })
  } catch (error: any) {
    console.error('Unhandled error in update-tax-rates:', error)
    return new Response(JSON.stringify({ error: error.message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
