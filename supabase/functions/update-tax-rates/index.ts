import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { queryTTCE, authenticate, getSiscomexHost } from '../_shared/siscomex-client.ts'

const REQUEST_DELAY_MS = 1500

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
