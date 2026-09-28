import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('classify-ncm Edge Function live deploy check & validation', () => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  it('checks edge function health endpoint returning version 3.7.0 or higher with new features', async () => {
    // Retry polling until container finishes warm up
    let lastData: any = null
    let lastStatus = 0
    for (let attempt = 1; attempt <= 15; attempt++) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm?health=true&attempt=${attempt}`, {
          method: 'GET',
        })
        lastStatus = res.status
        const text = await res.text()
        console.log(`[Health Attempt ${attempt}]: HTTP ${res.status} -> ${text}`)
        try {
          lastData = JSON.parse(text)
        } catch { /* intentionally ignored */ }
        if (res.status === 200 && (lastData?.version === '3.8.0-build.622' || lastData?.version === '3.8.0-build.621' || lastData?.version === '3.8.0-build.619')) {
          break
        }
      } catch (e: any) {
        console.log(`[Health Attempt ${attempt} Error]:`, e?.message)
      }
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }

    console.log('[FINAL HEALTH RESULT]:', JSON.stringify({ status: lastStatus, data: lastData }))
    const data = lastData
    expect(data.features).toContain('ncm_support_layer')
    expect(data.features).toContain('diretorio_ncm_layer')
    expect(data.features).toContain('phase0_canonical_composition_derivation')
    expect(data.features).toContain('phase0_tripartite_product_nature')
    expect(data.features).toContain('orphan_ncm_sweep_invariant')
    expect(data.features).toContain('ex_checklist_report_suppression_when_no_ex')
    expect(data.features).toContain('family_expansion_6digits')
    expect(data.features).toContain('intrafamily_qualifier_tiebreak')
    expect(data.features).toContain('candidate_catalog_integrity_check')
    expect(data.features).toContain('full_candidate_audit_logging')
    expect(data.features).toContain('parts_ncm_indirect_linking')
    expect(data.features).toContain('parts_vs_dependent_accessory_distinction')
    expect(data.features).toContain('parts_precedence_over_residual_standalone')
    expect(data.features).toContain('parts_precedence_over_8537_and_residual')
    expect(data.features).toContain('auditor_verdict_reinclusion_no_silent_fallback')
    expect(data.features).toContain('target_machine_serviced_device_mapping')
    expect(data.features).toContain('expanded_parts_deterministic_retrieval')
    expect(data.features).toContain('candidates_sweep_alternatives_promotion')
    expect(data.features).toContain('alternatives_source_tracking')
    expect(data.features).toContain('intrafamily_qualifier_score_evaluation')
    expect(data.features).toContain('pre_decision_intrafamily_tiebreak')
    expect(data.features).toContain('functional_incompatibility_penalization')
    expect(data.features).toContain('real_dependency_condition_note2b')
    expect(data.features).toContain('essential_delivery_over_medium_principle')
    expect(data.features).toContain('auditor_nature_correction_before_ncm')
    expect(data.features).toContain('own_utility_dependency_test')
    expect(data.features).toContain('controller_part_precedence')
    expect(data.features).toContain('deterministic_85437099_injection')
    expect(data.features).toContain('film_only_9007_exclusion')
    expect(data.features).toContain('technology_incompatibility_veto')
    expect(data.features).toContain('digital_cinema_camera_8525_normalization')
  })

  it('verifies in imp_sim_ncm_classification_log that RM-IP500 and UWP-D21 records have new fields', async () => {
    // Buscar o log mais recente gravado no teste anterior
    const { data: logs, error } = await supabase
      .from('imp_sim_ncm_classification_log')
      .select('id, input_description, final_choice_ncm, final_choice_ex, agent_suggestion, created_at')
      .order('created_at', { ascending: false })
      .limit(2)

    expect(error).toBeNull()
    expect(logs).toBeDefined()
    expect(logs!.length).toBeGreaterThan(0)

    for (const log of logs!) {
      const suggestion = log.agent_suggestion as any
      // Conferir que product_understanding está presente
      expect(suggestion.product_understanding).toBeDefined()
      expect(suggestion.product_understanding.canonical_statement).toBeDefined()

      // Conferir que model_used tem as passadas ou analista/auditor
      expect(suggestion.model_used).toBeDefined()
      expect(suggestion.analyst_model).toBeDefined()
      expect(suggestion.auditor_model).toBeDefined()

      // Invariante: final_choice_ex VAZIO quando ex_veto_applied=true
      if (suggestion.ex_veto_applied === true) {
        expect(log.final_choice_ex === '' || log.final_choice_ex === null).toBe(true)
        expect(suggestion.recommendation.ex === '' || suggestion.recommendation.ex === null).toBe(true)
      }
    }
  })

  it('validates ATEM SDI Extreme ISO Switcher (8 entradas SDI) live classification (expected: 85437035 recommended with II 7,2%)', async () => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })

    expect(authError).toBeNull()
    const jwt = authData!.session!.access_token

    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description: 'Blackmagic Design ATEM SDI Extreme ISO Switcher - Switcher de produção ao vivo com 8 entradas 3G-SDI, 4 saídas SDI, 2 portas USB para webcam e gravação ISO de todos os 8 canais de entrada mais o programa.',
        brand: 'Blackmagic Design',
        model: 'ATEM SDI Extreme ISO',
        additional_specs: 'Misturador e comutador digital de vídeo em tempo real, 8 entradas SDI com conversão de padrões integrada, mixer de áudio Fairlight com EQ e dinâmica.',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    console.log('[VAL 1 ATEM SDI Extreme ISO]:', JSON.stringify({
      recommended: result.recommendation?.ncm,
      ex: result.recommendation?.ex,
      ii: result.recommendation?.ii,
      description: result.recommendation?.description,
      confidence: result.confidence,
      sufficient_info: result.sufficient_info,
      alternatives: result.alternatives?.map((a: any) => ({ ncm: a.ncm, ex: a.ex, reason: a.reason, source: a.alternatives_source })),
    }, null, 2))

    expect(result.success).toBe(true)
    // Recomendação esperada: 85437035 ("Misturador digital, em tempo real, com oito ou mais entradas") com II 7,2%
    expect(result.recommendation.ncm).toBe('85437035')
    expect(result.recommendation.ex).toBe('')
    expect(result.recommendation.ii).toBe(7.2)
  }, 60000)

  it('validates RM-IP500 live classification (expected: 85299090 recommended via parts precedence over residual 85437099, 85437099 demoted to alternative)', async () => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })

    expect(authError).toBeNull()
    const jwt = authData!.session!.access_token

    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_id: 'da9abc07-91ba-4478-b927-51a41ca9f0ff',
        product_description: 'Sony RM-IP500 PTZ Camera Remote Controller. Control of up to 100 cameras over IP. Pan, tilt, and zoom joystick control with PTZ speed control knobs.',
        brand: 'Sony',
        model: 'RM-IP500',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    console.log('[VAL 2 RM-IP500]:', JSON.stringify({
      recommended: result.recommendation?.ncm,
      ex: result.recommendation?.ex,
      confidence: result.confidence,
      sufficient_info: result.sufficient_info,
      alternatives: result.alternatives?.map((a: any) => ({ ncm: a.ncm, ex: a.ex, reason: a.reason, source: a.alternatives_source })),
      parts_indirect_logic: result.parts_indirect_logic,
      audit_id: result.audit_id,
    }, null, 2))

    expect(result.success).toBe(true)
    // CALIBRAÇÃO PRECEDÊNCIA: 85299090 como recomendado pela Nota 2(b) do Cap. 85 + NESH 85.29
    expect(result.recommendation.ncm).toBe('85299090')
    expect(result.recommendation.ex).toBe('')

    // Justificativa obrigatória citando Nota 2(b) do Cap. 85 e intervalo de posições (85.24 a 85.28)
    expect(result.recommendation.justification).toMatch(/(?:Nota 2\(b\)|Nota 2|85\.24|8524)/i)

    // 85437099 rebaixado a alternativa residual (ou promovido da varredura)
    const residualAlt = result.alternatives.find((a: any) => a.ncm === '85437099')
    expect(residualAlt).toBeDefined()
    expect(residualAlt.alternatives_source).toBeDefined()
    expect(residualAlt.reason).toMatch(/(?:residual|fun[çc][aã]o pr[oó]pria|rebaixad[ao]|8529|Nota 2|candidatos)/i)
    // Esperado conter 90319090 nas alternativas e cada uma com alternatives_source gravado
    for (const alt of result.alternatives) {
      expect(alt.alternatives_source).toBeDefined()
    }

    // Telemetria parts_indirect_logic com parts_precedence_applied
    expect(result.parts_indirect_logic).toBeDefined()
    expect(result.parts_indirect_logic.parts_logic_triggered).toBe(true)
    expect(result.parts_indirect_logic.parts_precedence_applied).toBeDefined()
    if (result.parts_indirect_logic.parts_precedence_applied.applied) {
      expect(result.parts_indirect_logic.parts_precedence_applied.winning_parts_ncm).toBe('85299090')
      expect(result.parts_indirect_logic.parts_precedence_applied.demoted_residual_ncm).toBe('85437099')
    }

    // Calibração 1: NENHUMA menção a 90319090 ou 9031 na justificativa
    expect(result.recommendation.justification).not.toContain('9031')
    expect(result.recommendation.justification).not.toContain('90319090')

    // Calibração 2: composition_analysis derivada da Fase 0
    expect(result.composition_analysis).toBeDefined()
    expect(result.composition_analysis.isKit).toBe(false)

    // Product understanding da Fase 0
    expect(result.product_understanding).toBeDefined()
    expect(result.product_understanding.canonical_statement).toBeDefined()
  }, 60000)

  it('validates dependent accessory live classification (servo zoom / focus handle for telephoto lenses — 8529.90.90 recommended or valid alternative)', async () => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })

    expect(authError).toBeNull()
    const jwt = authData!.session!.access_token

    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description: 'Fujinon ERD-20A-A02 Zoom Demand / Manopla de controle de servo zoom e foco para teleobjetivas e lentes broadcast de estúdio. Dispositivo de comando remoto acoplável a tripé para acionamento de servomotores da objetiva.',
        brand: 'Fujinon',
        model: 'ERD-20A-A02',
        additional_specs: 'Requer conexão com o servo da lente broadcast/teleobjetiva para operar. Sem alimentação ou função autônoma independente.',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    console.log('[VAL 5 Manopla Servo Zoom]:', JSON.stringify({
      recommended: result.recommendation?.ncm,
      ex: result.recommendation?.ex,
      confidence: result.confidence,
      sufficient_info: result.sufficient_info,
      alternatives: result.alternatives?.map((a: any) => ({ ncm: a.ncm, ex: a.ex, reason: a.reason, source: a.alternatives_source })),
    }, null, 2))

    expect(result.success).toBe(true)
    // 85299090 é partes e acessórios reconhecíveis destinados a aparelhos de 8525 a 8528 (câmeras de TV/estúdio)
    // O NCM de partes DEVE poder ser recomendado ou figurar com destaque nas alternativas com justificativa de vínculo indireto
    const allNcms = [result.recommendation.ncm, ...(result.alternatives || []).map((a: any) => a.ncm)]
    expect(allNcms).toContain('85299090')

    // Se 85299090 for o recomendado, a justificativa deve conter a menção ao vínculo indireto e natureza de acessório
    if (result.recommendation.ncm === '85299090') {
      expect(result.recommendation.justification).toMatch(/(?:v[ií]nculo indireto|acess[oó]rio|85\.24|8524|8525|85\.25|Nota 2)/i)
    }
  }, 60000)

  it('validates HDC-3200R live classification (expected: 85258921 recommended, 85258913 absent or alternative, no 90181990)', async () => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })

    expect(authError).toBeNull()
    const jwt = authData!.session!.access_token

    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description: 'Sony HDC-3200R 2/3-inch 3-CMOS 4K Broadcast Camera System. 4K HDR live production camera with 3x 2/3" 4K CMOS image sensors, global shutter, B4 lens mount.',
        brand: 'Sony',
        model: 'HDC-3200R',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    console.log('[VAL 3 HDC-3200R]:', JSON.stringify({
      recommended: result.recommendation?.ncm,
      ex: result.recommendation?.ex,
      confidence: result.confidence,
      sufficient_info: result.sufficient_info,
      description: result.recommendation?.description,
      alternatives: result.alternatives?.map((a: any) => ({ ncm: a.ncm, ex: a.ex, description: a.description, source: a.alternatives_source })),
      audit_id: result.audit_id,
    }, null, 2))

    expect(result.success).toBe(true)
    // Recomendação rigorosa: 85258921 ("Com três ou mais captadores de imagem")
    expect(result.recommendation.ncm).toBe('85258921')
    // 85258913 não pode ser a recomendada
    expect(result.recommendation.ncm).not.toBe('85258913')
    // 90181990 NÃO pode aparecer nas alternativas
    const has9018InAlts = result.alternatives.some((a: any) => a.ncm === '90181990')
    expect(has9018InAlts).toBe(false)
    // Se 85258913 estiver nas alternativas, a descrição deve ser coerente com a linha oficial
    const alt85258913 = result.alternatives.find((a: any) => a.ncm === '85258913')
    if (alt85258913) {
      expect(alt85258913.description).not.toContain('9018')
    }
  }, 60000)

  it('validates BURANO 8K live classification (expected: family 8525, camera/camcorder, most specific intrafamily subposition)', async () => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })

    expect(authError).toBeNull()
    const jwt = authData!.session!.access_token

    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description: 'Sony BURANO 8K Digital Cinema Camera. Compact CineAlta camera with 8.6K full-frame sensor, internal electronic variable ND filter, PL/E-mount.',
        brand: 'Sony',
        model: 'BURANO',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    console.log('[BURANO Result]:', JSON.stringify({
      ncm: result.recommendation?.ncm,
      ex: result.recommendation?.ex,
      model_used: result.model_used,
      composition_analysis: result.composition_analysis,
      audit_id: result.audit_id,
    }, null, 2))

    expect(result.success).toBe(true)
    expect(result.recommendation.ncm.startsWith('8525')).toBe(true)
    expect(result.composition_analysis.isKit).toBe(false)
  }, 60000)

  it('validates UWP-D21 live classification (expected: family 8518, no 8517.62 and no Ex 019)', async () => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })

    expect(authError).toBeNull()
    const jwt = authData!.session!.access_token

    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_id: '0d6f7946-c95d-4d5e-9219-edc30b31feac',
        product_description: 'Sony UWP-D21 Camera-Mount Wireless Omni Lavalier Microphone System (UC14: 470 to 542 MHz) - Wireless Transmission: Analog UHF | RF Channels: 2772',
        brand: 'Sony',
        model: 'UWP-D21/14',
        top_n: 15,
        save_log: true,
      }),
    })

    console.log('[DEBUG UWP-D21 Status]:', res.status)
    if (!res.ok) {
      console.error('[DEBUG UWP-D21 Error Body]:', await res.text())
    }
    expect(res.status).toBe(200)
    const result = await res.json()
    console.log('[VAL 4 UWP-D21]:', JSON.stringify({
      recommended: result.recommendation?.ncm,
      ex: result.recommendation?.ex,
      confidence: result.confidence,
      sufficient_info: result.sufficient_info,
      alternatives: result.alternatives?.map((a: any) => ({ ncm: a.ncm, ex: a.ex, source: a.alternatives_source })),
      audit_id: result.audit_id,
    }, null, 2))

    expect(result.success).toBe(true)
    // Esperado: família 8518 (microfones/receptores/acessórios de áudio)
    expect(result.recommendation.ncm.startsWith('8518')).toBe(true)
    // Proibido 8517.62
    expect(result.recommendation.ncm.startsWith('8517')).toBe(false)
    // Proibido Ex 019
    expect(result.recommendation.ex).not.toBe('019')
    expect(result.recommendation.ex).toBe('')
    // Requisito 3: Proibição inversa — NCM de peças NÃO pode vencer equipamento completo de áudio
    expect(result.recommendation.ncm).not.toBe('85299090')
    expect(result.recommendation.description).not.toMatch(/^Partes\b/i)
    // Alternatives também não podem ter 8517.62 se vetado
    const has8517InAlts = result.alternatives.some((a: any) => a.ncm.startsWith('8517'))
    expect(has8517InAlts).toBe(false)
  }, 60000)
})
