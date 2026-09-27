import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('NCM Product Validation & Recalibration Tests', () => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  it('validates Sony RM-IP500 is classified under 8543.70.99 or 8529.90.90, never under 8428 or 8426', async () => {
    // 1. Autenticação para obter JWT válido
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })

    expect(authError).toBeNull()
    const jwt = authData!.session!.access_token

    // 2. Chamar classify-ncm com o produto Sony RM-IP500
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description: 'Sony RM-IP500 Professional Remote Controller with Joystick for PTZ Cameras',
        brand: 'Sony',
        model: 'RM-IP500',
        additional_specs: 'PTZ camera controller with joystick, RS-422, VISCA over IP, RJ45, control of up to 100 cameras',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.success).toBe(true)
    expect(result.recommendation).toBeDefined()

    const recommendedNcm = result.recommendation.ncm.replace(/\D/g, '')

    // Não deve ser gruas (8428) nem guindastes/robôs de elevação (8426)
    // JAMAIS 9007.10.00 (+Ex 002) nem 8537.10.20
    expect(recommendedNcm.startsWith('8428')).toBe(false)
    expect(recommendedNcm.startsWith('8426')).toBe(false)
    expect(recommendedNcm.startsWith('9007')).toBe(false)
    expect(recommendedNcm).not.toBe('90071000')
    expect(recommendedNcm).not.toBe('85371020')

    // Deve ser 8543.70.99 ou 8529.90.90 (os dois únicos aceitáveis para o RM-IP500)
    const isAcceptedNcm = recommendedNcm === '85437099' || recommendedNcm === '85299090'
    expect(isAcceptedNcm).toBe(true)

    // Falha 1 & 3: Propagação de veto e presença de 85437099 e 85299090
    // O NCM 85371020 (vetado pelo auditor) NÃO PODE aparecer nem na recomendação nem nas alternativas
    expect(recommendedNcm).not.toBe('85371020')
    const altNcms = (result.alternatives || []).map((a: any) => a.ncm.replace(/\D/g, ''))
    expect(altNcms.includes('85371020')).toBe(false)

    // Ambas as famílias (85437099 e 85299090) devem estar presentes entre recomendação e alternativas
    const allPresentNcms = [recommendedNcm, ...altNcms]
    expect(allPresentNcms.includes('85437099')).toBe(true)
    expect(allPresentNcms.includes('85299090')).toBe(true)

    // Falha 2: Componente vs destino da função
    // Em "controlador para câmeras PTZ", câmeras é DESTINO da função, NÃO componente integrado do produto
    if (result.composition_analysis) {
      const detectedComps = (result.composition_analysis.detectedComponents || []).map((c: string) =>
        c.toLowerCase(),
      )
      expect(detectedComps.some((c: string) => c.includes('camera') || c.includes('câmera'))).toBe(false)
      // O destino da função deve ter sido identificado
      if (result.composition_analysis.targetMachines) {
        const targets = result.composition_analysis.targetMachines.map((t: string) => t.toLowerCase())
        expect(targets.some((t: string) => t.includes('camera') || t.includes('câmera') || t.includes('ptz'))).toBe(true)
      }
    }

    // Falha 4: Invariante do checklist: status NÃO VERIFICADO implica passed:false
    if (result.checklist_log) {
      if (result.checklist_log.status === 'NÃO VERIFICADO') {
        expect(result.checklist_log.passed).toBe(false)
      }
      if (result.checklist_log.status !== 'APROVADO') {
        expect(result.checklist_log.passed).toBe(false)
      }
    }

    // Falha 5: Regeneração da fundamentação legal (legal_basis):
    // Nenhum código de Ex citado no legal_basis pode diferir do Ex final
    const finalEx = (result.recommendation.ex || '').toString().trim()
    const legalNotes = ((result.recommendation.legal_basis || {}).notes || '').toString()
    const exCitedMatch = legalNotes.match(/ex(?:-tarif[aá]rio)?\s*[:#-]?\s*(\d{1,4})/i)
    if (exCitedMatch) {
      expect(finalEx).toBeTruthy()
      expect(exCitedMatch[1].padStart(3, '0')).toBe(finalEx.padStart(3, '0'))
    }

    // Se o auditor tentou vetar para câmera ou grua, a correção deve ter sido vetada
    if (result.audit_verdict) {
      const correctedDigits = (result.audit_verdict.corrected_ncm || '').replace(/\D/g, '')
      expect(correctedDigits.startsWith('8426')).toBe(false)
      expect(correctedDigits.startsWith('8428')).toBe(false)
      expect(correctedDigits.startsWith('9007')).toBe(false)
      expect(correctedDigits).not.toBe('85371020')
    }
  }, 60000)

  it('validates Sony BURANO 8K regression test maintains 8525 chapter with high confidence', async () => {
    const { data: authData } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })

    const jwt = authData!.session!.access_token

    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description: 'Sony BURANO 8K Digital Cinema Camera MPC-2610 Full-Frame 8.6K Sensor PL/E Mount',
        brand: 'Sony',
        model: 'MPC-2610 (BURANO)',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.success).toBe(true)
    const ncm = result.recommendation.ncm.replace(/\D/g, '')
    expect(ncm.startsWith('8525')).toBe(true)
  }, 60000)

  it('validates Sony UWP-D21 wireless microphone system does NOT apply Ex 019 of 8517.62.91', async () => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })

    expect(authError).toBeNull()
    const jwt = authData!.session!.access_token

    // Sony UWP-D21 (sistema de microfone sem fio analógico UHF 470-542MHz, transmissor+receptor)
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description:
          'Sony UWP-D21 Sistema de microfone sem fio analógico UHF 470-542MHz composto por transmissor bodypack UTX-B40 e receptor portátil URX-P40 com microfone de lapela omnidirecional',
        brand: 'Sony',
        model: 'UWP-D21',
        additional_specs:
          'Wireless microphone system UHF 470-542MHz, analog FM modulation with DSP compander, package includes UTX-B40 bodypack transmitter, URX-P40 portable receiver, ECM-V1BMP lavalier mic',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.success).toBe(true)
    expect(result.recommendation).toBeDefined()

    const ncmDigits = result.recommendation.ncm.replace(/\D/g, '')
    const exDigits = (result.recommendation.ex || '').toString().trim()

    // Validação principal: NÃO pode manter o Ex 019 de 8517.62.91
    if (ncmDigits === '85176291') {
      expect(exDigits).not.toBe('019')
    }

    // Deve pertencer aos capítulos eletrônicos / telecomunicações (8517, 8518, 8527, 8525)
    // Esperado pelo usuário no diagnóstico: aterrissar na família de microfones/áudio (8518),
    // SEM Ex 019 e SEM 8517.62 como recomendado
    expect(ncmDigits.startsWith('851762')).toBe(false)
    expect(ncmDigits.startsWith('8518')).toBe(true)

    // O sistema deve ter reconhecido como conjunto/sistema (RGI 3b)
    if (result.composition_analysis) {
      expect(result.composition_analysis.isKit).toBe(true)
    }

    // Justificativa deve existir e mencionar a descrição hierárquica completa oficial
    expect(result.recommendation.justification).toBeDefined()
    // A descrição hierárquica completa da família 8518 contém "aparelhos elétricos de amplificação de som" ou "Microfones"
    const justLower = result.recommendation.justification.toLowerCase()
    expect(
      justLower.includes('8518') ||
      justLower.includes('microfone') ||
      justLower.includes('som')
    ).toBe(true)
  }, 60000)
})
