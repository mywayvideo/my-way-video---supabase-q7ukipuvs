import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * sync-ncm-support-vigencia
 * Rotina periódica (cron semanal / sob demanda) que:
 * 1. Baixa o JSON oficial da Nomenclatura Comum do Mercosul do Siscomex
 *    (https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO)
 *    e verifica cada ncm_principal ativo em public.ncm_support:
 *    se não constar mais na nomenclatura vigente, marca status='em_revisao' (NUNCA apaga)
 *    e anota a data na coluna fonte/alertas.
 * 2. Verifica ex_data_fim vencido dos Ex referenciados nas alternativas em imp_sim_tax_rates,
 *    sinalizando no campo alertas.
 * 3. Analisa imp_sim_ncm_classification_log em busca de padrões (NCMs repetidamente rejeitados/corrigidos
 *    manualmente) e gera um resumo de candidatos a novas regras/alertas.
 */

interface NcmSupportRow {
  id: string
  familia: string
  categoria: string | null
  palavras_chave: string[]
  ncm_principal: string
  ncm_alternativas: Array<{ ncm: string; quando?: string; rgi?: string; observacao?: string }>
  regra_desempate: string | null
  dicas: string | null
  alertas: string | null
  fonte: string | null
  status: 'ativa' | 'extinta' | 'em_revisao'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const reqUrl = new URL(req.url)
  if (req.method === 'GET' && reqUrl.searchParams.get('health') === 'true') {
    return new Response(
      JSON.stringify({
        status: 'ok',
        function: 'sync-ncm-support-vigencia',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || ''

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Configuração de ambiente Supabase ausente.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  try {
    const report: {
      timestamp: string
      active_rows_checked: number
      siscomex_download_status: string
      ncms_marked_em_revisao: Array<{ id: string; familia: string; ncm: string }>
      expired_ex_alerts: Array<{
        id: string
        familia: string
        ncm: string
        ex: string
        data_fim: string
      }>
      frequent_corrections_candidates: Array<{
        ncm: string
        count: number
        sample_descriptions: string[]
      }>
    } = {
      timestamp: new Date().toISOString(),
      active_rows_checked: 0,
      siscomex_download_status: 'skipped',
      ncms_marked_em_revisao: [],
      expired_ex_alerts: [],
      frequent_corrections_candidates: [],
    }

    // 1. Carregar todas as famílias de ncm_support
    const { data: supportRows, error: fetchErr } = await supabaseAdmin
      .from('ncm_support')
      .select('*')

    if (fetchErr || !supportRows) {
      throw new Error(`Erro ao ler ncm_support: ${fetchErr?.message}`)
    }

    report.active_rows_checked = supportRows.filter((r) => r.status === 'ativa').length

    // 2. Tentar baixar a tabela oficial do Siscomex
    const siscomexValidNcms = new Set<string>()
    try {
      const siscomexUrl =
        'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO'
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20000)

      const resp = await fetch(siscomexUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MyWayNcmBot/1.0)',
          Accept: 'application/json',
        },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (resp.ok) {
        const jsonData = await resp.json()
        // O JSON do Siscomex contém lista de itens com 'Codigo' ou 'codigo'
        const items = Array.isArray(jsonData)
          ? jsonData
          : jsonData.nomenclaturas || jsonData.itens || []

        for (const item of items) {
          const rawCode = String(item.Codigo || item.codigo || item.ncm || '').replace(/\D/g, '')
          if (rawCode.length === 8) {
            siscomexValidNcms.add(rawCode)
          }
        }
        report.siscomex_download_status = `sucesso (${siscomexValidNcms.size} códigos vigentes extraídos)`
      } else {
        report.siscomex_download_status = `falha HTTP ${resp.status} - utilizando fallback de validação interna`
      }
    } catch (sisErr: any) {
      report.siscomex_download_status = `indisponível (${sisErr?.message || String(sisErr)}) - validação secundária via imp_sim_tax_rates`
    }

    // Validação de ncm_principal com Siscomex (ou imp_sim_tax_rates se Siscomex estiver fora)
    for (const row of supportRows as NcmSupportRow[]) {
      if (row.status !== 'ativa') continue

      const cleanNcm = (row.ncm_principal || '').replace(/\D/g, '')
      let isStillValid = false

      if (siscomexValidNcms.size > 0) {
        isStillValid = siscomexValidNcms.has(cleanNcm)
      } else {
        // Fallback: verificar se existe ativo em imp_sim_tax_rates
        const { count } = await supabaseAdmin
          .from('imp_sim_tax_rates')
          .select('id', { count: 'exact', head: true })
          .eq('ncm', cleanNcm)
        isStillValid = (count ?? 0) > 0
      }

      if (!isStillValid) {
        const todayStr = new Date().toISOString().split('T')[0]
        const updatedAlertas = row.alertas
          ? `${row.alertas} | NCM ${cleanNcm} não localizado na nomenclatura oficial vigente Siscomex em ${todayStr}`
          : `NCM ${cleanNcm} não localizado na nomenclatura oficial vigente Siscomex em ${todayStr}`

        const updatedFonte = row.fonte
          ? `${row.fonte} (revisão de vigência Siscomex ${todayStr})`
          : `Revisão de vigência Siscomex ${todayStr}`

        await supabaseAdmin
          .from('ncm_support')
          .update({
            status: 'em_revisao',
            alertas: updatedAlertas,
            fonte: updatedFonte,
          })
          .eq('id', row.id)

        report.ncms_marked_em_revisao.push({
          id: row.id,
          familia: row.familia,
          ncm: cleanNcm,
        })
      }
    }

    // 3. Verificar ex_data_fim vencido dos Ex referenciados nas alternativas
    const today = new Date().toISOString().split('T')[0]
    for (const row of supportRows as NcmSupportRow[]) {
      const alts = Array.isArray(row.ncm_alternativas) ? row.ncm_alternativas : []
      for (const alt of alts) {
        // Se a observação ou a condição citar um Ex, verificar na base
        const exMatch = (alt.quando || alt.observacao || '').match(/\bEx\s*(\d{1,4})\b/i)
        if (exMatch && alt.ncm) {
          const exNum = exMatch[1].padStart(3, '0')
          const cleanNcm = alt.ncm.replace(/\D/g, '')
          const { data: exRow } = await supabaseAdmin
            .from('imp_sim_tax_rates')
            .select('ex, ex_data_fim')
            .eq('ncm', cleanNcm)
            .eq('ex', exNum)
            .maybeSingle()

          if (exRow && exRow.ex_data_fim && exRow.ex_data_fim < today) {
            report.expired_ex_alerts.push({
              id: row.id,
              familia: row.familia,
              ncm: cleanNcm,
              ex: exNum,
              data_fim: exRow.ex_data_fim,
            })

            const warnText = `[Atenção] Ex ${exNum} da NCM ${cleanNcm} venceu em ${exRow.ex_data_fim}.`
            if (!row.alertas || !row.alertas.includes(warnText)) {
              const newAlerts = row.alertas ? `${row.alertas} | ${warnText}` : warnText
              await supabaseAdmin
                .from('ncm_support')
                .update({ alertas: newAlerts })
                .eq('id', row.id)
            }
          }
        }
      }
    }

    // 4. Consultar imp_sim_ncm_classification_log por padrões de rejeição / correção manual frequente
    // Buscar últimos 200 logs onde status = 'corrigido' ou final_choice_ncm difere de agent_suggestion->recommendation->ncm
    try {
      const { data: logRows } = await supabaseAdmin
        .from('imp_sim_ncm_classification_log')
        .select('id, input_description, final_choice_ncm, agent_suggestion, status')
        .or('status.eq.corrigido,status.eq.aprovado')
        .order('created_at', { ascending: false })
        .limit(200)

      if (logRows && logRows.length > 0) {
        const divergenceCounts = new Map<string, { count: number; samples: string[] }>()

        for (const log of logRows) {
          const suggestedNcm = log.agent_suggestion?.recommendation?.ncm
          const chosenNcm = log.final_choice_ncm

          if (suggestedNcm && chosenNcm && suggestedNcm !== chosenNcm) {
            const key = `De ${suggestedNcm} para ${chosenNcm}`
            const current = divergenceCounts.get(key) || { count: 0, samples: [] }
            current.count += 1
            if (current.samples.length < 3 && log.input_description) {
              current.samples.push(log.input_description.slice(0, 100))
            }
            divergenceCounts.set(key, current)
          }
        }

        for (const [key, val] of divergenceCounts.entries()) {
          if (val.count >= 2) {
            report.frequent_corrections_candidates.push({
              ncm: key,
              count: val.count,
              sample_descriptions: val.samples,
            })
          }
        }
      }
    } catch (logScanErr) {
      console.warn('Erro ao varrer logs de classificação (não fatal):', logScanErr)
    }

    return new Response(
      JSON.stringify({
        success: true,
        report,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('Erro ao executar sync-ncm-support-vigencia:', err)
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || String(err),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
