import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SISCOMEX_API = 'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura'
const REQUEST_DELAY_MS = 1500
const MAX_RETRIES = 2

interface ParsedTaxRates {
  ii_rate: number
  ipi_rate: number
  pis_rate: number
  cofins_rate: number
  has_ex_tarifario: boolean
  legal_basis: Record<string, string>
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

  if (rawData?.tratamentoTributario) {
    const tt = rawData.tratamentoTributario
    if (tt.ii?.aliquota !== undefined) ii_rate = Number(tt.ii.aliquota)
    if (tt.ipi?.aliquota !== undefined) ipi_rate = Number(tt.ipi.aliquota)
    if (tt.pis?.aliquota !== undefined) pis_rate = Number(tt.pis.aliquota)
    if (tt.cofins?.aliquota !== undefined) cofins_rate = Number(tt.cofins.aliquota)
    if (tt.ii?.fundamentoLegal) legal_basis.ii = String(tt.ii.fundamentoLegal)
    if (tt.ipi?.fundamentoLegal) legal_basis.ipi = String(tt.ipi.fundamentoLegal)
    if (tt.pis?.fundamentoLegal) legal_basis.pis = String(tt.pis.fundamentoLegal)
    if (tt.cofins?.fundamentoLegal) legal_basis.cofins = String(tt.cofins.fundamentoLegal)
    has_ex_tarifario = detectExTarifario(JSON.stringify(tt))
  }

  const flText = rawData?.fundamentosLegais || rawData?.fundamentoLegal || ''
  if (flText) {
    legal_basis.raw = String(flText)
    has_ex_tarifario = has_ex_tarifario || detectExTarifario(flText)
  }

  if (ii_rate === null) {
    ii_rate = extractRate(flText, [
      /(?:imposto\s+de\s+importa[çc][ãa]o|ii)\s*:?\s*(\d+[,.]?\d*)\s*%/i,
      /(?:al[ií]quota)\s+(?:do\s+)?(?:imposto\s+de\s+importa[çc][ãa]o)\s*:?\s*(\d+[,.]?\d*)/i,
    ])
  }
  if (ipi_rate === null) {
    ipi_rate = extractRate(flText, [
      /(?:ipi|imposto\s+sobre\s+produtos\s+industrializados)\s*:?\s*(\d+[,.]?\d*)\s*%/i,
      /(?:al[ií]quota)\s+(?:do\s+)?(?:ipi)\s*:?\s*(\d+[,.]?\d*)/i,
    ])
  }
  if (pis_rate === null) {
    pis_rate = extractRate(flText, [
      /(?:pis)\s*:?\s*(\d+[,.]?\d*)\s*%/i,
      /(?:al[ií]quota)\s+(?:do\s+)?(?:pis)\s*:?\s*(\d+[,.]?\d*)/i,
    ])
  }
  if (cofins_rate === null) {
    cofins_rate = extractRate(flText, [
      /(?:cofins)\s*:?\s*(\d+[,.]?\d*)\s*%/i,
      /(?:al[ií]quota)\s+(?:do\s+)?(?:cofins)\s*:?\s*(\d+[,.]?\d*)/i,
    ])
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

async function fetchNcmFromSiscomex(ncm: string): Promise<any | null> {
  const normalized = normalizeNcm(ncm)
  if (!normalized) return null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      const res = await fetch(`${SISCOMEX_API}/busca-por-codigo?codigo=${normalized}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'SimuImport/1.0',
        },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) return data[0]
        if (!Array.isArray(data)) return data
        return null
      }

      if (res.status === 429 || res.status === 503) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, (attempt + 1) * 3000))
          continue
        }
      }
      return null
    } catch {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 2000))
        continue
      }
      return null
    }
  }
  return null
}

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
    const { mode, ncm: singleNcm } = body

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
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
      return new Response(
        JSON.stringify({ results: [], message: 'Nenhum NCM encontrado para atualizar.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const results: any[] = []

    for (let i = 0; i < ncms.length; i++) {
      const ncmCode = ncms[i]

      try {
        const siscomexData = await fetchNcmFromSiscomex(ncmCode)

        if (!siscomexData) {
          results.push({
            ncm: ncmCode,
            success: false,
            message: 'NCM nao encontrado na fonte Siscomex ou fonte indisponivel.',
          })
        } else {
          const parsed = parseTaxRates(siscomexData)

          const { error: upsertError } = await supabaseClient.from('imp_sim_tax_rates').upsert({
            ncm: ncmCode,
            ii_rate: parsed.ii_rate,
            ipi_rate: parsed.ipi_rate,
            pis_rate: parsed.pis_rate,
            cofins_rate: parsed.cofins_rate,
            has_ex_tarifario: parsed.has_ex_tarifario,
            legal_basis: parsed.legal_basis,
            source: 'siscomex',
            updated_by_user_id: userId,
            last_updated_at: new Date().toISOString(),
          })

          if (upsertError) {
            results.push({
              ncm: ncmCode,
              success: false,
              message: `Erro ao salvar: ${upsertError.message}`,
            })
          } else {
            results.push({
              ncm: ncmCode,
              success: true,
              message: parsed.has_ex_tarifario
                ? 'Atualizado com Ex-Tarifario detectado.'
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
      return new Response(
        JSON.stringify({
          result: results[0] || { ncm: singleNcm, success: false, message: 'Nenhum resultado.' },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        results,
        summary: { total: results.length, success: successCount, failed: failCount },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Unhandled error in update-tax-rates:', error)
    return new Response(JSON.stringify({ error: error.message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
