import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// REGRESSÃO OBRIGATÓRIA — PONTE BILÍNGUE DE CATEGORIA NO classify-ncm (3.8.0-build.656)
// Cobre os 5 cenários aprovados da camada de categoria:
//  1) produto imp_sim vinculado ao site herda a categoria do vínculo (imp_sim_link)
//  2) produto em 'Cables & Connectors' recebe 8544.42.00 / 8543.70.99 como candidatos
//  3) Canon EOS R6 (dados corrigidos) NÃO herda Lenses nem por SKU nem por vínculo
//  4) chamada sem categoria nenhuma segue idêntica ao comportamento por texto+embeddings
//  5) produto em 'Tripods & Rigs' recebe a família de tripés por categoria, com 96200000 e aviso Siscomex
// A análise NCM é SEMPRE indicativa: nada aqui exige auto-correção, apenas presença de candidatos
// e telemetria de categoria (effective_category / effective_category_origin / category_acceptable_*).

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('classify-ncm — camada de categoria (ponte bilíngue EN↔PT) — regressão', () => {
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

  async function classify(payload: Record<string, any>) {
    const jwt = await getAuthToken()
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ top_n: 15, save_log: true, ...payload }),
    })
    expect(res.status).toBe(200)
    return res.json()
  }

  it('Health check confirma build 3.8.0-build.656 com bilingual_category_bridge ativa', async () => {
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm?health=true`, {
      method: 'GET',
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    console.log('[HEALTH CHECK PONTE BILÍNGUE]:', data)
    expect(data.version).toBe('3.8.0-build.656')
    expect(data.features).toContain('bilingual_category_bridge')
    expect(data.features).toContain('category_acceptable_ncms_injection')
  })

  it('Cenário 1: produto imp_sim vinculado ao site herda a categoria do vínculo (imp_sim_link)', async () => {
    // Canon EOS C50 em imp_sim_products com vínculo source_site_product_id → products (Cameras)
    const result = await classify({
      imp_sim_product_id: 'c57dd417-f67a-4715-a072-b063e69e9e28',
      product_description:
        'Canon EOS C50 Full-Frame Cinema Camera (Canon RF). Câmera de cinema full-frame com sensor CMOS, gravação interna e montagem RF.',
      brand: 'Canon',
      model: 'EOS C50',
    })

    console.log('[CENÁRIO 1 VÍNCULO IMP_SIM]:', {
      effective_category: result.effective_category,
      effective_category_origin: result.effective_category_origin,
      recommended: result.recommendation?.ncm,
      matched_family: result.matched_family,
    })

    expect(result.success).toBe(true)
    expect(result.effective_category).toBe('Cameras')
    expect(result.effective_category_origin).toBe('imp_sim_link')
  }, 60000)

  it('Cenário 2: produto em "Cables & Connectors" recebe 8544.42.00 e 8543.70.99 como candidatos', async () => {
    // Chamada SEM imp_sim_product_id e SEM product_id: a categoria vem do payload (override do chamador)
    // e a ponte bilíngue deve casar 'Cables & Connectors' (EN) com a família 'Cabos e chicotes...' (PT).
    const result = await classify({
      product_description:
        'Cabo SDI BNC 12G de alta velocidade com conectores BNC banhados a ouro, 3 metros, para transmissão de vídeo serial digital em broadcast.',
      brand: 'Canare',
      model: 'L-4CFB',
      category: 'Cables & Connectors',
    })

    const altNcms = (result.alternatives || []).map((a: any) => String(a.ncm).replace(/\D/g, ''))
    const evaluatedNcms = (result.evaluated_candidates || []).map((c: any) =>
      String(c.ncm || '').replace(/\D/g, ''),
    )

    console.log('[CENÁRIO 2 CABOS E CONECTORES]:', {
      effective_category: result.effective_category,
      effective_category_origin: result.effective_category_origin,
      matched_family: result.matched_family,
      recommended: result.recommendation?.ncm,
      alternatives: altNcms,
      category_acceptable_ncms: result.category_acceptable_ncms,
      evaluated: evaluatedNcms,
    })

    expect(result.success).toBe(true)
    expect(result.effective_category).toBe('Cables & Connectors')
    // A família 'Cabos e chicotes...' deve casar por categoria (ponte bilíngue cable→cabo/conector)
    expect(result.matched_family).toContain('Cabos')
    // 8544.42.00 (cabos montados com conectores) e 8543.70.99 (residual de áudio/vídeo) presentes
    const allCandidateNcms = Array.from(new Set([...altNcms, ...evaluatedNcms]))
    expect(allCandidateNcms).toContain('85444200')
    expect(allCandidateNcms).toContain('85437099')
  }, 60000)

  it('Cenário 3: Canon EOS R6 corrigido NÃO herda Lenses por SKU 3682C002 nem por vínculo', async () => {
    // Após a correção de dados (source_site_product_id = NULL e sku = NULL), a chamada com
    // imp_sim_product_id do R6 NÃO deve resolver categoria alguma (origem 'none').
    const { data: impRows, error: impErr } = await supabase
      .from('imp_sim_products')
      .select('id, name, sku, source_site_product_id')
      .eq('name', 'Canon EOS R6 Mirrorless Camera (Body Only)')
      .limit(1)

    expect(impErr).toBeNull()
    expect(impRows).toBeDefined()
    expect(impRows!.length).toBe(1)
    const impRow = impRows![0]
    // Invariante de dados: vínculo órfão e SKU da lente RF 15-35mm limpos
    expect(impRow.source_site_product_id).toBeNull()
    expect(impRow.sku).toBeNull()

    const result = await classify({
      imp_sim_product_id: impRow.id,
      product_description:
        'Canon EOS R6 Mirrorless Camera (Body Only). Câmera mirrorless full-frame de 20 MP com sensor CMOS, gravação 4K e montagem RF.',
      brand: 'Canon',
      model: 'EOS R6',
    })

    console.log('[CENÁRIO 3 R6 SEM VÍNCULO]:', {
      effective_category: result.effective_category,
      effective_category_origin: result.effective_category_origin,
      recommended: result.recommendation?.ncm,
      matched_family: result.matched_family,
    })

    expect(result.success).toBe(true)
    // Sem categoria herdada de vínculo ou SKU
    expect(result.effective_category).toBeNull()
    expect(result.effective_category_origin).toBe('none')
    expect(result.category_acceptable_ncms).toEqual([])
    // NÃO pode ser enquadrado como objetiva (9002) nem herdar a categoria Lenses
    expect(String(result.recommendation?.ncm || '').startsWith('9002')).toBe(false)
  }, 60000)

  it('Cenário 4: chamada sem categoria nenhuma segue idêntica (texto + embeddings, sem injeção de categoria)', async () => {
    const result = await classify({
      product_description:
        'Fonte de alimentação de 16V 8A com conector de 4 pinos para câmera de vídeo profissional, entrada AC 100-240V.',
      brand: 'Genérico',
      model: 'PSU-16V8A',
    })

    console.log('[CENÁRIO 4 SEM CATEGORIA]:', {
      effective_category: result.effective_category,
      effective_category_origin: result.effective_category_origin,
      category_acceptable_ncms: result.category_acceptable_ncms,
      category_acceptable_source: result.category_acceptable_source,
      recommended: result.recommendation?.ncm,
    })

    expect(result.success).toBe(true)
    expect(result.effective_category).toBeNull()
    expect(result.effective_category_origin).toBe('none')
    expect(result.category_acceptable_ncms).toEqual([])
    expect(result.category_acceptable_source).toBeNull()
  }, 60000)

  it('Cenário 5: produto em "Tripods & Rigs" recebe a família de tripés por categoria com 96200000 e aviso Siscomex', async () => {
    // Categoria do payload (override do chamador) em inglês — sem a ponte bilíngue,
    // 'Tripods & Rigs' não casaria com 'Tripés, pedestais e suportes...' (PT).
    const result = await classify({
      product_description:
        'Sachtler Video 18 S2 Fluid Head and Carbon Fiber Tripod System. Tripé de vídeo profissional com cabeça fluida, pernas de fibra de carbono e espalhador de solo.',
      brand: 'Sachtler',
      model: 'Video 18 S2',
      additional_specs:
        'Sistema mecânico de suporte, fixação e estabilização de câmera com tripé de pernas duplas.',
      category: 'Tripods & Rigs',
    })

    const evaluatedNcms = (result.evaluated_candidates || []).map((c: any) =>
      String(c.ncm || '').replace(/\D/g, ''),
    )
    const altNcms = (result.alternatives || []).map((a: any) => String(a.ncm).replace(/\D/g, ''))

    console.log('[CENÁRIO 5 TRIPÉS]:', {
      effective_category: result.effective_category,
      effective_category_origin: result.effective_category_origin,
      matched_family: result.matched_family,
      recommended: result.recommendation?.ncm,
      tax_notice: result.recommendation?.tax_notice,
      evaluated: evaluatedNcms,
      alternatives: altNcms,
    })

    expect(result.success).toBe(true)
    expect(result.effective_category).toBe('Tripods & Rigs')
    expect(result.matched_family).toContain('Trip')
    // 96200000 (tripés, monopés e artigos semelhantes) presente entre os candidatos avaliados
    const allCandidateNcms = Array.from(new Set([...evaluatedNcms, ...altNcms]))
    expect(allCandidateNcms).toContain('96200000')
    // Aviso Siscomex presente quando o NCM recomendado é 9620 (capítulo fora da base de tarifas)
    if (String(result.recommendation?.ncm || '').startsWith('9620')) {
      const notices = JSON.stringify(result.recommendation || {}) + JSON.stringify(result)
      expect(notices.toLowerCase()).toContain('siscomex')
    }
  }, 60000)
})
