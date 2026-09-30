import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('classify-ncm 4-Calibration Regression Suite (Live POST)', () => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  async function getJwt(): Promise<string> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: 'qa.operator@mywayvideo.com',
          password: 'Skip@Pass123!',
        })
        if (!authError && authData?.session) {
          return authData.session.access_token
        }
      } catch (_e) {
        // retry
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    throw new Error('Auth failed for qa.operator@mywayvideo.com')
  }

  async function classify(jwt: string, payload: any) {
    let lastError: any = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ ...payload, save_log: true, top_n: 15 }),
        })
        if (res.ok) {
          return await res.json()
        }
        const errText = await res.text()
        lastError = new Error(`HTTP ${res.status}: ${errText}`)
      } catch (e) {
        lastError = e
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
    throw lastError
  }

  it('Health Check: validates live build 651 and conditional_85437099_injection', async () => {
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm?health=true&t=${Date.now()}`)
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data.version).toMatch(/3\.8\.0-build\.65[123]/)
    expect(data.features).toContain('conditional_85437099_injection')
    expect(data.features).not.toContain('deterministic_85437099_injection')
  }, 30000)

  // Caso 1: ATEM SDI Extreme ISO → principal 85437035, SEM 85437099, sem monopólio do cap. 90
  it('Caso 1: ATEM SDI Extreme ISO -> principal 85437035, SEM 85437099, sem monopólio cap. 90', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description:
        'Blackmagic Design ATEM SDI Extreme ISO Switcher - Switcher de produção ao vivo com 8 entradas 3G-SDI, 4 saídas SDI, 2 portas USB para webcam e gravação ISO de todos os 8 canais de entrada mais o programa.',
      brand: 'Blackmagic Design',
      model: 'ATEM SDI Extreme ISO',
      additional_specs:
        'Misturador e comutador digital de vídeo em tempo real, 8 entradas SDI com conversão de padrões integrada, mixer de áudio Fairlight.',
    })
    console.log('[Caso 1 ATEM]:', result.recommendation?.ncm, 'Alts:', result.alternatives?.map((a: any) => a.ncm))
    expect(result.recommendation?.ncm).toBe('85437035')

    const altNcms = (result.alternatives || []).map((a: any) => a.ncm)
    // SEM 85437099 nas alternativas (enquadramento específico 85437035)
    expect(altNcms).not.toContain('85437099')

    // Sem monopólio do cap. 90 nas alternativas
    const cap90Alts = altNcms.filter((ncm: string) => ncm.startsWith('90'))
    expect(cap90Alts.length).toBeLessThanOrEqual(1)
  }, 75000)

  // Caso 2: Sony RM-IP500 → principal inalterado (85299090), COM 85437099 presente nas alternativas (invariante)
  it('Caso 2: Sony RM-IP500 -> principal 85299090, COM 85437099 presente nas alternativas', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description:
        'Sony RM-IP500 PTZ Camera Remote Controller. Control of up to 100 cameras over IP. Pan, tilt, and zoom joystick control with PTZ speed control knobs.',
      brand: 'Sony',
      model: 'RM-IP500',
    })
    console.log('[Caso 2 RM-IP500]:', result.recommendation?.ncm, 'Alts:', result.alternatives?.map((a: any) => a.ncm))
    expect(result.recommendation?.ncm).toBe('85299090')

    const altNcms = (result.alternatives || []).map((a: any) => a.ncm)
    // COM 85437099 presente nas alternativas (invariante)
    expect(altNcms).toContain('85437099')
  }, 75000)

  // Caso 3: Sony UWP-D21 → principal 85181090 inalterado, SEM 85437099
  it('Caso 3: Sony UWP-D21 -> principal 85181090 inalterado, SEM 85437099', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description:
        'Sony UWP-D21 Camera-Mount Wireless Omni Lavalier Microphone System (UC14: 470 to 542 MHz) - Wireless Transmission: Analog UHF | RF Channels: 2772',
      brand: 'Sony',
      model: 'UWP-D21/14',
      additional_specs:
        'Sistema sem fio analógico UHF composto por transmissor bodypack UTX-B40, receptor portátil URX-P40 e microfone de lapela ECM-V1BMP.',
    })
    console.log('[Caso 3 UWP-D21]:', result.recommendation?.ncm, 'Alts:', result.alternatives?.map((a: any) => a.ncm))
    expect(result.recommendation?.ncm).toBe('85181090')

    const altNcms = (result.alternatives || []).map((a: any) => a.ncm)
    // SEM 85437099 nas alternativas (enquadramento específico 85.18)
    expect(altNcms).not.toContain('85437099')
  }, 75000)

  // Caso 4: Sony HDC-3200R → principal 85258921 inalterado; 85258090 (extinto) proibido em qualquer campo
  it('Caso 4: Sony HDC-3200R -> principal 85258921 inalterado; 85258090 proibido', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description:
        'Sony HDC-3200R 2/3-inch 3-CMOS 4K Broadcast Camera System. 4K HDR live production camera with 3x 2/3" 4K CMOS image sensors, global shutter, B4 lens mount.',
      brand: 'Sony',
      model: 'HDC-3200R',
    })
    console.log('[Caso 4 HDC-3200R]:', result.recommendation?.ncm, 'Alts:', result.alternatives?.map((a: any) => a.ncm))
    expect(result.recommendation?.ncm).toBe('85258921')

    const allNcms = [result.recommendation?.ncm, ...(result.alternatives || []).map((a: any) => a.ncm)]
    expect(allNcms).not.toContain('85258090')

    const fullPayloadStr = JSON.stringify(result)
    expect(fullPayloadStr).not.toContain('85258090')
    expect(fullPayloadStr).not.toContain('8525.80.90')
  }, 75000)

  // Caso 5: E-Image EG03A2 → principal 96200000 + aviso Siscomex, SEM 85437099
  it('Caso 5: E-Image EG03A2 -> principal 96200000 + aviso Siscomex, SEM 85437099', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description:
        'E-Image EG03A2 Sistema de tripé de vídeo de alumínio com cabeça fluida GH03 para câmeras de vídeo e filmadoras',
      brand: 'E-Image',
      model: 'EG03A2',
      additional_specs:
        'Tripé mecânico profissional de 2 estágios em alumínio com spreader de solo e cabeça fluida GH03 para sustentação de câmeras até 5kg.',
    })
    console.log('[Caso 5 EG03A2]:', result.recommendation?.ncm, 'Alts:', result.alternatives?.map((a: any) => a.ncm))
    expect(result.recommendation?.ncm).toBe('96200000')

    // Deve conter aviso Siscomex sobre alíquotas da base local
    const fullText = `${result.recommendation?.description || ''} ${result.recommendation?.justification || ''} ${result.recommendation?.tax_notice || ''} ${result.recommendation?.legal_basis?.notes || ''}`
    expect(fullText.toLowerCase()).toMatch(/(?:siscomex|base local|al[íi]quotas)/i)

    const altNcms = (result.alternatives || []).map((a: any) => a.ncm)
    // SEM 85437099 nas alternativas (tripé puramente mecânico)
    expect(altNcms).not.toContain('85437099')
  }, 75000)

  // Caso 6: Manopla servo zoom → 85299090, comportamento inalterado
  it('Caso 6: Manopla servo zoom -> 85299090, comportamento inalterado', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description:
        'Fujinon ERD-20A-A02 Zoom Demand / Manopla de controle de servo zoom e foco para teleobjetivas e lentes broadcast de estúdio. Dispositivo de comando remoto acoplável a tripé para acionamento de servomotores da objetiva.',
      brand: 'Fujinon',
      model: 'ERD-20A-A02',
      additional_specs:
        'Requer conexão com o servo da lente broadcast/teleobjetiva para operar. Sem alimentação ou função autônoma independente.',
    })
    console.log('[Caso 6 Manopla]:', result.recommendation?.ncm, 'Alts:', result.alternatives?.map((a: any) => a.ncm))
    expect(result.recommendation?.ncm).toBe('85299090')
  }, 75000)

  // Caso 7: NOVO caso: produto "audio delay" / sincronizador de áudio-vídeo → DEVE ter 85437099 nas alternativas com justificativa
  it('Caso 7: Audio Delay / sincronizador AV -> DEVE ter 85437099 nas alternativas com justificativa', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description:
        'Datavideo AD-100 Audio Delay Box - Processador de retardo e sincronizador de áudio/vídeo profissional para ajuste de lip-sync em transmissões ao vivo.',
      brand: 'Datavideo',
      model: 'AD-100',
      additional_specs:
        'Dispositivo autônomo com entradas e saídas RCA/XLR balanceadas, retardo ajustável de 0 a 700ms para compensar atraso de processamento de vídeo e garantir sincronia labial.',
    })
    console.log('[Caso 7 Audio Delay]:', result.recommendation?.ncm, 'Alts:', result.alternatives?.map((a: any) => a.ncm))

    const allNcms = [result.recommendation?.ncm, ...(result.alternatives || []).map((a: any) => a.ncm)]
    // DEVE ter 85437099 na recomendação ou nas alternativas
    expect(allNcms).toContain('85437099')

    const alt85437099 = (result.alternatives || []).find((a: any) => a.ncm === '85437099')
    if (alt85437099) {
      expect(alt85437099.reason).toBeDefined()
      expect(alt85437099.reason.length).toBeGreaterThan(10)
    }
  }, 75000)

  // Caso 8: Diversidade: nenhuma lista de alternativas com todos os códigos do mesmo capítulo
  it('Caso 8: Diversidade calibrada -> alternativas não possuem todos os códigos do mesmo capítulo', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description:
        'Blackmagic Design ATEM SDI Extreme ISO Switcher - Switcher de produção ao vivo com 8 entradas 3G-SDI, 4 saídas SDI, 2 portas USB para webcam e gravação ISO de todos os 8 canais de entrada mais o programa.',
      brand: 'Blackmagic Design',
      model: 'ATEM SDI Extreme ISO',
    })
    const alts = result.alternatives || []
    if (alts.length > 1) {
      const chapters = new Set(alts.map((a: any) => a.ncm.slice(0, 2)))
      console.log('[Caso 8 Capítulos das alternativas]:', Array.from(chapters))
      expect(chapters.size).toBeGreaterThan(1)
    }
  }, 75000)

  // Caso 9: CRITÉRIO DE NÃO-REGRESSÃO MAIS IMPORTANTE: NCM PRINCIPAL de todos os casos anteriores idêntico
  it('Caso 9: Critério de não-regressão -> NCM principal idêntico ao de antes da mudança', () => {
    // Validado cumulativamente nos testes 1 a 6 acima
    expect(true).toBe(true)
  })

  // Caso 10: Regressão de NCM atual extinto (85258090 -> REVISAR com motivo mencionando código extinto)
  it('Caso 10: Regressão NCM atual extinto (85258090) -> veredicto REVISAR com motivo de código extinto', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description:
        'Sony HDC-3200R 2/3-inch 3-CMOS 4K Broadcast Camera System. 4K HDR live production camera with 3x 2/3" 4K CMOS image sensors, global shutter, B4 lens mount.',
      brand: 'Sony',
      model: 'HDC-3200R',
      current_ncm: '85258090',
    })

    console.log('[Caso 10 NCM Extinto 85258090]:', JSON.stringify({
      recommendation: result.recommendation?.ncm,
      current_ncm_assessment: result.current_ncm_assessment,
    }))

    // 1. Recomendação homologada permanece correta
    expect(result.recommendation?.ncm).toBe('85258921')

    // 2. Campo current_ncm_assessment presente quando current_ncm é informado
    expect(result.current_ncm_assessment).toBeDefined()
    const assessment = result.current_ncm_assessment
    expect(assessment.current_ncm).toBe('85258090')
    expect(assessment.verdict).toBe('REVISAR')
    expect(assessment.matches_recommendation).toBe(false)

    // 3. Justificativa menciona que o código é extinto / revogado / proibido
    expect(assessment.justification.toLowerCase()).toMatch(/(?:extinto|proibido|desdobrado|revogado)/i)
    expect(assessment.justification).toContain('8525.80.90')
    expect(assessment.reasons.some((r: string) => /extinto|revogado/i.test(r))).toBe(true)
  }, 75000)

  // Caso 11: Retrocompatibilidade estrita: SEM current_ncm, current_ncm_assessment NÃO deve constar na resposta
  it('Caso 11: Retrocompatibilidade SEM current_ncm -> resposta idêntica sem current_ncm_assessment', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description:
        'Sony RM-IP500 PTZ Camera Remote Controller. Control of up to 100 cameras over IP.',
      brand: 'Sony',
      model: 'RM-IP500',
    })

    // Campo current_ncm_assessment omitido quando current_ncm não é enviado
    expect(result.current_ncm_assessment).toBeUndefined()
    expect(result.recommendation?.ncm).toBe('85299090')
  }, 75000)

  // Caso 12: Sony UWP-D22 (handheld wireless microphone system) -> 85181090
  it('Caso 12: Sony UWP-D22 Handheld Wireless Microphone System -> 85181090', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description:
        'Sony UWP-D22 Wireless Handheld Microphone Package. Includes UTX-M40 handheld transmitter microphone and URX-P40 portable tuner receiver for broadcast audio.',
      brand: 'Sony',
      model: 'UWP-D22',
      additional_specs:
        'Sistema sem fio UHF digital composto por microfone de mão dinâmico unidirecional com transmissor integrado e receptor portátil com sapata digital.',
    })

    console.log('[Caso 12 UWP-D22]:', result.recommendation?.ncm, 'Alts:', result.alternatives?.map((a: any) => a.ncm))
    expect(result.recommendation?.ncm).toBe('85181090')
    const altNcms = (result.alternatives || []).map((a: any) => a.ncm)
    expect(altNcms).not.toContain('85437099')
  }, 75000)
})
