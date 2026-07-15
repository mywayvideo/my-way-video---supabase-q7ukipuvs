import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}
import { getActiveAgents, generateResponse } from './intelligence.ts'
import {
  sanitizeInput,
  isInstitutionalQuery,
  checkKeywordRelevance,
  extractProducts,
  buildProductContext,
  mergeProductResults,
  extractEntities,
  removeStopWords,
  searchAllEntities,
  isTechnicalQuery,
  extractFilters,
  applyZoomFilter,
  detectComparison,
  generateFallbackTerms,
  isGenericSearch,
  filterAccessories,
  cleanPortugueseGenericWords,
} from './search-utils.ts'

const OUT_OF_SCOPE_MESSAGE =
  'Desculpe, só posso responder perguntas relacionadas com o nosso catálogo de produtos e serviços.'

const HP_GENERIC_FILTER_WORDS = new Set([
  'camera',
  'câmera',
  'cameras',
  'câmeras',
  'produto',
  'produtos',
  'equipamento',
  'equipamentos',
  'buscar',
  'pesquisar',
  'procurar',
  'quero',
  'preciso',
  'gostaria',
  'ache',
  'encontre',
  'mostrar',
  'ver',
])

function generalizeForHpSearch(query: string): string {
  const cleaned = cleanPortugueseGenericWords(query)
  const words = cleaned.split(/\s+/).filter((w) => !HP_GENERIC_FILTER_WORDS.has(w.toLowerCase()))
  const result = words.join(' ').trim()
  return result.length > 0 ? result : query
}

function logCascade(stage: string, type: string, matched: boolean, query: string, extra?: string) {
  const ts = new Date().toISOString()
  const extraStr = extra ? ` ${extra}` : ''
  console.log(
    `[cascata] Stage ${stage} executed type=${type} matched=${matched}${extraStr} ts=${ts} query="${query}"`,
  )
}

// ============================================================
// PP INTENT CLASSIFIER — Determina intenção do usuário em Product Page
// Keywords/regex, sem chamada externa, custo zero, ~35 linhas
// ============================================================
type PPIntent =
  | 'TECHNICAL'
  | 'COMPARE'
  | 'ACCESSORY'
  | 'PRICE'
  | 'INSTITUTIONAL'
  | 'RECOMMENDATION'
  | 'GENERIC'

