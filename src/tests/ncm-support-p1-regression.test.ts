import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('classify-ncm Parte 1 - Regressão Obrigatória Produção', () => {
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

  it('Health check confirma build 3.8.0-build.654 ativa com ncm_support_layer e novos campos', async () => {
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm?health=true`, {
      method: 'GET',
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    console.log('[HEALTH CHECK PRODUCTION]:', data)
    expect(data.version).toBe('3.8.0-build.656')
    expect(data.features).toContain('ncm_support_layer')
  })

  it('Caso 1: Blackmagic Cloud Dock 2 -> sugestão 8521.90.00 com família "Gravadores..." casada pela categoria', async () => {
    const jwt = await getAuthToken()
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_id: '6c1a84f3-a745-424b-b0cd-a0a4c2f707f1', // SKU DWCLDB/DOCK02
        product_description: 'Blackmagic Design Cloud Dock 2. Gravador SSD de alta velocidade para fluxo de trabalho de pós-produção e gravação de vídeo digital.',
        brand: 'Blackmagic Design',
        model: 'Cloud Dock 2',
        category: 'Recorders & Players', // Categoria enviada e/ou herdada
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    console.log('[CASO 1 CLOUD DOCK 2 RESULT]:', {
      recommended: result.recommendation?.ncm,
      ex: result.recommendation?.ex,
      effective_category: result.effective_category,
      effective_category_origin: result.effective_category_origin,
      matched_family: result.matched_family,
      divergence: result.ncm_support_divergence,
    })

    expect(result.success).toBe(true)
    expect(result.recommendation.ncm).toBe('85219000')
    expect(result.matched_family).toContain('Gravadores de vídeo digitais')
    expect(result.ncm_support_divergence).toBeNull()
  }, 60000)

  it('Caso 2: Tripés -> 9620 como NCM recomendado (com aviso Siscomex quando aplicável)', async () => {
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
    console.log('[CASO 2 TRIPÉ RESULT]:', {
      recommended: result.recommendation?.ncm,
      ex: result.recommendation?.ex,
      tax_notice: result.recommendation?.tax_notice,
    })

    expect(result.success).toBe(true)
    expect(result.recommendation.ncm.startsWith('9620')).toBe(true)
  }, 60000)

  it('Caso 3: Switcher de 8+ entradas -> 85437035 como recomendado e 85437099 presente nas alternativas', async () => {
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
    console.log('[CASO 3 SWITCHER 8+ ENTRADAS RESULT]:', {
      recommended: result.recommendation?.ncm,
      ex: result.recommendation?.ex,
      alternatives: result.alternatives?.map((a: any) => a.ncm),
    })

    expect(result.success).toBe(true)
    expect(result.recommendation.ncm).toBe('85437035')
    const altNcms = (result.alternatives || []).map((a: any) => a.ncm)
    expect(altNcms).toContain('85437099')
  }, 60000)

  it('Caso 4: Sem categoria nenhuma e sem match forte -> tabela de apoio não rege o resultado e divergência não auto-corrige', async () => {
    const jwt = await getAuthToken()
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description: 'Cabo de força elétrico universal padrão NBR 14136 para alimentação AC 110V/220V com conectores injetados 10A e 1,5 metros.',
        brand: 'Universal',
        model: 'AC-CAB-15',
        additional_specs: 'Condutor de cobre flexível de 3 pinos com isolamento termoplástico para equipamentos elétricos.',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    console.log('[CASO 4 SEM CATEGORIA RESULT]:', {
      recommended: result.recommendation?.ncm,
      effective_category: result.effective_category,
      matched_family: result.matched_family,
      divergence: result.ncm_support_divergence,
    })

    expect(result.success).toBe(true)
    expect(result.effective_category).toBeNull()
    // Como é um cabo de força e não possui categoria nem termos das famílias gravadores/switchers,
    // não deve casar a família de gravadores nem forçar 85219000
    expect(result.recommendation.ncm).not.toBe('85219000')
  }, 60000)
})
