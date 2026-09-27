import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('classify-ncm Edge Function live deploy check & validation', () => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  it('checks edge function health endpoint returning version 3.1.0-build.603', async () => {
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm?health=true`, {
      method: 'GET',
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('ok')
    expect(data.function).toBe('classify-ncm')
    expect(data.version).toBe('3.1.0-build.603')
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
    // Invariante: 85299090 deve constar nas alternativas (família de partes e acessórios da câmera de destino)
    const hasPartsAlt = result.alternatives.some((a: any) => a.ncm === '85299090')
    expect(hasPartsAlt).toBe(true)
    // Product understanding da Fase 0
    expect(result.product_understanding).toBeDefined()
    expect(result.product_understanding.canonical_statement).toBeDefined()
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
    // Alternatives também não podem ter 8517.62 se vetado
    const has8517InAlts = result.alternatives.some((a: any) => a.ncm.startsWith('8517'))
    expect(has8517InAlts).toBe(false)
  }, 60000)
})
