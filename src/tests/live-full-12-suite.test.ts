import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('Full 12-Case Regression Suite (9 Standing + 3 New Tripod Cases)', () => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  async function getJwt(): Promise<string> {
    let lastError: any = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: 'qa.operator@mywayvideo.com',
          password: 'Skip@Pass123!',
        })
        if (!authError && authData?.session) {
          return authData.session.access_token
        }
        lastError = authError
      } catch (e) {
        lastError = e
      }
      await new Promise(r => setTimeout(r, 1000))
    }
    throw new Error(`Auth failed: ${lastError?.message || lastError}`)
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
      await new Promise(r => setTimeout(r, 2000))
    }
    throw lastError
  }

  it('verifies health check endpoint exposes build 638 and new features', async () => {
    let lastData: any = null
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm?health=true&t=${Date.now()}`)
        if (res.ok) {
          lastData = await res.json()
          if (lastData?.version?.includes('build.')) break
        }
      } catch (e) {
        // retry
      }
      await new Promise(r => setTimeout(r, 1500))
    }
    console.log('HEALTH CHECK DATA:', lastData)
    expect(lastData).toBeDefined()
    expect(lastData.version).toBe('3.8.0-build.638')
    expect(lastData.features).toContain('ncm_support_derived_fields_retrieval')
    expect(lastData.features).toContain('ncm_support_unconditional_audit_links')
    expect(lastData.features).toContain('functional_coherence_chapter_veto')
  })

  // 1. Sony FX5 -> 85258929
  it('Standing Case 1: Sony FX5 Cinema Camera -> 85258929', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description: 'Sony FX5 Cinema Camera with XLR Handle Unit - Câmera compacta com sensor CMOS full-frame de alta sensibilidade, saídas SDI/HDMI e gravação 4K.',
      brand: 'Sony',
      model: 'FX5',
    })
    console.log('Case 1 (Sony FX5):', result.recommendation?.ncm)
    expect(result.recommendation?.ncm).toBe('85258929')
  }, 60000)

  // 2. RM-IP500 -> 85299090 + 85437099
  it('Standing Case 2: RM-IP500 -> 85299090 + 85437099', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description: 'Sony RM-IP500 PTZ Camera Remote Controller. Control of up to 100 cameras over IP. Pan, tilt, and zoom joystick control with PTZ speed control knobs.',
      brand: 'Sony',
      model: 'RM-IP500',
    })
    console.log('Case 2 (RM-IP500):', result.recommendation?.ncm, result.alternatives?.map((a: any) => a.ncm))
    expect(result.recommendation?.ncm).toBe('85299090')
    const altNcms = (result.alternatives || []).map((a: any) => a.ncm)
    expect(altNcms).toContain('85437099')
  }, 60000)

  // 3. Manopla servo zoom -> 85299090 + 85437099
  it('Standing Case 3: Manopla servo zoom -> 85299090 + 85437099', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description: 'Fujinon ERD-20A-A02 Zoom Demand / Manopla de controle de servo zoom e foco para teleobjetivas e lentes broadcast de estúdio. Dispositivo de comando remoto acoplável a tripé para acionamento de servomotores da objetiva.',
      brand: 'Fujinon',
      model: 'ERD-20A-A02',
      additional_specs: 'Requer conexão com o servo da lente broadcast/teleobjetiva para operar. Sem alimentação ou função autônoma independente.',
    })
    console.log('Case 3 (Manopla):', result.recommendation?.ncm, result.alternatives?.map((a: any) => a.ncm))
    expect(result.recommendation?.ncm).toBe('85299090')
    const altNcms = (result.alternatives || []).map((a: any) => a.ncm)
    expect(altNcms).toContain('85437099')
  }, 60000)

  // 4. UWP-D21 -> 85181090 + 85437099
  it('Standing Case 4: UWP-D21 -> 85181090 + 85437099', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description: 'Sony UWP-D21 Camera-Mount Wireless Omni Lavalier Microphone System (UC14: 470 to 542 MHz) - Wireless Transmission: Analog UHF | RF Channels: 2772',
      brand: 'Sony',
      model: 'UWP-D21/14',
      additional_specs: 'Sistema sem fio analógico UHF composto por transmissor bodypack UTX-B40, receptor portátil URX-P40 e microfone de lapela ECM-V1BMP.',
    })
    console.log('Case 4 (UWP-D21):', result.recommendation?.ncm, result.alternatives?.map((a: any) => a.ncm))
    expect(result.recommendation?.ncm).toBe('85181090')
    const altNcms = (result.alternatives || []).map((a: any) => a.ncm)
    expect(altNcms).toContain('85437099')
  }, 60000)

  // 5. ATEM SDI Extreme ISO (8+ entradas) -> 85437035
  it('Standing Case 5: ATEM SDI Extreme ISO -> 85437035', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description: 'Blackmagic Design ATEM SDI Extreme ISO Switcher - Switcher de produção ao vivo com 8 entradas 3G-SDI, 4 saídas SDI, 2 portas USB para webcam e gravação ISO de todos os 8 canais de entrada mais o programa.',
      brand: 'Blackmagic Design',
      model: 'ATEM SDI Extreme ISO',
      additional_specs: 'Misturador e comutador digital de vídeo em tempo real, 8 entradas SDI com conversão de padrões integrada, mixer de áudio Fairlight.',
    })
    console.log('Case 5 (ATEM SDI):', result.recommendation?.ncm)
    expect(result.recommendation?.ncm).toBe('85437035')
  }, 60000)

  // 6. Constellation (misturador 8+ entradas) -> 85437035
  it('Standing Case 6: Blackmagic ATEM Constellation -> 85437035', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description: 'Blackmagic Design ATEM 1 M/E Constellation HD Live Production Switcher - Switcher de produção ao vivo com 10 entradas 3G-SDI e 6 saídas SDI, DVE, croma-keyers, multiview.',
      brand: 'Blackmagic Design',
      model: 'ATEM 1 M/E Constellation HD',
      additional_specs: '10 entradas 3G-SDI independentes com conversão de padrões, 6 saídas SDI, processador de vídeo digital em tempo real.',
    })
    console.log('Case 6 (Constellation):', result.recommendation?.ncm)
    expect(result.recommendation?.ncm).toBe('85437035')
  }, 60000)

  // 7. HDC-3200R -> 85258921 + 85437099
  it('Standing Case 7: HDC-3200R -> 85258921 + 85437099', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description: 'Sony HDC-3200R 2/3-inch 3-CMOS 4K Broadcast Camera System. 4K HDR live production camera with 3x 2/3" 4K CMOS image sensors, global shutter, B4 lens mount.',
      brand: 'Sony',
      model: 'HDC-3200R',
    })
    console.log('Case 7 (HDC-3200R):', result.recommendation?.ncm, result.alternatives?.map((a: any) => a.ncm))
    expect(result.recommendation?.ncm).toBe('85258921')
    const altNcms = (result.alternatives || []).map((a: any) => a.ncm)
    expect(altNcms).toContain('85437099')
  }, 60000)

  // 8. Sony 3 sensores -> 85258921
  it('Standing Case 8: Sony 3 sensores de imagem -> 85258921', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description: 'Sony HDC-4300 4K/HD System Camera with 3x 2/3-inch 4K CMOS image sensors, high frame rate capture, ultra high definition broadcast studio camera.',
      brand: 'Sony',
      model: 'HDC-4300',
      additional_specs: 'Equipada com 3 captadores de imagem CMOS de 2/3 de polegada para reprodução cromática com prisma.',
    })
    console.log('Case 8 (Sony 3 sensores):', result.recommendation?.ncm)
    expect(result.recommendation?.ncm).toBe('85258921')
  }, 60000)

  // 9. Blackmagic URSA Mini Pro G2 -> 85258929
  it('Standing Case 9: Blackmagic URSA Mini Pro G2 -> 85258929', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description: 'Blackmagic Design URSA Mini Pro 4.6K G2 Digital Cinema Camera - Câmera de cinema digital profissional com sensor Super 35 HDR 4.6K, 15 stops de alcance dinâmico, gravação Blackmagic RAW.',
      brand: 'Blackmagic Design',
      model: 'URSA Mini Pro 4.6K G2',
    })
    console.log('Case 9 (URSA G2):', result.recommendation?.ncm)
    expect(result.recommendation?.ncm).toBe('85258929')
  }, 60000)

  // 10. E-Image EI7060 (tripé mecânico com cabeça fluida) -> esperado 96200000 como recomendado
  it('Tripod Case 10: E-Image EI7060 tripé mecânico de vídeo -> 96200000 com aviso Siscomex', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description: 'E-Image EI7060 Tripé mecânico de vídeo profissional com cabeça fluida para câmeras de estúdio e camcorders de broadcast',
      brand: 'E-Image',
      model: 'EI7060',
      additional_specs: 'Sistema de suporte mecânico composto por pernas de tripé de alumínio de duplo estágio e cabeça fluida com amortecimento para câmeras de vídeo e filmadoras da posição 85.25. Carga útil de até 8kg.',
    })
    console.log('Case 10 (E-Image EI7060):', JSON.stringify({
      recommendation: result.recommendation,
      audit_links: result.audit_links,
      alternatives: result.alternatives?.map((a: any) => a.ncm),
    }))

    const recNcm = result.recommendation?.ncm || ''
    // Decisão vinculante: Tripé nada tem a ver com 85299090. Ele está em 9620 (96200000)
    expect(recNcm).toBe('96200000')
    // NUNCA pode ser 85299090 como principal
    expect(recNcm).not.toBe('85299090')
    // NUNCA cair no capítulo 90 (90.11 / 9011) - veto de coerência funcional
    expect(recNcm.startsWith('9011')).toBe(false)
    expect(recNcm.startsWith('90')).toBe(false)

    // Deve conter aviso Siscomex sobre alíquotas da base local
    const fullText = `${result.recommendation?.description || ''} ${result.recommendation?.justification || ''}`
    expect(fullText.toLowerCase()).toMatch(/(?:siscomex|base local|al[íi]quotas)/i)

    // Unconditional audit link for ncm_support:// family
    const suppLinks = (result.audit_links || []).filter((l: any) =>
      l.type === 'ncm_support_family' || (l.url && l.url.startsWith('ncm_support://'))
    )
    expect(suppLinks.length).toBeGreaterThan(0)
  }, 60000)

  // 11. Cabeça fluida avulsa -> esperado 96200000 com aviso Siscomex
  it('Tripod Case 11: Cabeça fluida avulsa -> 96200000 com aviso Siscomex (não 85299090 nem 90.11)', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description: 'E-Image GH06 Cabeça Fluida Hidráulica avulsa para suporte e movimentação suave de câmeras de vídeo e broadcast',
      brand: 'E-Image',
      model: 'GH06',
      additional_specs: 'Cabeça hidráulica profissional para montagem em tripé de 75mm, suporta câmeras de cinema e vídeo broadcast de até 6kg, controle de pan e tilt suave.',
    })
    console.log('Case 11 (Cabeça Fluida):', JSON.stringify({
      recommendation: result.recommendation,
      alternatives: result.alternatives?.map((a: any) => a.ncm),
    }))

    const recNcm = result.recommendation?.ncm || ''
    // Decisão vinculante: Cabeça fluida manual enquadra-se na posição 9620 (96200000)
    expect(recNcm).toBe('96200000')
    expect(recNcm).not.toBe('85299090')
    expect(recNcm.startsWith('9011')).toBe(false)
    expect(recNcm.startsWith('90')).toBe(false)

    // Deve conter aviso Siscomex sobre alíquotas da base local
    const fullText = `${result.recommendation?.description || ''} ${result.recommendation?.justification || ''}`
    expect(fullText.toLowerCase()).toMatch(/(?:siscomex|base local|al[íi]quotas)/i)
  }, 60000)

  // 12. Pedestal motorizado de broadcast -> 85299090 ou 85437099
  it('Tripod Case 12: Pedestal motorizado de broadcast -> 85299090 or 85437099 per electrical function', async () => {
    const jwt = await getJwt()
    const result = await classify(jwt, {
      product_description: 'Vinten Osprey Elite Pedestal Motorizado de Broadcast para estúdio de televisão, controle elétrico de elevação de coluna para câmeras de estúdio pesadas.',
      brand: 'Vinten',
      model: 'Osprey Elite Motorized',
      additional_specs: 'Pedestal com acionamento elétrico e elevação pneumática motorizada projetado para suportar câmeras broadcast de estúdio e cabeças panorâmicas.',
    })
    console.log('Case 12 (Pedestal Motorizado):', result.recommendation?.ncm)
    const recNcm = result.recommendation?.ncm || ''
    expect(recNcm === '85299090' || recNcm === '85437099').toBe(true)
  }, 60000)
})
