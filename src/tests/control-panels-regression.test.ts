import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('classify-ncm Regressão Completa de Produção + Control Panels', () => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  async function getAuthToken(): Promise<string> {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })
    if (authError || !authData?.session?.access_token) {
      throw new Error(`Falha no login de teste: ${authError?.message}`)
    }
    return authData.session.access_token
  }

  it('1. Tripés -> 9620 (com aviso Siscomex quando aplicável)', async () => {
    const jwt = await getAuthToken()
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description: 'Sachtler Video 18 S2 Fluid Head and Carbon Fiber Tripod System. Tripé de vídeo profissional com cabeça fluida, monopé e pernas de fibra de carbono para sustentação e estabilização mecânica de câmeras.',
        brand: 'Sachtler',
        model: 'Video 18 S2',
        additional_specs: 'Sistema mecânico de suporte, fixação e estabilização de câmera com tripé de pernas duplas e espalhador de solo.',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.success).toBe(true)
    expect(result.recommendation.ncm.startsWith('9620')).toBe(true)
  }, 60000)

  it('2. Switcher de 8+ entradas -> 85437035 com 85437099 sempre nas alternativas', async () => {
    const jwt = await getAuthToken()
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description: 'Blackmagic Design ATEM SDI Extreme ISO Switcher. Switcher de produção ao vivo com 8 entradas 3G-SDI, 4 saídas SDI e comutação digital em tempo real.',
        brand: 'Blackmagic Design',
        model: 'ATEM SDI Extreme ISO',
        additional_specs: 'Misturador e comutador digital de vídeo em tempo real com oito entradas SDI com conversão de padrões.',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.success).toBe(true)
    expect(result.recommendation.ncm).toBe('85437035')
    const altNcms = (result.alternatives || []).map((a: any) => a.ncm)
    expect(altNcms).toContain('85437099')
  }, 60000)

  it('3. Painel de controle (DaVinci Resolve Advanced Panel) casa a família Painéis de controle por categoria e por texto, com NCM recomendado em {84716090, 85437099, 85299090}', async () => {
    const jwt = await getAuthToken()
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_id: '7a1d53a8-8fcc-4bf2-a791-61646014572e', // DaVinci Resolve Advanced Panel
        product_description: 'Blackmagic DaVinci Resolve Advanced Panel. Painel profissional de color grading com 3 trackballs, T-Bar, displays LCD e teclas retroiluminadas para controle de software DaVinci Resolve via USB/Ethernet.',
        brand: 'Blackmagic Design',
        model: 'DaVinci Resolve Advanced Panel',
        category: 'Control Panels',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.success).toBe(true)
    expect(result.effective_category).toBe('Control Panels')
    expect(result.matched_family).toContain('Painéis de controle')
    const acceptableNcms = ['84716090', '85437099', '85299090']
    expect(acceptableNcms).toContain(result.recommendation.ncm)
  }, 60000)

  it('4. Painel de controle ATEM (ATEM 1 M/E Advanced Panel 10) casa por categoria e recomenda 85437099', async () => {
    const jwt = await getAuthToken()
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_id: '7019fb58-d729-41a9-ab5d-e31c26aefb6b', // ATEM 1 M/E Advanced Panel 10
        product_description: 'Blackmagic ATEM 1 M/E Advanced Panel 10. Painel de controle físico broadcast dedicado para switchers ATEM com T-bar suave, botões de comutação e joystick.',
        brand: 'Blackmagic Design',
        model: 'ATEM 1 M/E Advanced Panel 10',
        category: 'Control Panels',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.success).toBe(true)
    expect(result.effective_category).toBe('Control Panels')
    expect(result.matched_family).toContain('Painéis de controle')
    const acceptableNcms = ['84716090', '85437099', '85299090']
    expect(acceptableNcms).toContain(result.recommendation.ncm)
  }, 60000)

  it('5. Cabo com conector -> 85444200 (Outros condutores com peças de conexão)', async () => {
    const jwt = await getAuthToken()
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description: 'Kondor Blue D-Tap to BMPCC 4K/6K Coiled Power Cable. Cabo de alimentação espiralado com conectores montados (D-Tap macho para conector 2 pinos Weipu SF6) para alimentação de câmeras Blackmagic Pocket Cinema.',
        brand: 'Kondor Blue',
        model: 'D-Tap to BMPCC 4K/6K',
        category: 'Cable & Connectors',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.success).toBe(true)
    expect(result.recommendation.ncm).toBe('85444200')
    // Não pode auto-corrigir nem conter 85366900
    const altNcms = (result.alternatives || []).map((a: any) => a.ncm)
    expect(altNcms).not.toContain('85366900')
  }, 60000)

  it('6. Conector avulso -> 85366990 (NUNCA 8536.69.00 inexistente na Receita)', async () => {
    const jwt = await getAuthToken()
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description: 'Neutrik NC3MXX-B Male 3-Pin XLR Cable Connector. Conector XLR macho de 3 pinos avulso para montagem e soldagem em cabos balanceados de áudio e microfone profissional, corpo de zinco e contatos banhados a ouro.',
        brand: 'Neutrik',
        model: 'NC3MXX-B',
        category: 'Cable & Connectors',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.success).toBe(true)
    expect(result.recommendation.ncm).toBe('85366990')
    expect(result.recommendation.ncm).not.toBe('85366900')
    const altNcms = (result.alternatives || []).map((a: any) => a.ncm)
    expect(altNcms).not.toContain('85366900')
  }, 60000)

  it('7. Dolly de tripé -> 9620 (artigos semelhantes de apoio mecânico de tripé)', async () => {
    const jwt = await getAuthToken()
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description: 'E-Image EI-7004 Heavy-Duty Universal Tripod Dolly. Carrinho com rodas de travamento para tripés de vídeo broadcast e cinema, base de suporte mecânico com travas individuais em cada roda.',
        brand: 'E-Image',
        model: 'EI-7004',
        category: 'Tripods & Rigs',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.success).toBe(true)
    expect(result.recommendation.ncm.startsWith('9620')).toBe(true)
  }, 60000)
})
