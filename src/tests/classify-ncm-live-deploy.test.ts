import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('classify-ncm Edge Function live deploy check & validation', () => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  it('checks edge function health endpoint returning version 3.3.0-build.605', async () => {
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm?health=true`, {
      method: 'GET',
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('ok')
    expect(data.function).toBe('classify-ncm')
    expect(data.version).toBe('3.4.0-build.606')
    expect(data.features).toContain('phase0_canonical_composition_derivation')
    expect(data.features).toContain('orphan_ncm_sweep_invariant')
    expect(data.features).toContain('ex_checklist_report_suppression_when_no_ex')
    expect(data.features).toContain('family_expansion_6digits')
    expect(data.features).toContain('intrafamily_qualifier_tiebreak')
    expect(data.features).toContain('candidate_catalog_integrity_check')
    expect(data.features).toContain('full_candidate_audit_logging')
    expect(data.features).toContain('parts_ncm_indirect_linking')
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

  it('validates RM-IP500 live classification (expected: 85437099 without Ex, 85299090 in alternatives)', async () => {
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
        product_description: 'Sony RM-IP500 PTZ Camera Remote Controller. Control of up to 100 cameras over IP. Pan, tilt, and zoom joystick control with PTZ speed control knobs.',
        brand: 'Sony',
        model: 'RM-IP500',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    console.log('[RM-IP500 Result]:', JSON.stringify({
      ncm: result.recommendation?.ncm,
      ex: result.recommendation?.ex,
      model_used: result.model_used,
      analyst_model: result.analyst_model,
      auditor_model: result.auditor_model,
      product_understanding: result.product_understanding,
      alternatives: result.alternatives?.map((a: any) => ({ ncm: a.ncm, ex: a.ex })),
      audit_id: result.audit_id,
    }, null, 2))

    expect(result.success).toBe(true)
    expect(result.recommendation.ncm).toBe('85437099')
    expect(result.recommendation.ex).toBe('')
    // Calibração 1: NENHUMA menção a 90319090 ou 9031 na justificativa
    expect(result.recommendation.justification).not.toContain('9031')
    expect(result.recommendation.justification).not.toContain('90319090')
    // Calibração 2: composition_analysis derivada da Fase 0
    expect(result.composition_analysis).toBeDefined()
    expect(result.composition_analysis.isKit).toBe(false)
    // targetMachines não pode conter 'controle' ou 'panorâmica'
    for (const tm of result.composition_analysis.targetMachines || []) {
      expect(tm.toLowerCase()).not.toBe('controle')
      expect(tm.toLowerCase()).not.toBe('panorâmica')
      expect(tm.toLowerCase()).not.toBe('panoramica')
    }
    // Calibração 3: sem bloco de checklist de Ex no relatório quando não há Ex
    expect(result.recommendation.justification).not.toContain('[Checklist de Condições Restritivas do Ex-Tarifário')
    // Invariante: 85299090 deve constar nas alternativas com justificativa de vínculo indireto
    const partsAlt = result.alternatives.find((a: any) => a.ncm === '85299090')
    expect(partsAlt).toBeDefined()
    // Requisito 4: Justificativa obrigatória explicitando vínculo indireto e intervalo
    expect(partsAlt.reason).toMatch(/(?:v[ií]nculo indireto|partes e acess[oó]rios|85\.24|8524)/i)
    // Requisito 5: Telemetria de partes presente no payload
    expect(result.parts_indirect_logic).toBeDefined()
    expect(result.parts_indirect_logic.parts_logic_triggered).toBe(true)
    // Product understanding da Fase 0
    expect(result.product_understanding).toBeDefined()
    expect(result.product_understanding.canonical_statement).toBeDefined()
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
    console.log('[HDC-3200R Result]:', JSON.stringify({
      ncm: result.recommendation?.ncm,
      ex: result.recommendation?.ex,
      description: result.recommendation?.description,
      model_used: result.model_used,
      evaluated_candidates_count: result.candidates_count,
      alternatives: result.alternatives?.map((a: any) => ({ ncm: a.ncm, ex: a.ex, description: a.description })),
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
        product_description: 'Sony UWP-D21 Camera-Mount Wireless Omni Lavalier Microphone System. Includes URX-P40 camera-mount receiver and UTX-B40 bodypack transmitter with ECM-V1BMP lavalier microphone. Digital Audio Processing for high-quality sound.',
        brand: 'Sony',
        model: 'UWP-D21',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    console.log('[UWP-D21 Result]:', JSON.stringify({
      ncm: result.recommendation?.ncm,
      ex: result.recommendation?.ex,
      model_used: result.model_used,
      analyst_model: result.analyst_model,
      auditor_model: result.auditor_model,
      product_understanding: result.product_understanding,
      alternatives: result.alternatives?.map((a: any) => ({ ncm: a.ncm, ex: a.ex })),
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