function classifyPPIntent(query: string): PPIntent {
  const q = query.toLowerCase().trim()

  // 1. INSTITUTIONAL — loja, horário, garantia, frete
  if (
    /^(qual (o )?hor[áa]rio|onde fica|como (devolver|comprar)|tem (garantia|frete|telefone)|endereço|telefone|whatsapp|prazo de entrega|política de|troca|forma de pagamento)/i.test(
      q,
    )
  )
    return 'INSTITUTIONAL'

  // 2. PRICE / DISPONIBILIDADE
  if (
    /\b(preç[o]|quanto custa|valor|disponibilidade|estoque|prazo|entrega|economia|mais barato|mais caro|custa)\b/i.test(
      q,
    )
  )
    return 'PRICE'

  // 3. TECHNICAL — especificações técnicas do produto atual
  if (
    /\b(resolução|frame rate|fps|iso|codec|formato|sensor|conectividade|hdmi|sdi|peso|dimensão|bit rate|log|raw|cor|color profile|bitrate|profundidade|quantos fps|qual a resolução|qual o peso|qual a conectividade|qual a saida|qual a entrada|quantos)/i.test(
      q,
    )
  )
    return 'TECHNICAL'

  // 4. COMPARE — COMPARAÇÃO com outro produto
  // Inclui: "compare com", "diferença para", "vs", "versus", "melhor que", "ou a/o [produto]"
  if (
    /(compare|compara[çc][aã]o|diferença|vs\.|versus|melhor que|superior|inferior|qual a melhor|qual é melhor|contra|ou a\b|ou o\b)/i.test(
      q,
    )
  )
    return 'COMPARE'

  // 5. RECOMMENDATION — recomendação de uso
  if (
    /(recomenda|(é|serve) (boa|bom|ideal|melhor|adequad[ao]) para|indicad[ao] para|serve para|para que (serve|é)|o que (acha|você acha)|para qual|qual (uso|aplicação|finalidade))/i.test(
      q,
    )
  )
    return 'RECOMMENDATION'

  // 6. ACCESSORY — acessórios compatíveis
  // A lista cobre >95% dos acessórios comuns em audiovisual profissional

  if (
    /\b(trip[ée]|lente|bateria|cartão|memória|microfone|monitor externo|cabo|case|grip|luzeira|mochila|filtro|suporte|adaptador|carregador|fonte|controlador|estabilizador|gimbal|quick release|placa|base|alça|handle|capacete|suporte de|montagem)/i.test(
      q,
    )
  )
    return 'ACCESSORY'

  // 7. GENERIC — tudo que não se encaixa acima
  return 'GENERIC'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    let body: any = null
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    let query = sanitizeInput(body?.query || '')
    const session_id = typeof body?.session_id === 'string' ? body.session_id : null
    const queryMentionsBrazil =
      /(?:brasil|brazil|sp|são paulo|entreg[ae]|frete|prazo|receber|nacional|nacionalizado|nacionalizados|nacionalizada|nacionalizadas|nacionalizad[oa]s|nota fiscal|nf|importado|dolar|real|reais|brl|usd|moeda|cotação|cotacao|conversão|conversao|preço no brasil|preco no brasil|preço brasil|preco brasil|entregar|entrega brasil|preço final|preco final|preço nacional|preco nacional|preço internac|preco internac)/i.test(
        query,
      )
    const lastReferencedProductId = body?.currentProductId || null
    const productPagePrompt =
      typeof body?.productPagePrompt === 'string' ? body.productPagePrompt : null
    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
    const execution_id = crypto.randomUUID()
    console.log(`[ai-search][execution] execution_id=${execution_id} query="${query}"`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    console.log(
      `[ai-search][env-check] SUPABASE_URL present=${!!supabaseUrl} length=${supabaseUrl.length} | SUPABASE_SERVICE_ROLE_KEY present=${!!supabaseServiceKey} length=${supabaseServiceKey.length}`,
    )

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const isHPMode = !lastReferencedProductId
    const secondarySearchTerm = isHPMode ? generalizeForHpSearch(query) : query
    const searchPromise: Promise<any[]> = isHPMode
      ? supabase
          .rpc('search_products_v2', { search_term: secondarySearchTerm, boost_multiplier: 1.0 })
          .then(({ data }: any) => (Array.isArray(data) ? data : []))
      : Promise.resolve([])

    let history: any[] = []
    if (session_id) {
      const { data: histRows } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', session_id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (Array.isArray(histRows))
        history = histRows.reverse().map((row) => ({ role: row.role, content: row.content }))
    }

    const { data: agentSettings } = await supabase
      .from('ai_agent_settings')
      .select('*')
      .maybeSingle()
    console.log(
      `[ai-search] agentSettings found=${!!agentSettings} system_prompt_length=${(agentSettings?.system_prompt || '').length} settings_keys=${agentSettings ? Object.keys(agentSettings).join(',') : 'null'}`,
    )
    const { data: aiSettings } = await supabase.from('ai_settings').select('*').maybeSingle()
    const { data: globalSettings } = await supabase.from('settings').select('key, value')
    const { data: companyInfoRows } = await supabase.from('company_info').select('content, type')
    const { data: avproKeywords } = await supabase
      .from('avpro_keywords')
      .select('keyword, weight, is_blocking')
    const { data: manufacturers } = await supabase.from('manufacturers').select('name')
    const manufacturerList = manufacturers ? manufacturers.map((m) => m.name).join(', ') : ''

    const globalSettingsMap: Record<string, string> = {}
    if (Array.isArray(globalSettings))
      for (const s of globalSettings) if (s?.key && s?.value) globalSettingsMap[s.key] = s.value

    const institutionalContext =
      Array.isArray(companyInfoRows) && companyInfoRows.length > 0
        ? companyInfoRows
            .filter((r: any) => r.type === 'ai_knowledge' || r.type === 'footer_about')
            .map((r: any) => `[${r.type || 'info'}] ${r.content || ''}`)
            .join('\n')
        : (companyInfoRows as any)?.content || ''
    const keywordList = Array.isArray(avproKeywords) ? avproKeywords : []

    const activeAgents = await getActiveAgents(supabase)
    if (activeAgents.length === 0)
      return new Response(JSON.stringify({ error: 'Nenhum provedor de IA ativo configurado.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })

    // Contextual product data (moved before cascade to enable technical intent detection)
    let contextualProductData = null
    if (lastReferencedProductId) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select(
          'id, name, sku, category, description, technical_info, image_url, manufacturer_id, manufacturers(name), price_usd, price_nationalized_sales, price_nationalized_currency, price_usa_rebate',
        )
        .eq('id', lastReferencedProductId)
        .maybeSingle()
      if (!productError && product) {
        let techInfo = product.technical_info
        try {
          if (techInfo) techInfo = JSON.parse(techInfo)
        } catch {}
        contextualProductData = {
          ...product,
          technical_info: techInfo,
          manufacturer: (product.manufacturers as any)?.name || 'N/A',
        }
      }
    }

    const currentProductContext = contextualProductData
      ? {
          id: (contextualProductData.id as string) || lastReferencedProductId || '',
          name: (contextualProductData.name as string) || '',
          manufacturer: (contextualProductData.manufacturer as string) || '',
          category: (contextualProductData.category as string) || '',
        }
      : null

    // Pronoun Resolution — replace demonstrative pronouns with actual product name on Product Page
    if (contextualProductData && (contextualProductData.id || lastReferencedProductId)) {
      const ppProductId = contextualProductData.id || lastReferencedProductId
      const ppProductName = contextualProductData.name || ''
      if (ppProductName) {
        const pronounPatterns = [
          'essa camera',
          'esta camera',
          'essa',
          'esta',
          'este produto',
          'esse produto',
          'esse',
          'dessa',
          'desta',
          'nessa',
          'nesta',
          'this camera',
          'this product',
          'this',
        ]
        const lowerQuery = query.toLowerCase()
        for (const pattern of pronounPatterns) {
          const patternLower = pattern.toLowerCase()
          const idx = lowerQuery.indexOf(patternLower)
          if (idx !== -1) {
            const beforeOk = idx === 0 || !/[a-zà-ÿ]/i.test(query[idx - 1])
            const afterIdx = idx + patternLower.length
            const afterOk = afterIdx >= query.length || !/[a-zà-ÿ]/i.test(query[afterIdx])
            if (beforeOk && afterOk) {
              query = query.slice(0, idx) + ppProductName + query.slice(afterIdx)
              console.log(`[ai-search] PP pronoun resolved: "${pattern}" → ID=${ppProductId}`)
              break
            }
          }
        }
      }
    }

    // Verifica se a pergunta técnica é sobre produtos/acessórios do catálogo
    function isAccessoryQuery(query: string): boolean {
      var q = query
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')

      // === STORAGE / MÍDIA / MEMÓRIA ===
      var storageTerms = [
        'memoria',
        'memory',
        'memoria',
        'cartao',
        'card',
        'tarjeta',
        'armazenamento',
        'storage',
        'almacenamiento',
        'cfexpress',
        'sd',
        'sdxc',
        'cfast',
        'axs',
        's66',
        'tough',
        'vpg',
        'ssd',
        'nvme',
        'flash',
        'reader',
        'leitor',
        'lector',
        'disco',
        'disk',
        'hd',
      ]
      // === CAMERAS / CÂMERAS (linhas) ===
      var cameraTerms = [
        'blackmagic',
        'ursa',
        'pocket',
        'cinema camera',
        'camara cinema',
        'davinci',
        'resolve',
        'hyperdeck',
        'videohub',
        'decklink',
        'ultrastudio',
        'teranex',
        'smartview',
        'smartscope',
        'web presenter',
        'video assist',
        'atem',
        'studio camera',
        'micro converter',
        'mini converter',
        'aja',
        'kona',
        'io',
        'ki pro',
        'helo',
        'bridge live',
        'fido',
        'datavideo',
        'nvs',
        'tbc',
        'ptc',
        'sony',
        'venice',
        'veneza',
        'burano',
        'pxw',
        'fs',
        'fx',
        'pvm',
        'lmd',
        'bvm',
        'alpha',
        'a7',
        'a1',
        'canon',
        'cinema eos',
        'eos r',
        'eos',
        'c70',
        'c300',
        'c400',
        'c500',
        'r5',
        'r3',
        'dulens',
        'mini prime',
        'apo',
        'camera',
        'camara',
        'filmadora',
        'camcorder',
      ]
      // === LENSES / LENTES ===
      var lensTerms = [
        'lente',
        'lens',
        'lente',
        'objetiva',
        'fisheye',
        'olho de peixe',
        'ojo de pez',
        'grande angular',
        'wide angle',
        'gran angular',
        'teleobjetiva',
        'telephoto',
        'tele',
        'teleobjetivo',
        'zoom',
        'prime',
        'fija',
        'anamorfico',
        'anamorphic',
        'anamorfico',
        'macro',
        'macro',
        'e mount',
        'e-mount',
        'ef mount',
        'rf mount',
        'pl mount',
        'sel',
        'fe',
        'cn-e',
        'g master',
        'conversor de lente',
        'lens converter',
        'adaptador de lente',
      ]
      // === AUDIO / ÁUDIO ===
      var audioTerms = [
        'microfone',
        'microphone',
        'microfono',
        'shotgun',
        'lapela',
        'lavalier',
        'boom',
        'sennheiser',
        'ew',
        'evolution',
        'g4',
        'g3',
        'mke',
        'mkh',
        'sk',
        'sr',
        'ek',
        'xsw',
        'wireless',
        'inalambrico',
        'sem fio',
        'receiver',
        'receptor',
        'transmitter',
        'transmissor',
        'audio',
        'audio',
        'som',
        'sound',
        'sonido',
        'headset',
        'headphone',
        'fone',
        'auricular',
        'mixer',
        'mesa de som',
        'console',
      ]
      // === POWER / ALIMENTAÇÃO ===
      var powerTerms = [
        'bateria',
        'battery',
        'bateria',
        'fonte',
        'power supply',
        'fuente',
        'carregador',
        'charger',
        'cargador',
        'power',
        'alimentacao',
        'alimentacion',
        'adaptador',
        'adapter',
        'power bank',
        'powerbank',
        'vmount',
        'v-mount',
        'v mount',
        'gold mount',
        'anton bauer',
      ]
      // === CABLES / CABOS ===
      var cableTerms = [
        'cabo',
        'cable',
        'cable',
        'hdmi',
        'sdi',
        'bnc',
        'xlr',
        'usb',
        'thunderbolt',
        'powercon',
        'ethernet',
        'sfp',
        'adaptador',
        'adapter',
        'adaptador',
      ]
      // === SUPPORT / TRIPÉ / SUPORTE ===
      var supportTerms = [
        'tripe',
        'tripod',
        'tripode',
        'monope',
        'monopod',
        'monopode',
        'cabeca',
        'head',
        'cabeza',
        'fluid head',
        'quick release',
        'placa rapida',
        'slider',
        'dolly',
        'carrinho',
        'shoulder',
        'ombro',
        'rig',
        'cage',
        'gaiola',
        'suporte',
        'mount',
        'soporte',
        'alca',
        'strap',
        'correa',
        'grip',
        'handle',
        'asa',
        'case',
        'maleta',
        'bag',
        'bolsa',
        'mochila',
        'backpack',
      ]
      // === MONITOR / DISPLAY ===
      var displayTerms = [
        'monitor',
        'monitor',
        'display',
        'tela',
        'pantalla',
        'screen',
        'visor',
        'viewfinder',
        'evf',
        'smartview',
        'smartscope',
        'pvm',
        'lmd',
        'bvm',
        'video assist',
      ]
      // === FILTERS / FILTROS ===
      var filterTerms = [
        'filtro',
        'filter',
        'filtro',
        'nd',
        'ir',
        'polarizador',
        'polarizer',
        'difusao',
        'diffusion',
        'difusion',
        'variável',
        'variable',
        'variable',
        'black pro mist',
        'promist',
        'mist',
      ]
      // === VIDEO PROCESSING / CONVERSÃO ===
      var processingTerms = [
        'switcher',
        'conversor',
        'converter',
        'convertidor',
        'scaler',
        'escalador',
        'distribution',
        'distribuidor',
        'distribucion',
        'amplifier',
        'amplificador',
        'da',
        'multiviewer',
        'multi viewer',
        'router',
        'matrix',
        'capture',
        'captura',
        'playback',
        'production',
        'producao',
      ]
      // === RECORDING / GRAVAÇÃO ===
      var recordingTerms = [
        'recorder',
        'gravador',
        'grabador',
        'deck',
        'hyperdeck',
        'ki pro',
        'capture card',
        'placa de captura',
      ]
      // === LIGHTING / ILUMINAÇÃO ===
      var lightingTerms = [
        'luz',
        'light',
        'luz',
        'iluminacao',
        'lighting',
        'iluminacion',
        'led',
        'softbox',
        'lanterna',
        'flash',
        'strobo',
      ]
      // === REMOTE / CONTROLE ===
      var remoteTerms = [
        'remote',
        'controle',
        'control',
        'controlador',
        'panel',
        'painel',
        'controlador',
        'lanc',
        'trigger',
      ]
      // === GENERAL ACCESSORIES / ACESSÓRIOS GERAIS ===
      var generalTerms = [
        'acessorio',
        'accessory',
        'accesorio',
        'kit',
        'bundle',
        'pacote',
        'fita',
        'tape',
        'cinta',
        'cartridge',
        'cartucho',
        'lto',
        'archive',
      ]
      // === COMPATIBILITY / COMPATIBILIDADE ===
      var compatibilityTerms = [
        'compativel',
        'compatible',
        'compatible',
        'compatibilidad',
        'indicado',
        'recomendado',
        'recommended',
        'recomendado',
        'funciona',
        'works with',
        'funciona con',
        'diferenca',
        'difference',
        'diferencia',
        'vs',
        'versus',
        'ou',
        'comprar',
        'buy',
        'comprar',
        'preco',
        'price',
        'precio',
        'valor',
        'quanto custa',
        'cuanto cuesta',
      ]

      var allTerms = ([] as string[]).concat(
        storageTerms,
        cameraTerms,
        lensTerms,
        audioTerms,
        powerTerms,
        cableTerms,
        supportTerms,
        displayTerms,
        filterTerms,
        processingTerms,
        recordingTerms,
        lightingTerms,
        remoteTerms,
        generalTerms,
        compatibilityTerms,
      )

      for (var i = 0; i < allTerms.length; i++) {
        if (q.indexOf(allTerms[i]) >= 0) return true
      }
      return false
    }

    // Technical Intent Detection — skip search cascade only for non-product technical queries
    const isNonProductQuery = isTechnicalQuery(query) && !isAccessoryQuery(query)
    const skipSearch = !!lastReferencedProductId && !!contextualProductData && isNonProductQuery
    if (skipSearch) {
      console.log(`[ai-search] Skipping cascade for non-product technical question: "${query}"`)
    }

    // Stage A: Stop-words removal (skipped if technical intent detected)
    let searchQuery = query
    if (!skipSearch) {
      const stopWords = Array.isArray(aiSettings?.custom_stop_words)
        ? aiSettings.custom_stop_words
        : []
      searchQuery = removeStopWords(query, stopWords) || query
      logCascade('A', 'stopwords', true, query, `cleaned="${searchQuery}"`)
    }

    let ppIntent: PPIntent = 'GENERIC'

    // Comparison Detection — detects "com a", "com o", "vs.", "versus", or "e" patterns
    let searchEntities: string[] = [searchQuery]
    let isComparisonDetected = false
    if (!skipSearch) {
      const comparison = detectComparison(query)
      if (comparison.isComparison) {
        isComparisonDetected = true
        searchEntities = comparison.terms
        console.log(`[ai-search] COMPARISON DETECTED terms=${JSON.stringify(comparison.terms)}`)
      } else if (lastReferencedProductId) {
        // === PP INTENT CLASSIFICATION ===
        // Determina a intenção do usuário ANTES de qualquer extração
        ppIntent = classifyPPIntent(query)
        console.log(`[ai-search] PP intent detected: ${ppIntent}`)

        // === COMPARE MODE: extrai o nome do produto concorrente ===
        // Só executa regex em modo COMPARE — para evitar falsos positivos
        if (ppIntent === 'COMPARE') {
          const patterns = [
            /(?:com a|com o|para a|para o|diferença (?:para|entre) a|diferença (?:para|entre) o)\s+(.+)/i,
            /(?:e a|e o)\s+(.+)/i,
            /(?:da|do)\s+(.+)/i,
          ]
          let targetProduct: string | null = null
          for (const pattern of patterns) {
            const match = query.match(pattern)
            if (match && match[1]) {
              targetProduct = match[1]
                .trim()
                .replace(/[.,;:!?\s]+$/, '')
                .trim()
              if (targetProduct.length > 0) break
            }
          }
          if (targetProduct) {
            searchQuery = targetProduct
            searchEntities = [searchQuery]
            console.log(`[ai-search] PP compare mode: extracted target term="${targetProduct}"`)
          }
        }

        // === RECOMMENDATION / COMPATIBILITY MODE ===
        // Extrai o nome do produto mencionado após "para" ou "com"
        // Ex: "esse tripé é adequado para a sony fx3?" → extrai "sony fx3"
        if (ppIntent === 'RECOMMENDATION') {
          // Tenta extrair o produto mencionado após "para a/o", "com a/o", "para"
          const patterns = [/(?:para a|para o|para|com a|com o|com)\s+(.+?)(?:\?|\.|,|$)/i]
          let targetProduct: string | null = null
          for (const pattern of patterns) {
            const match = query.match(pattern)
            if (match && match[1]) {
              targetProduct = match[1]
                .trim()
                .replace(/[.,;:!?\s]+$/, '')
                .trim()
              // Só aceita se for um nome curto (produto, não frase)
              if (targetProduct.length > 0 && targetProduct.length < 50) break
              targetProduct = null
            }
          }
          if (targetProduct) {
            searchQuery = targetProduct
            searchEntities = [searchQuery]
            console.log(`[ai-search] PP RECOMMENDATION: extracted target term="${targetProduct}"`)
          } else {
            console.log(`[ai-search] PP RECOMMENDATION: no product name extracted from query`)
          }
        }
      }
    }

    // Entity Extraction (skipped if technical intent or comparison detected)
    if (!skipSearch && !isComparisonDetected && searchQuery.trim().length > 0) {
      searchEntities = await extractEntities(searchQuery, openaiKey)

      if (searchEntities.length === 1 && searchEntities[0].length > 30) {
        const longEntity = searchEntities[0]
        const words = longEntity.split(/\s+/).slice(0, 3).join(' ')
        if (words.length > 0 && words.length < longEntity.length) {
          searchEntities.push(words)
          console.log(
            `[ai-search] added short fallback: "${words}" from long entity "${longEntity}"`,
          )
        }
      }
    }

    // Limpa caracteres especiais dos termos de busca
    searchEntities = searchEntities
      .map(function (term) {
        return term
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[?.,;:!]/g, '')
          .trim()
      })
      .filter(function (term) {
        return term.length > 0
      })

    // Expansão de termos de busca para alcançar produtos com nomenclatura diferente
    var expandedTerms = []
    for (var etx = 0; etx < searchEntities.length; etx++) {
      var term = searchEntities[etx]

      // 1. Se o termo for uma frase longa, extrai palavras-chave individuais
      if (term.length > 30) {
        var lowerTerm = term.toLowerCase()
        // Palavras relevantes para extrair da frase
        var memoryWords = ['memoria', 'cartao', 'armazenamento', 'compativel', 'indicado']
        for (var mw = 0; mw < memoryWords.length; mw++) {
          if (lowerTerm.indexOf(memoryWords[mw]) >= 0) {
            if (expandedTerms.indexOf(memoryWords[mw]) < 0) expandedTerms.push(memoryWords[mw])
          }
        }

        // 2. Remove stop words para gerar termos menores
        var stopWords = [
          'qual',
          'a',
          'o',
          'e',
          'de',
          'da',
          'do',
          'para',
          'com',
          'que',
          'essa',
          'esse',
          'seu',
          'sua',
          'meu',
          'minha',
          'tem',
          'uma',
          'um',
          'no',
          'na',
          'em',
        ]
        var words = lowerTerm.split(/\s+/)
        for (var wj = 0; wj < words.length; wj++) {
          var w = words[wj]
          if (w.length > 2 && stopWords.indexOf(w) < 0) {
            if (expandedTerms.indexOf(w) < 0) expandedTerms.push(w)
          }
        }
      } else {
        // Termo curto: mapeamento normal de termos para variações
        expandedTerms.push(term)
        if (term === 'cartao' || term === 'cartão' || term === 'memoria' || term === 'memória') {
          var memoryAdd = ['cfexpress', 'card', 'memory', 'tough', 'axs', 's66', 'vpg']
          for (var ma = 0; ma < memoryAdd.length; ma++) {
            if (expandedTerms.indexOf(memoryAdd[ma]) < 0) expandedTerms.push(memoryAdd[ma])
          }
        }
      }
    }
    searchEntities = expandedTerms.filter(function (t, idx, self) {
      return self.indexOf(t) === idx && t.length > 0
    })
    console.log('[ai-search] expanded searchEntities:', JSON.stringify(searchEntities))

    // Product Search (Stage C preparation) with deterministic entity fallback
    let level1Products: any[] = []

    if (!skipSearch && searchQuery.trim().length > 0) {
      const searchFn = async (term: string): Promise<any[]> => {
        console.log(`[ai-search] searchFn executing with term: "${term}"`)
        const { data: rpcData, error: rpcError } = await supabase.rpc('execute_ai_search_v3', {
          search_term: term,
        })
        const hasStock = rpcData && Array.isArray((rpcData as any)?.stock)
        const stockLen = hasStock ? (rpcData as any).stock.length : 0
        console.log(
          `[searchFn] term="${term}" rpcData type=${typeof rpcData} isArray=${Array.isArray(rpcData)} hasStock=${hasStock} stockLen=${stockLen}`,
        )
        console.log(
          `[ai-search][rpc-diagnostic] term="${term}" | typeof data=${typeof rpcData} | dataPreview=${JSON.stringify(rpcData).slice(0, 200)}`,
        )
        console.log(
          `[ai-search][rpc-diagnostic] error=${rpcError ? JSON.stringify(rpcError) : 'null'}`,
        )
        if (rpcError) {
          console.error(
            `[ai-search][rpc-error] execute_ai_search_v3 failed for term="${term}" | fullError=${JSON.stringify(rpcError)}`,
          )
          return []
        }
        const products = extractProducts(rpcData)
        console.log(`[ai-search] searchFn result count: ${products.length} for term="${term}"`)
        return products
      }
      const { products: allProducts, searchCount } = await searchAllEntities(
        searchEntities,
        searchQuery,
        searchFn,
      )
      level1Products = allProducts
      console.log(
        `[ai-search] multi-entity search completed: ${searchCount} terms returned results, total unique products=${level1Products.length} for query="${searchQuery}"`,
      )
    }
    level1Products = level1Products.filter((p: any) => p && p.id && (p.name || p.title || p.sku))

    // ===== SCORING DE RELEVÂNCIA =====
    // Termos GENUINAMENTE genéricos (+1): aparecem em muitos produtos, não indicam categoria
    var genericTerms = [
      'digital',
      'cinema',
      'kit',
      'with',
      'mount',
      'cable',
      'cabo',
      'plate',
      'screw',
      'parafuso',
      'bolt',
      'cap',
      'cover',
      'tampa',
    ]

    // Termos ESPECÍFICOS DE CATEGORIA (+5 cada produto que matchar)

    // --- BLACKMAGIC DESIGN ---
    var blackmagicTerms = [
      'blackmagic',
      'ursa',
      'pocket',
      'cinema camera',
      'davinci',
      'resolve',
      'atem',
      'hyperdeck',
      'videohub',
      'decklink',
      'ultrastudio',
      'teranex',
      'smartview',
      'smartscope',
      'web presenter',
      'video assist',
      'studio camera',
      'micro converter',
      'mini converter',
    ]

    // --- AJA VIDEO SYSTEMS ---
    var ajaTerms = ['aja', 'kona', 'helo', 'bridge live', 'fido', 'hd5da', 'gen10', 'ki pro']

    // --- DATAVIDEO ---
    var datavideoTerms = ['datavideo', 'nvs', 'tbc', 'ptc', 'se', 'hs', 'dac']

    // --- SONY ---
    var sonyTerms = [
      'sony',
      'venice',
      'burano',
      'pxw',
      'fs',
      'fx',
      'alpha',
      'a7',
      'a1',
      'a9',
      'pvm',
      'lmd',
      'bvm',
      'axs',
      's66',
      'tough',
      'cfast',
    ]

    // --- CANON ---
    var canonTerms = [
      'canon',
      'cinema eos',
      'eos r',
      'eos',
      'c70',
      'c300',
      'c400',
      'c500',
      'r5',
      'r3',
      'r5c',
      'cn-e',
    ]

    // --- DULENS ---
    var dulensTerms = ['dulens', 'mini prime', 'apo']

    // --- SENNHEISER / ÁUDIO ---
    var sennheiserTerms = [
      'sennheiser',
      'ew',
      'evolution',
      'g4',
      'g3',
      'mke',
      'mkh',
      'sk',
      'sr',
      'ek',
      'xsw',
    ]

    // --- LENTES ---
    var lensTerms = [
      'lente',
      'lens',
      'objetiva',
      'lente',
      'fisheye',
      'olho de peixe',
      'ojo de pez',
      'grande angular',
      'wide angle',
      'gran angular',
      'teleobjetiva',
      'telephoto',
      'tele',
      'teleobjetivo',
      'zoom',
      'prime',
      'fija',
      'anamorfico',
      'anamorphic',
      'anamorfico',
      'macro',
      'macro',
      'e-mount',
      'e mount',
      'ef mount',
      'rf mount',
      'pl mount',
      'g master',
      'sel',
      'fe',
    ]

    // --- MICROFONES / ÁUDIO ---
    var microphoneTerms = [
      'microfone',
      'microphone',
      'microfono',
      'shotgun',
      'lapela',
      'lavalier',
      'boom',
      'wireless',
      'inalambrico',
      'sem fio',
      'receiver',
      'receptor',
      'transmitter',
      'transmissor',
      'headset',
      'headphone',
      'fone',
      'auricular',
      'mixer',
      'mesa de som',
    ]

    // --- SWITCHERS / PRODUÇÃO ---
    var switcherTerms = [
      'atem',
      'switcher',
      'production',
      'nvs',
      'roland',
      'video mixer',
      'mixing console',
    ]

    // --- CONVERSORES / DISTRIBUIÇÃO ---
    var converterTerms = [
      'conversor',
      'converter',
      'convert',
      'convertidor',
      'scaler',
      'escalador',
      'distribution',
      'distribuidor',
      'distribucion',
      'amplifier',
      'amplificador',
      'da',
      'multiviewer',
      'multi viewer',
      'router',
      'matrix',
      'teranex',
      'micro converter',
      'mini converter',
    ]

    // --- MONITORES / DISPLAY ---
    var monitorTerms = [
      'monitor',
      'monitor',
      'display',
      'tela',
      'pantalla',
      'screen',
      'visor',
      'viewfinder',
      'evf',
      'smartview',
      'smartscope',
      'pvm',
      'lmd',
      'bvm',
      'video assist',
      'field monitor',
    ]

    // --- CAPTURA / GRAVAÇÃO ---
    var captureTerms = [
      'decklink',
      'ultrastudio',
      'capture',
      'playback',
      'hyperdeck',
      'ki pro',
      'recorder',
      'gravador',
      'grabador',
      'placa de captura',
      'capture card',
    ]

    // --- ARMAZENAMENTO / MÍDIA ---
    var storageTerms = [
      'memoria',
      'memory',
      'cartao',
      'card',
      'tarjeta',
      'armazenamento',
      'storage',
      'almacenamiento',
      'cfexpress',
      'sd',
      'sdxc',
      'cfast',
      'axs',
      's66',
      'tough',
      'vpg',
      'ssd',
      'nvme',
      'flash',
      'reader',
      'leitor',
      'lector',
      'disco',
      'disk',
      'hd',
      'cartridge',
      'cartucho',
      'lto',
      'archive',
    ]

    // --- BATERIA / ALIMENTAÇÃO ---
    var powerTerms = [
      'bateria',
      'battery',
      'bateria',
      'fonte',
      'power supply',
      'fuente',
      'carregador',
      'charger',
      'cargador',
      'power',
      'alimentacao',
      'alimentacion',
      'vmount',
      'v-mount',
      'v mount',
      'gold mount',
      'anton bauer',
      'power bank',
      'powerbank',
    ]

    // --- TRIPÉ / SUPORTE ---
    var supportTerms = [
      'tripe',
      'tripod',
      'tripode',
      'monope',
      'monopod',
      'monopode',
      'cabeca',
      'head',
      'cabeza',
      'fluid head',
      'quick release',
      'placa rapida',
      'slider',
      'dolly',
      'carrinho',
      'shoulder',
      'ombro',
      'rig',
      'cage',
      'gaiola',
      'suporte',
      'mount',
      'soporte',
      'grip',
      'handle',
      'asa',
      'case',
      'maleta',
      'bag',
      'bolsa',
      'mochila',
      'backpack',
    ]

    // --- CABOS ---
    var cableTerms = [
      'cabo',
      'cable',
      'cable',
      'hdmi',
      'sdi',
      'bnc',
      'xlr',
      'usb',
      'thunderbolt',
      'powercon',
      'ethernet',
      'sfp',
      'adaptador',
      'adapter',
      'adaptador',
    ]

    // --- FILTROS ---
    var filterTerms = [
      'filtro',
      'filter',
      'filtro',
      'nd',
      'ir',
      'polarizador',
      'polarizer',
      'difusao',
      'diffusion',
      'difusion',
      'variável',
      'variable',
      'variable',
      'black pro mist',
      'promist',
      'mist',
    ]

    // --- ILUMINAÇÃO ---
    var lightingTerms = [
      'luz',
      'light',
      'luz',
      'iluminacao',
      'lighting',
      'iluminacion',
      'led',
      'softbox',
      'lanterna',
      'flash',
      'strobo',
      'bicolor',
    ]

    // --- REMOTO / CONTROLE ---
    var remoteTerms = [
      'remote',
      'controle',
      'control',
      'controlador',
      'panel',
      'painel',
      'controlador',
      'lanc',
      'trigger',
    ]

    // Combina TODOS os termos de categoria em um array único
    var categoryTerms = []
    var categoryArrays = [
      blackmagicTerms,
      ajaTerms,
      datavideoTerms,
      sonyTerms,
      canonTerms,
      dulensTerms,
      sennheiserTerms,
      lensTerms,
      microphoneTerms,
      switcherTerms,
      converterTerms,
      monitorTerms,
      captureTerms,
      storageTerms,
      powerTerms,
      supportTerms,
      cableTerms,
      filterTerms,
      lightingTerms,
      remoteTerms,
    ]
    for (var c = 0; c < categoryArrays.length; c++) {
      var arr = categoryArrays[c]
      for (var k = 0; k < arr.length; k++) {
        if (categoryTerms.indexOf(arr[k]) < 0) {
          categoryTerms.push(arr[k])
        }
      }
    }

    // APLICA O SCORING
    for (var si = 0; si < level1Products.length; si++) {
      var prod = level1Products[si]
      var prodName = String(prod.name || prod.title || '').toLowerCase()
      var score = 0

      // Termos genéricos: +1 cada
      for (var gt = 0; gt < genericTerms.length; gt++) {
        if (prodName.indexOf(genericTerms[gt]) >= 0) score += 1
      }

      // Termos de categoria: +5 cada match em QUALQUER categoria
      for (var ct = 0; ct < categoryTerms.length; ct++) {
        if (prodName.indexOf(categoryTerms[ct]) >= 0) score += 5
      }

      prod._relevanceScore = score
    }

    // Ordena por score decrescente
    level1Products.sort(function (a, b) {
      return (b._relevanceScore || 0) - (a._relevanceScore || 0)
    })

    // Remove campo temporário
    for (var si2 = 0; si2 < level1Products.length; si2++) {
      delete level1Products[si2]._relevanceScore
    }
    // ===== FIM DO SCORING =====

    // Ordena por score decrescente e mantém os 10 primeiros
    level1Products.sort(function (a, b) {
      return (b._relevanceScore || 0) - (a._relevanceScore || 0)
    })

    // Remove campo temporário de score
    for (var si2 = 0; si2 < level1Products.length; si2++) {
      delete level1Products[si2]._relevanceScore
    }

    console.log(
      `[ai-search] searchEntities=${JSON.stringify(searchEntities)} validProducts=${level1Products.length}`,
    )

    // PT-EN Fallback: if primary search returned zero products, try translated/cleaned/simplified terms
    if (!skipSearch && level1Products.length === 0 && searchQuery.trim().length > 0) {
      const fallbackTerms = generateFallbackTerms(searchQuery)
      if (fallbackTerms.length > 0) {
        console.log(`[ai-search] PT FALLBACK: trying [${fallbackTerms.join(', ')}]`)
        const seenIds = new Set<string>()
        const searchFnFallback = async (term: string): Promise<any[]> => {
          const { data: rpcData, error: rpcError } = await supabase.rpc('execute_ai_search_v3', {
            search_term: term,
          })
          if (rpcError) return []
          return extractProducts(rpcData)
        }
        for (const term of fallbackTerms) {
          try {
            const results = await searchFnFallback(term)
            for (const p of results) {
              if (p?.id && !seenIds.has(p.id)) {
                seenIds.add(p.id)
                level1Products.push(p)
              }
            }
          } catch (err) {
            console.error(`[ai-search] PT FALLBACK error for term="${term}":`, err)
          }
        }
        console.log(
          `[ai-search] PT FALLBACK completed: total products after fallback=${level1Products.length}`,
        )
      }
    }

    // Accessory Filtering: remove non-core products for generic (single-word) searches
    if (!skipSearch && level1Products.length > 0 && isGenericSearch(searchEntities)) {
      const { filtered, removedCount } = filterAccessories(level1Products)
      if (filtered.length >= 3) {
        console.log(
          `[ai-search] FILTER: removed ${removedCount} accessories, ${filtered.length} remain`,
        )
        level1Products = filtered
      }
    }

    // Post-processing: extract numeric filters (e.g. "20x zoom") and apply to product list
    const filters = extractFilters(query)
    if (filters.minZoom !== null && level1Products.length > 0) {
      const { filtered, wasFiltered } = applyZoomFilter(level1Products, filters.minZoom)
      console.log(
        `[filter] minZoom=${filters.minZoom} original=${level1Products.length} filtered=${filtered.length}`,
      )
      if (wasFiltered && filtered.length > 0) {
        level1Products = filtered
      }
    }

    // PP Mode: filtra level1Products para manter APENAS os que correspondem ao termo pesquisado
    // Isso evita que produtos irrelevantes entrem no contexto da IA e gerem imagens erradas
    if (
      ppIntent === 'COMPARE' &&
      lastReferencedProductId &&
      level1Products.length > 0 &&
      searchQuery
    ) {
      const searchTerms = searchQuery.toLowerCase().split(' ')
      const beforeCount = level1Products.length
      level1Products = level1Products.filter((p: any) => {
        if (!p?.name) return false
        const productName = p.name.toLowerCase()
        return searchTerms.every((term: string) => productName.includes(term))
      })
      console.log(
        `[ai-search] PP filtered level1Products: ${beforeCount} → ${level1Products.length} (searchQuery: "${searchQuery}")`,
      )
    }

    const level1Context =
      level1Products.length > 0 ? buildProductContext(level1Products, queryMentionsBrazil) : []

    console.log(
      `[ai-search] PP level1Context: ${level1Context.length} products`,
      JSON.stringify(level1Context.map((p: any) => ({ id: p.id, name: p.name }))),
    )

    async function persistAndReturn(aiResult: any, type: string): Promise<Response> {
      const referencedInternalProducts = Array.isArray(aiResult.referenced_internal_products)
        ? [...aiResult.referenced_internal_products]
        : []
      let aiReferencedProducts = Array.isArray(aiResult.ai_referenced_products)
        ? [...aiResult.ai_referenced_products]
        : [...referencedInternalProducts]

      // APENAS adiciona o produto atual da página na lista de referenciados
      if (
        lastReferencedProductId &&
        !referencedInternalProducts.includes(lastReferencedProductId)
      ) {
        referencedInternalProducts.push(lastReferencedProductId)
        if (!aiReferencedProducts.includes(lastReferencedProductId)) {
          aiReferencedProducts.push(lastReferencedProductId)
        }
        console.log(
          `[ai-search] PP added current product (${lastReferencedProductId}) to referenced list`,
        )
      }

      // Cards exibem apenas produtos referenciados pela IA no texto.
      // O produto atual da página não é incluído — o usuário já está na página dele.

      // Filtra o level1Context para manter APENAS produtos que correspondem
      // ao termo pesquisado pelo usuário (ex: "Sony FX3A", "Sony FX6")
      // === PP CARDS: insere produtos nos cards conforme a intenção ===
      // Regra geral: NENHUM bloco abaixo adiciona produtos automaticamente.
      // Apenas o UUID scanner e a menção explicita do LLM via [PRODUCT:uuid]
      // podem incluir produtos nos cards.

      // [COMPARE]: filtro restritivo — só produtos que contêm TODOS os termos
      if (
        ppIntent === 'COMPARE' &&
        lastReferencedProductId &&
        level1Context.length > 0 &&
        searchQuery
      ) {
        const searchTerms = searchQuery.toLowerCase().split(' ')
        const filteredContext = level1Context.filter((product: any) => {
          if (!product?.name) return false
          return searchTerms.every((term) => product.name.toLowerCase().includes(term))
        })
        console.log(
          `[ai-search] PP COMPARE: level1Context ${level1Context.length} → filtered ${filteredContext.length}`,
        )
        for (const product of filteredContext) {
          const productId = product.id
          if (productId !== lastReferencedProductId) {
            console.log(
              '[ai-search] PP COMPARE: RELEVANTE (aguardando menção da IA) ' +
                productId +
                ' (' +
                String(product.name || '').substring(0, 40) +
                ')',
            )
          }
        }
      }

      // [RECOMMENDATION]: só adiciona aos cards o produto mencionado pela IA
      if (
        ppIntent === 'RECOMMENDATION' &&
        lastReferencedProductId &&
        level1Context.length > 0 &&
        searchQuery
      ) {
        const searchTerms = searchQuery.toLowerCase().split(' ')
        const filteredContext = level1Context.filter((product: any) => {
          if (!product?.id || !product?.name) return false
          return searchTerms.some((term: string) => product.name.toLowerCase().includes(term))
        })
        for (const product of filteredContext) {
          const productId = product.id
          if (productId !== lastReferencedProductId) {
            console.log(
              '[ai-search] PP RECOMMENDATION: RELEVANTE (aguardando menção da IA) ' +
                productId +
                ' (' +
                String(product.name || '').substring(0, 40) +
                ')',
            )
          }
        }
        console.log(
          '[ai-search] PP RECOMMENDATION: level1Context ' +
            level1Context.length +
            ' filtered ' +
            filteredContext.length,
        )
      }

      // [ACCESSORY / GENERIC]: adiciona level1Context com filtro de relevância (LOG ONLY)
      if (
        (ppIntent === 'ACCESSORY' || ppIntent === 'GENERIC') &&
        lastReferencedProductId &&
        level1Context.length > 0
      ) {
        var ppQuery = searchQuery
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[?.,;:!]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        var isMemoryQuery =
          /memoria|cartao|armazenamento|cfexpress|sd|uhs|cfast|ssd|storage|memory|type.?[ab]/i.test(
            ppQuery,
          )
        var isLensQuery = /lente|lens|fisheye|grande.?angular|tele.?[oó]tica|zoom|prime/.test(
          ppQuery,
        )
        var isAudioQuery = /microfone|microphone|audio|som|shotgun|lapela/.test(ppQuery)
        var isBatteryQuery = /bateria|battery|fonte|carregador|power|supply/.test(ppQuery)
        var isTripodQuery = /trip[ée]|cabeça|fluid.?head|monop[é]|quick.?release/.test(ppQuery)
        var categoryKeywords = []
        if (isMemoryQuery)
          categoryKeywords = [
            'cfexpress',
            'memory card',
            'tough',
            'sd',
            'uhs',
            'cfast',
            'cartao',
            'memoria',
            'ssd',
            'card reader',
            'flash',
            'type a',
            'type b',
            'axs',
          ]
        else if (isLensQuery)
          categoryKeywords = ['lente', 'lens', 'fisheye', 'prime', 'zoom', 't2.', 't2,', 't4']
        else if (isAudioQuery)
          categoryKeywords = ['microfone', 'microphone', 'shotgun', 'lapela', 'audio', 'boom']
        else if (isBatteryQuery)
          categoryKeywords = [
            'bateria',
            'battery',
            'power supply',
            'carregador',
            'charger',
            'power',
          ]
        else if (isTripodQuery)
          categoryKeywords = ['tripé', 'tripod', 'fluid head', 'monopod', 'quick release', 'cabeça']
        var exclusionKeywords = []
        if (isMemoryQuery) {
          exclusionKeywords = [
            'media module',
            'mezzanine',
            'decklink',
            'capture card',
            'grip',
            'handle',
            'battery',
            'lens cap',
            'top handle',
            'grips',
            'remote control',
            'arm',
          ]
        }
        var filterTerms = ppQuery.split(/\s+/).filter(function (t) {
          return t.length > 2
        })
        var productsAdded = 0
        for (var li = 0; li < level1Context.length; li++) {
          var product = level1Context[li]
          var productId = product.id
          var productName = String(product.name || product.title || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
          var productType = String(
            product.type || product.category || product.product_type || '',
          ).toLowerCase()
          var productKeywords = productName + ' ' + productType
          var isRelevant = false
          if (categoryKeywords.length > 0) {
            for (var ck = 0; ck < categoryKeywords.length; ck++) {
              if (productKeywords.indexOf(categoryKeywords[ck]) >= 0) {
                isRelevant = true
                break
              }
            }
          } else {
            for (var ft = 0; ft < filterTerms.length; ft++) {
              if (productKeywords.indexOf(filterTerms[ft]) >= 0) {
                isRelevant = true
                break
              }
            }
          }
          if (isRelevant && exclusionKeywords.length > 0) {
            for (var ek = 0; ek < exclusionKeywords.length; ek++) {
              if (productKeywords.indexOf(exclusionKeywords[ek]) >= 0) {
                isRelevant = false
                console.log(
                  '[ai-search] PP GENERIC: EXCLUIDO (exclusion) ' +
                    productId +
                    ' (' +
                    productName.substring(0, 40) +
                    ')',
                )
                break
              }
            }
          }
          if (isRelevant) {
            console.log(
              '[ai-search] PP GENERIC: RELEVANTE (aguardando menção da IA) ' +
                productId +
                ' (' +
                productName.substring(0, 40) +
                ')',
            )
          } else {
            console.log(
              '[ai-search] PP GENERIC: IGNORADO ' +
                productId +
                ' (' +
                productName.substring(0, 40) +
                ')',
            )
          }
        }
        console.log(
          '[ai-search] PP GENERIC: ' +
            productsAdded +
            ' produtos adicionados de ' +
            level1Context.length,
        )
      }

      // === PÓS-PROCESSAMENTO: garante a imagem do produto atual ===
      if (aiResult?.content && contextualProductData?.image_url) {
        var ppUrl = String(contextualProductData.image_url)
        if (aiResult.content.indexOf(ppUrl) < 0) {
          var ppMarker = '### Análise por Produto:'
          var ppImg = '![' + String(contextualProductData.name || '') + '](' + ppUrl + ')'
          var ppIndex = aiResult.content.indexOf(ppMarker)
          if (ppIndex >= 0) {
            var ppNewline = aiResult.content.indexOf('\n', ppIndex)
            if (ppNewline >= 0) {
              aiResult.content =
                aiResult.content.substring(0, ppNewline + 1) +
                '\n' +
                ppImg +
                '\n' +
                aiResult.content.substring(ppNewline + 1)
            }
          }
          console.log('[ai-search] PP image: injected main product image')
        } else {
          console.log('[ai-search] PP image: main product image already present')
        }
      }

      // === SCANNER DE UUID NO TEXTO (reforço para search_products) ===
      if (aiResult.content && typeof aiResult.content === 'string') {
        var uuidPattern = /\[PRODUCT:\s*([a-f0-9-]{36})\]/gi
        var uuidMatch
        var uuidFound = 0
        while ((uuidMatch = uuidPattern.exec(aiResult.content)) !== null) {
          var foundUuid = uuidMatch[1].toLowerCase()
          var isValid = false
          if (foundUuid === lastReferencedProductId) isValid = true
          if (level1Context && level1Context.length > 0) {
            for (var li = 0; li < level1Context.length; li++) {
              if (level1Context[li] && level1Context[li].id === foundUuid) {
                isValid = true
                break
              }
            }
          }
          if (isValid && foundUuid !== lastReferencedProductId) {
            uuidFound++
            if (referencedInternalProducts.indexOf(foundUuid) < 0)
              referencedInternalProducts.push(foundUuid)
            if (aiReferencedProducts.indexOf(foundUuid) < 0) aiReferencedProducts.push(foundUuid)
            console.log('[ai-search] PP UUID scanner: ACCEPTED ' + foundUuid)
          } else {
            aiResult.content = aiResult.content.replace(uuidMatch[0], '')
            console.log('[ai-search] PP UUID scanner: REJECTED ' + foundUuid + ' (not in context)')
          }
        }
        if (uuidFound > 0) {
          console.log('[ai-search] PP UUID scanner: accepted ' + uuidFound + ' products total')
        }
      }

      // HP: se sem produtos referenciados, usa level1Context como fallback (LOG ONLY)
      if (
        !lastReferencedProductId &&
        referencedInternalProducts.length === 0 &&
        level1Context.length > 0
      ) {
        for (var fi = 0; fi < level1Context.length; fi++) {
          var prodId = level1Context[fi]?.id
          if (prodId) {
            console.log(
              '[ai-search] HP fallback: RELEVANTE (aguardando menção da IA) ' +
                prodId +
                ' (' +
                String(level1Context[fi]?.name || '').substring(0, 40) +
                ')',
            )
          }
        }
        console.log('[ai-search] HP fallback: log only, no products added from level1Context')
      }

      const aiReferencedCount = aiReferencedProducts.length
      if (session_id) {
        await supabase
          .from('chat_messages')
          .insert({ session_id, role: 'user', message: query, content: query })
        await supabase.from('chat_messages').insert({
          session_id,
          role: 'assistant',
          message: aiResult.content,
          content: JSON.stringify({
            ...aiResult,
            referenced_internal_products: referencedInternalProducts,
            ai_referenced_products: aiReferencedProducts,
          }),
          type,
        })
      }
      // PP NUNCA envia full_search_results
      const fullSearchResults = isHPMode ? await searchPromise : []
      console.log(
        `[ai-search] response: mode=${isHPMode ? 'HP' : 'PP'} full_search_results=${fullSearchResults.length} referenced=${referencedInternalProducts.length}`,
      )

      // Remove o produto atual da página dos cards referenciados
      if (lastReferencedProductId) {
        const before = referencedInternalProducts.length
        const idxRef = referencedInternalProducts.indexOf(lastReferencedProductId)
        if (idxRef !== -1) referencedInternalProducts.splice(idxRef, 1)

        const idxAi = aiReferencedProducts.indexOf(lastReferencedProductId)
        if (idxAi !== -1) aiReferencedProducts.splice(idxAi, 1)

        if (idxRef !== -1 || idxAi !== -1) {
          console.log(
            `[ai-search] Removed current product (${lastReferencedProductId}) from referenced cards`,
          )
        }
      }

      const result: any = {
        content: aiResult.content,
        confidence_level: aiResult.confidence_level,
        referenced_internal_products: referencedInternalProducts,
        ai_referenced_products: aiReferencedProducts,
        should_show_whatsapp_button: aiResult.should_show_whatsapp_button,
        ai_referenced_count: aiReferencedCount,
        full_search_results: fullSearchResults,
      }
      if (typeof result.content === 'string') {
        result.content = result.content.trim()
        if (result.content.startsWith('{') && result.content.includes('"content"')) {
          try {
            const parsed = JSON.parse(result.content)
            if (parsed && typeof parsed.content === 'string') {
              result.content = parsed.content.trim()
              console.log(`[ai-search] extracted content from JSON-wrapped response`)
            }
          } catch {}
        }
        if (
          lastReferencedProductId &&
          globalSettingsMap['transparency_note'] &&
          result.referenced_internal_products.length > 0
        )
          result.content += '\n\n' + globalSettingsMap['transparency_note']
      }
      if (result.referenced_internal_products.length > 0) {
        const { data: groundedProducts } = await supabase
          .from('products')
          .select(
            'id, name, price_usd, price_nationalized_sales, price_nationalized_currency, image_url, category, description, technical_info, sku, weight, is_discontinued, price_usa_rebate, date_rebate, manufacturer_id, manufacturer:manufacturers(name)',
          )
          .in('id', result.referenced_internal_products)
        if (groundedProducts) {
          const aiIdSet = new Set(aiReferencedProducts)
          result.products = groundedProducts
            .map((p: any) => ({
              ...p,
              manufacturer: (p.manufacturer as any)?.name || (p as any).manufacturer_name || 'N/A',
            }))
            .sort((a: any, b: any) => {
              const aIsAi = aiIdSet.has(a.id) ? 0 : 1
              const bIsAi = aiIdSet.has(b.id) ? 0 : 1
              return aIsAi - bIsAi
            })
        }
      }
      result.execution_id = execution_id
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const CATEGORY_KEYWORDS = [
      'camera',
      'cameras',
      'lente',
      'lentes',
      'microfone',
      'microfones',
      'tripé',
      'tripés',
      'monitor',
      'monitores',
      'ptz',
      '4k',
      'hdmi',
      'sdi',
      'ndi',
      'battery',
      'bateria',
      'light',
      'iluminação',
      'audio',
      'áudio',
      'video',
      'vídeo',
    ]

    function isCategoryQuery(q: string): boolean {
      const lower = q.toLowerCase()
      return CATEGORY_KEYWORDS.some((kw) => lower.includes(kw))
    }

    async function categoryResponse(productIds: string[]): Promise<Response> {
      const fullSearchResults = isHPMode ? await searchPromise : []
      return new Response(
        JSON.stringify({
          content: `Encontrei alguns produtos no catálogo relacionados a "${query}".`,
          confidence_level: 'medium',
          referenced_internal_products: productIds,
          should_show_whatsapp_button: false,
          ai_referenced_count: productIds.length,
          full_search_results: fullSearchResults,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    }

    async function outOfScopeResponse(): Promise<Response> {
      if (isCategoryQuery(query) && level1Context.length > 0) {
        return categoryResponse(level1Context.map((p) => p.id).filter(Boolean))
      }
      const fullSearchResults = isHPMode ? await searchPromise : []
      return new Response(
        JSON.stringify({
          content: OUT_OF_SCOPE_MESSAGE,
          confidence_level: 'high',
          referenced_internal_products: [],
          should_show_whatsapp_button: false,
          ai_referenced_count: 0,
          full_search_results: fullSearchResults,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    }

    // Technical Intent — bypass all cascade stages and answer directly from product context
    if (skipSearch) {
      const technicalProducts = contextualProductData
        ? buildProductContext([contextualProductData], queryMentionsBrazil)
        : []
      const aiResult = await generateResponse(
        query,
        {
          agentSettings,
          aiSettings,
          products: technicalProducts,
          manufacturerList,
          history,
          currentProductId: lastReferencedProductId,
          contextualProductData,
          productPagePrompt: productPagePrompt || undefined,
          currentProductContext: currentProductContext || undefined,
        },
        undefined,
        supabase,
      )
      return await persistAndReturn(aiResult, 'technical')
    }

    // Stage B: Institutional
    if (searchQuery.trim().length > 0 && isInstitutionalQuery(searchQuery)) {
      logCascade('B', 'institutional', true, query)
      const aiResult = await generateResponse(
        query,
        { agentSettings, aiSettings, institutionalContext, history, products: [] },
        undefined,
        supabase,
      )
      return await persistAndReturn(aiResult, 'institutional')
    }

    // Stage C: Products
    if (level1Context.length > 0) {
      logCascade('C', 'products', true, query, `products=${level1Context.length}`)
      const aiResult = await generateResponse(
        query,
        {
          agentSettings,
          aiSettings,
          products: level1Context,
          manufacturerList,
          history,
          currentProductId: lastReferencedProductId,
          contextualProductData,
          productPagePrompt: productPagePrompt || undefined,
          currentProductContext: currentProductContext || undefined,
        },
        undefined,
        supabase,
      )
      return await persistAndReturn(aiResult, 'products')
    }

    // Stage D: Manufacturers (in-memory filter)
    const manufacturerNames = manufacturers ? manufacturers.map((m) => m.name) : []
    const matchedManufacturers = manufacturerNames.filter((name) => {
      const nameLower = name.toLowerCase()
      return searchEntities.some(
        (entity) =>
          entity.toLowerCase().includes(nameLower) || nameLower.includes(entity.toLowerCase()),
      )
    })
    if (matchedManufacturers.length > 0) {
      logCascade('D', 'manufacturers', true, query, `manufacturers=${matchedManufacturers.length}`)
      const aiResult = await generateResponse(
        query,
        {
          agentSettings,
          aiSettings,
          manufacturerList: matchedManufacturers.join(', '),
          history,
          products: [],
        },
        undefined,
        supabase,
      )
      return await persistAndReturn(aiResult, 'manufacturers')
    }

    // Stage E: Keywords
    const kwCheckE = checkKeywordRelevance(searchQuery, keywordList)
    if (kwCheckE.isBlocked) {
      if (isCategoryQuery(query) && level1Context.length > 0) {
        logCascade('E', 'keywords', true, query, '(category bypass)')
        return categoryResponse(level1Context.map((p) => p.id).filter(Boolean))
      }
      logCascade('E', 'keywords', false, query, '(blocked)')
      return outOfScopeResponse()
    }
    if (kwCheckE.relevanceScore > 0) {
      logCascade('E', 'keywords', true, query, `relevance=${kwCheckE.relevanceScore}`)
      const aiResult = await generateResponse(
        query,
        {
          agentSettings,
          aiSettings,
          institutionalContext,
          manufacturerList,
          history,
          products: level1Context,
        },
        undefined,
        supabase,
      )
      return await persistAndReturn(aiResult, 'keywords')
    }

    // Stage F: General Fallback
    const kwCheckF = checkKeywordRelevance(searchQuery, keywordList)
    if (kwCheckF.isBlocked || kwCheckF.relevanceScore === 0) {
      if (isCategoryQuery(query) && level1Context.length > 0) {
        logCascade('F', 'general', true, query, '(category bypass)')
        return categoryResponse(level1Context.map((p) => p.id).filter(Boolean))
      }
      logCascade('F', 'general', false, query, '(blocked by system)')
      return outOfScopeResponse()
    }
    logCascade('F', 'general', true, query, `(fallback) relevance=${kwCheckF.relevanceScore}`)
    const unifiedData = {
      products: level1Context,
      history,
      currentProductId: lastReferencedProductId,
      contextualProductData,
      manufacturerList,
      agentSettings,
      aiSettings,
      institutionalContext,
      productPagePrompt: productPagePrompt || undefined,
      currentProductContext: currentProductContext || undefined,
    }
    const aiResultF = await generateResponse(query, unifiedData, undefined, supabase)
    return await persistAndReturn(aiResultF, 'general')
  } catch (error: any) {
    console.error('[ERRO GLOBAL]', error)
    return new Response(
      JSON.stringify({
        error:
          'Falha ao processar a busca em todos os provedores ativos. Tente novamente em instantes.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }
})
