import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

interface ExtractionResult {
  lens_mount?: string | null
  battery_system?: string | null
  media_slot?: string | null
  card_type?: string | null
  software_family?: string | null
  [key: string]: any
}

interface RankedCandidate {
  id: string
  confidence: 'alta' | 'media' | 'baixa'
  reason: string
  rule_id?: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const bodyText = await req.text()
    let body: any = {}
    if (bodyText) {
      try {
        body = JSON.parse(bodyText)
      } catch {
        // Ignora erro de parse
      }
    }

    const { productId, force } = body

    if (!productId) {
      return new Response(JSON.stringify({ error: 'O campo productId é obrigatório.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Configurações do Supabase ausentes no servidor.')
    }
    const supabase = createClient(supabaseUrl, supabaseKey)

    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAiKey) {
      return new Response(
        JSON.stringify({ error: 'Chave da API da OpenAI não configurada no servidor.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Buscar os detalhes do produto principal (com categoria_id e categoria texto)
    const { data: mainProduct, error: mainError } = await supabase
      .from('products')
      .select(
        'id, name, description, technical_info, category, category_id, manual_related_ids, rejected_related_ids, ai_related_ids, ai_related_meta',
      )
      .eq('id', productId)
      .maybeSingle()

    if (mainError || !mainProduct) {
      return new Response(JSON.stringify({ error: 'Produto não encontrado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rejectedIds: string[] = Array.isArray(mainProduct.rejected_related_ids)
      ? mainProduct.rejected_related_ids
      : []
    const manualIds: string[] = Array.isArray(mainProduct.manual_related_ids)
      ? mainProduct.manual_related_ids
      : []

    // Resolver category_id se ainda não estiver preenchido
    let mainCategoryId = mainProduct.category_id
    if (!mainCategoryId && mainProduct.category) {
      const { data: foundCat } = await supabase
        .from('categories')
        .select('id')
        .ilike('name', mainProduct.category.trim())
        .limit(1)
        .maybeSingle()
      if (foundCat?.id) {
        mainCategoryId = foundCat.id
      }
    }

    // ============================================================
    // CAMADA 1 — Extração de atributos-chave para product_cache
    // ============================================================
    // Atributos de compatibilidade: lens_mount, battery_system, media_slot/card_type, software_family
    const { data: existingSpecs } = await supabase
      .from('product_cache')
      .select('spec_key, spec_value, confidence')
      .eq('product_id', productId)

    const currentSpecs: Record<string, { value: string; confidence: number }> = {}
    if (existingSpecs) {
      for (const row of existingSpecs) {
        if (row.spec_key) {
          currentSpecs[row.spec_key] = {
            value: row.spec_value,
            confidence: Number(row.confidence || 0.8),
          }
        }
      }
    }

    const neededSpecs = [
      'lens_mount',
      'battery_system',
      'media_slot',
      'card_type',
      'software_family',
    ]
    const hasHighConfSpecs = neededSpecs.some(
      (k) =>
        currentSpecs[k] && currentSpecs[k].confidence >= 0.8 && currentSpecs[k].value !== 'N/A',
    )

    let extractedSpecs: ExtractionResult = {}
    if (hasHighConfSpecs && !force) {
      // Já existem specs no cache com confiança alta
      for (const k of neededSpecs) {
        if (currentSpecs[k]) {
          extractedSpecs[k] = currentSpecs[k].value
        }
      }
    } else {
      // Extrair via gpt-4o-mini
      const extractSystemPrompt = `Você é um engenheiro de produto audiovisual especialista em catalogação e compatibilidade técnica de equipamentos (Sony, Canon, Blackmagic, RED, Panasonic, DJI etc.).
Extraia os atributos de compatibilidade aplicáveis ao produto em análise.
Responda EXCLUSIVAMENTE em formato JSON com as chaves:
- lens_mount: se aplicável (ex.: "Sony E", "Canon RF", "PL", "L-Mount", "MFT", "EF"). Se não aplicável ou não mencionado, null.
- battery_system: se aplicável (ex.: "NP-F", "BP-U", "V-Mount", "Gold Mount", "LP-E6", "NP-FZ100"). Se não aplicável ou não mencionado, null.
- media_slot: tipo de slot/mídia aceita pela câmera/gravador (ex.: "CFexpress Type A", "CFexpress Type B", "SDXC UHS-II", "SxS", "CFast 2.0"). Se não aplicável, null.
- card_type: se o produto for uma mídia/cartão/leitor, o tipo (ex.: "CFexpress Type A", "CFexpress Type B", "SDXC", "SxS", "CFast"). Se não aplicável, null.
- software_family: se o produto for software/licença ou equipamento com licença opcional (ex.: "DaVinci Resolve", "Sony Catalyst", "Cinema RAW Light"). Se não aplicável, null.
- confidence: número entre 0.0 e 1.0 indicando sua certeza baseada nos dados fornecidos.`

      const extractUserPrompt = `PRODUTO:
Nome: ${mainProduct.name}
Categoria: ${mainProduct.category || 'N/A'}
Descrição: ${mainProduct.description || 'N/A'}
Info Técnica: ${mainProduct.technical_info || 'N/A'}`

      try {
        const extractResp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openAiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: extractSystemPrompt },
              { role: 'user', content: extractUserPrompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
          }),
        })

        if (extractResp.ok) {
          const raw = await extractResp.json()
          const parsed = JSON.parse(raw.choices?.[0]?.message?.content || '{}')
          const conf = typeof parsed.confidence === 'number' ? parsed.confidence : 0.85

          // Gravar cada spec relevante em product_cache
          const entriesToUpsert: any[] = []
          for (const k of neededSpecs) {
            const val = parsed[k]
            if (
              val &&
              typeof val === 'string' &&
              val.trim() !== '' &&
              val.toLowerCase() !== 'null'
            ) {
              extractedSpecs[k] = val.trim()
              entriesToUpsert.push({
                product_id: productId,
                spec_key: k,
                spec_value: val.trim(),
                confidence: conf,
                source: 'ai_extraction_layer1',
                cached_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
            }
          }

          if (entriesToUpsert.length > 0) {
            for (const entry of entriesToUpsert) {
              await supabase
                .from('product_cache')
                .upsert(entry, { onConflict: 'product_id,spec_key' } as any)
                .catch((e: any) => console.warn('Erro ao salvar em product_cache:', e.message))
            }
          }
        }
      } catch (err: any) {
        console.warn('Falha na camada 1 de extração:', err.message)
      }
    }

    // ============================================================
    // CAMADA 2 — Pré-seleção determinística via SQL das regras ativas
    // ============================================================
    // Buscar regras ativas para a categoria do produto (diretas ou bidirecionais inversas)
    let activeRules: any[] = []
    if (mainCategoryId) {
      const { data: directRules } = await supabase
        .from('related_product_rules' as any)
        .select('*')
        .eq('ativa', true)
        .eq('categoria_origem', mainCategoryId)

      const { data: bidiRules } = await supabase
        .from('related_product_rules' as any)
        .select('*')
        .eq('ativa', true)
        .eq('bidirecional', true)
        .eq('categoria_alvo', mainCategoryId)

      // Unir evitando duplicatas
      const ruleMap = new Map<string, any>()
      ;(directRules || []).forEach((r: any) => ruleMap.set(r.id, { ...r, is_inverted: false }))
      ;(bidiRules || []).forEach((r: any) => {
        if (!ruleMap.has(r.id)) {
          // Inverter origem/alvo para a busca de candidatos
          ruleMap.set(r.id, {
            ...r,
            is_inverted: true,
            target_category_effective: r.categoria_origem,
          })
        }
      })
      activeRules = Array.from(ruleMap.values()).sort(
        (a: any, b: any) => (a.prioridade || 10) - (b.prioridade || 10),
      )
    }

    // Carregar nomes de todas as categorias para permitir busca por category string também
    const { data: allCategories } = await supabase.from('categories').select('id, name')
    const categoryNameMap = new Map<string, string>()
    const categoryIdByName = new Map<string, string>()
    ;(allCategories || []).forEach((c) => {
      categoryNameMap.set(c.id, c.name)
      categoryIdByName.set(c.name.toLowerCase().trim(), c.id)
    })

    interface CandidatePoolItem {
      id: string
      name: string
      category: string | null
      description: string | null
      rule_id: string
      rule_type: string
      priority: number
      target_spec_match: boolean
      has_attribute_on_both_sides: boolean
      specs: Record<string, string>
    }

    const candidatePool: CandidatePoolItem[] = []
    const excludedIds = new Set<string>([productId, ...rejectedIds, ...manualIds])

    for (const rule of activeRules) {
      const targetCatId = rule.is_inverted ? rule.categoria_origem : rule.categoria_alvo
      const targetCatName = categoryNameMap.get(targetCatId) || ''
      const limitCandidates = Math.max(rule.max_sugestoes * 4, 12)

      // Buscar produtos da categoria alvo (pelo category_id ou pelo nome da categoria)
      let query = supabase
        .from('products')
        .select('id, name, description, category, category_id')
        .neq('id', productId)
        .eq('is_discontinued', false)

      if (targetCatId) {
        query = query.or(`category_id.eq.${targetCatId},category.ilike.%${targetCatName}%`)
      } else {
        query = query.ilike('category', `%${targetCatName}%`)
      }

      const { data: targetCandidates } = await query.limit(limitCandidates)
      if (!targetCandidates || targetCandidates.length === 0) continue

      const filterCfg = rule.filtros_compatibilidade || {}
      const specField = rule.is_inverted ? filterCfg.target_spec || filterCfg.spec : filterCfg.spec
      const targetSpecField = rule.is_inverted
        ? filterCfg.spec
        : filterCfg.target_spec || filterCfg.spec

      // Se há filtro de compatibilidade, buscar specs dos candidatos no product_cache
      const candIds = targetCandidates.map((c) => c.id).filter((id) => !excludedIds.has(id))
      let candSpecsMap: Record<string, Record<string, string>> = {}
      if (candIds.length > 0 && specField) {
        const { data: cSpecs } = await supabase
          .from('product_cache')
          .select('product_id, spec_key, spec_value')
          .in('product_id', candIds)
        if (cSpecs) {
          for (const cs of cSpecs) {
            if (!candSpecsMap[cs.product_id]) candSpecsMap[cs.product_id] = {}
            if (cs.spec_key) candSpecsMap[cs.product_id][cs.spec_key] = cs.spec_value
          }
        }
      }

      const mainSpecValue = specField ? extractedSpecs[specField] : null

      for (const cand of targetCandidates) {
        if (excludedIds.has(cand.id)) continue

        const candSpecs = candSpecsMap[cand.id] || {}
        const candSpecValue = targetSpecField ? candSpecs[targetSpecField] : null

        let match = false
        let hasBoth = false

        if (specField && mainSpecValue && candSpecValue) {
          hasBoth = true
          const normMain = mainSpecValue.toLowerCase().trim()
          const normCand = candSpecValue.toLowerCase().trim()
          if (filterCfg.match === 'contains') {
            match = normMain.includes(normCand) || normCand.includes(normMain)
          } else {
            match = normMain === normCand
          }
        } else if (!specField) {
          // Regra sem filtro de spec (ex.: Tripés para Câmeras)
          match = true
          hasBoth = false
        } else {
          // Um dos lados não tem a spec cadastrada
          match = false
          hasBoth = false
        }

        candidatePool.push({
          id: cand.id,
          name: cand.name,
          category: cand.category,
          description: cand.description,
          rule_id: rule.id,
          rule_type: rule.tipo_relacao,
          priority: rule.prioridade || 10,
          target_spec_match: match,
          has_attribute_on_both_sides: hasBoth,
          specs: candSpecs,
        })
      }
    }

    // Se nenhuma regra cadastrada gerou candidatos, fallback determinístico para mesma categoria e categorias adjacentes
    if (candidatePool.length === 0) {
      const { data: fallbackCatalog } = await supabase
        .from('products')
        .select('id, name, description, category')
        .neq('id', productId)
        .eq('is_discontinued', false)
        .limit(20)

      if (fallbackCatalog) {
        fallbackCatalog
          .filter((p) => !excludedIds.has(p.id))
          .slice(0, 10)
          .forEach((p) => {
            candidatePool.push({
              id: p.id,
              name: p.name,
              category: p.category,
              description: p.description,
              rule_id: 'legacy_fallback',
              rule_type: 'complemento',
              priority: 99,
              target_spec_match: false,
              has_attribute_on_both_sides: false,
              specs: {},
            })
          })
      }
    }

    if (candidatePool.length === 0) {
      await supabase
        .from('products')
        .update({ ai_related_ids: [], ai_related_meta: {} })
        .eq('id', productId)

      return new Response(
        JSON.stringify({ success: true, ai_related_ids: [], ai_related_meta: {} }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Limitar candidatos enviados à IA para um conjunto enxuto (máximo 20 itens)
    // Dando preferência a:
    // 1) target_spec_match = true
    // 2) menor prioridade da regra
    const sortedPool = [...candidatePool].sort((a, b) => {
      if (a.target_spec_match && !b.target_spec_match) return -1
      if (!a.target_spec_match && b.target_spec_match) return 1
      return a.priority - b.priority
    })

    // Desduplicar por ID mantendo a melhor regra
    const uniquePoolMap = new Map<string, CandidatePoolItem>()
    for (const item of sortedPool) {
      if (!uniquePoolMap.has(item.id)) {
        uniquePoolMap.set(item.id, item)
      }
    }
    const finalCandidates = Array.from(uniquePoolMap.values()).slice(0, 20)

    // ============================================================
    // CAMADA 3 — IA ranqueia e gera justificativa curta por item
    // ============================================================
    const rankSystemPrompt = `Você é um engenheiro sênior de soluções audiovisuais profissionais.
Sua missão é AVALIAR e RANQUEAR os candidatos pré-selecionados para o Produto Principal.

REGRAS ESTRITAS:
1. Você DEVE escolher SOMENTE itens da lista "CANDIDATOS PRÉ-SELECIONADOS". É PROIBIDO inventar IDs ou sugerir produtos fora da lista. Itens de fora serão sumariamente descartados.
2. Para cada item selecionado, forneça:
   - "id": string com o UUID exato do candidato
   - "confidence": "alta" | "media" | "baixa"
     * "alta": quando a compatibilidade é 100% garantida (ex: bateria do mesmo sistema, bocal idêntico, licença compatível).
     * "media": quando o item é altamente complementar/pertinente mas a spec exata não foi conferida ou é um acessório amplo.
     * "baixa": quando há dúvida sobre compatibilidade física/versão de firmware ou faltam dados técnicos.
   - "reason": justificativa técnica curta em português (ex.: "Bateria NP-FZ100 com sistema compatível", "Lente mount Sony E com cobertura Full Frame", "Cartão SDXC UHS-II para gravação 4K").
3. Ordene o array "ranked_suggestions" do mais essencial/relevante para o menos essencial.
4. Responda APENAS com um objeto JSON:
{
  "ranked_suggestions": [
    { "id": "uuid", "confidence": "alta", "reason": "..." }
  ]
}`

    const rankUserPrompt = `PRODUTO PRINCIPAL:
ID: ${mainProduct.id}
Nome: ${mainProduct.name}
Categoria: ${mainProduct.category || 'N/A'}
Atributos extraídos: ${JSON.stringify(extractedSpecs)}
Descrição: ${mainProduct.description || 'N/A'}

CANDIDATOS PRÉ-SELECIONADOS:
${finalCandidates
  .map(
    (c) =>
      `- ID: ${c.id} | Nome: ${c.name} | Cat: ${c.category || 'N/A'} | Tipo: ${c.rule_type} | MatchSpec: ${c.target_spec_match ? 'SIM' : 'NÃO'}`,
  )
  .join('\n')}`

    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: rankSystemPrompt },
          { role: 'user', content: rankUserPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    })

    if (!openAiResponse.ok) {
      const errText = await openAiResponse.text()
      console.error('Erro na chamada de ranking OpenAI:', errText)
      throw new Error('Falha ao comunicar com a inteligência artificial para ranqueamento.')
    }

    const aiData = await openAiResponse.json()
    const aiContent = aiData.choices?.[0]?.message?.content || '{}'

    let rankedSuggestions: RankedCandidate[] = []
    try {
      const parsed = JSON.parse(aiContent)
      if (Array.isArray(parsed.ranked_suggestions)) {
        rankedSuggestions = parsed.ranked_suggestions
      }
    } catch (e: any) {
      console.error('Erro ao decodificar ranking da IA:', e)
      throw new Error('Resposta da IA em formato inválido.')
    }

    // Filtrar estritamente apenas candidatos presentes no pool pré-selecionado (fora não entra)
    const validCandidateMap = new Map(finalCandidates.map((c) => [c.id, c]))
    const finalAiRelatedIds: string[] = []
    const aiRelatedMeta: Record<
      string,
      { confidence: 'alta' | 'media' | 'baixa'; reason: string; rule_id: string | null }
    > = {}

    for (const item of rankedSuggestions) {
      if (!item.id || !validCandidateMap.has(item.id)) {
        // Ignora qualquer item fora do conjunto
        continue
      }
      if (finalAiRelatedIds.includes(item.id)) continue

      const poolItem = validCandidateMap.get(item.id)!
      let confidence: 'alta' | 'media' | 'baixa' =
        item.confidence === 'alta' || item.confidence === 'media' || item.confidence === 'baixa'
          ? item.confidence
          : 'media'

      // Se a regra determinística casou specs dos dois lados com perfeição, garantir nível 'alta'
      if (poolItem.target_spec_match && poolItem.has_attribute_on_both_sides) {
        confidence = 'alta'
      } else if (!poolItem.target_spec_match && poolItem.has_attribute_on_both_sides) {
        // Se tinha spec dos dois lados e não bateu, rebaixa para baixa
        confidence = 'baixa'
      }

      finalAiRelatedIds.push(item.id)
      aiRelatedMeta[item.id] = {
        confidence,
        reason: item.reason || 'Produto complementar selecionado por inteligência artificial.',
        rule_id: poolItem.rule_id || null,
      }
    }

    // 5. Persistir em products: ai_related_ids + ai_related_meta
    const { error: updateError } = await supabase
      .from('products')
      .update({
        ai_related_ids: finalAiRelatedIds,
        ai_related_meta: aiRelatedMeta,
      })
      .eq('id', productId)

    if (updateError) {
      console.error('Erro ao atualizar ai_related_ids/meta em products:', updateError)
      throw new Error('Não foi possível salvar os produtos relacionados no banco de dados.')
    }

    return new Response(
      JSON.stringify({
        success: true,
        productId,
        ai_related_ids: finalAiRelatedIds,
        ai_related_meta: aiRelatedMeta,
        extracted_specs: extractedSpecs,
        total_candidates_analyzed: finalCandidates.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Erro inesperado em generate-related-products:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Ocorreu um erro interno no servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
