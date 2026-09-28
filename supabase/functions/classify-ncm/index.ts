// Deploy trigger build 620 - classify-ncm v3.8.0-build.620
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface ClassifyRequestBody {
  product_description: string
  brand?: string
  model?: string
  additional_specs?: string
  top_n?: number
  save_log?: boolean
  product_id?: string
  imp_sim_product_id?: string
}

interface WebSource {
  title: string
  url: string
  snippet?: string
}

interface LLMProviderConfig {
  id: string
  provider_name: string
  provider_type?: string
  model_id: string
  api_key_secret_name: string
  custom_endpoint?: string
  priority_order?: number
}

interface ExQualifiers {
  signalType: 'digital' | 'analog' | null
  frequencyRanges: string[]
  isSingularItem: boolean
  singularComponentType: string | null
  materialRequirements: string[]
  purposeRequirements: string[]
  formatPortability: string[]
}

interface ExConditionComparison {
  name: string
  productValue: string
  exRequirement: string
  status: 'ATENDE' | 'NÃO ATENDE' | 'NÃO COMPROVADO'
  reason?: string
}

interface ExChecklistResult {
  passed: boolean
  status?: 'APROVADO' | 'VETADO' | 'NÃO VERIFICADO'
  requiresExpertReview?: boolean
  comparisons: ExConditionComparison[]
  vetoReason?: string
  missingInformation: string[]
  needsWebSearch: boolean
}

interface CompositionAnalysisResult {
  isKit: boolean
  detectedComponents: string[]
  compositionIdentified: boolean
  targetMachines: string[]
}

// =============================================================================
// SALVAGUARDA DEFENSIVA UNIVERSAL DE PROVEDORES DE IA
// =============================================================================

interface ProviderValidationResult {
  supported: boolean
  reason: string
}

/**
 * Valida se um registro de provedor de IA cadastrado na tabela ai_providers
 * pode ser consumido pela rotina de inferência nativa da classify-ncm.
 *
 * Provedores suportados nativamente:
 *  - OpenAI (provider_type='openai' ou nome contendo openai/gpt)
 *  - DeepSeek (provider_type='deepseek' ou nome contendo deepseek)
 *  - Gemini (provider_type='gemini' ou nome contendo gemini)
 *  - Custom SOMENTE SE tiver endpoint compatível com OpenAI chat completions
 *    (ex.: LiteLLM, Ollama com /v1, OpenRouter).
 *
 * Provedores INCOMPATÍVEIS e REJEITADOS defensivamente:
 *  - Anthropic nativo (ex: endpoint /v1/messages, x-api-key)
 *  - Provedores custom cujo endpoint aponte para APIs proprietárias incompatíveis
 *  - Provedores sem nome de secret de API key definido
 */
function isSupportedAIProvider(provider: {
  provider_type?: string | null
  provider_name?: string | null
  model_id?: string | null
  custom_endpoint?: string | null
  api_key_secret_name?: string | null
}): ProviderValidationResult {
  if (!provider) {
    return { supported: false, reason: 'Objeto de configuração do provedor nulo ou indefinido.' }
  }

  const pType = (provider.provider_type || '').toLowerCase().trim()
  const pName = (provider.provider_name || '').toLowerCase().trim()
  const endpoint = (provider.custom_endpoint || '').toLowerCase().trim()
  const model = (provider.model_id || '').toLowerCase().trim()
  const secretName = (provider.api_key_secret_name || '').toUpperCase().trim()

  // 1. Anthropic nativo (Claude via Messages API não-compatível com OpenAI)
  const isAnthropicApi =
    endpoint.includes('anthropic.com') ||
    endpoint.includes('/v1/messages') ||
    secretName.includes('ANTHROPIC') ||
    pType.includes('anthropic') ||
    (pType === 'custom' && (pName.includes('claude') || model.includes('claude')))

  if (isAnthropicApi) {
    return {
      supported: false,
      reason: `Provedor proprietário Anthropic/Claude não é compatível nativamente com o cliente OpenAI da classify-ncm (endpoint: ${provider.custom_endpoint || 'api.anthropic.com'}).`,
    }
  }

  // 2. Secret name de chave obrigatório
  if (!secretName) {
    return {
      supported: false,
      reason: 'api_key_secret_name não definido no cadastro do provedor.',
    }
  }

  // 3. Provedores padrão suportados
  if (pType === 'openai' || pName.includes('openai') || model.includes('gpt-')) {
    return { supported: true, reason: 'Provedor OpenAI nativo.' }
  }

  if (pType === 'deepseek' || pName.includes('deepseek') || model.includes('deepseek')) {
    return { supported: true, reason: 'Provedor DeepSeek nativo.' }
  }

  if (pType === 'gemini' || pName.includes('gemini') || model.includes('gemini')) {
    return { supported: true, reason: 'Provedor Gemini nativo.' }
  }

  // 4. Provedores custom
  if (pType === 'custom') {
    if (!endpoint) {
      return {
        supported: false,
        reason: 'Provedor tipo custom sem custom_endpoint definido.',
      }
    }

    const isOpenAiCompatible =
      endpoint.endsWith('/chat/completions') ||
      endpoint.includes('/v1/chat/completions') ||
      endpoint.includes('generativelanguage.googleapis.com') ||
      endpoint.includes('openrouter.ai') ||
      endpoint.includes('together.xyz') ||
      endpoint.includes('groq.com')

    if (!isOpenAiCompatible) {
      return {
        supported: false,
        reason: `Endpoint custom "${endpoint}" não segue o protocolo OpenAI chat completions (/chat/completions).`,
      }
    }

    return { supported: true, reason: 'Provedor custom com endpoint OpenAI compatível.' }
  }

  // Qualquer outro provedor não catalogado
  return {
    supported: false,
    reason: `Tipo de provedor "${provider.provider_type}" não suportado nativamente na classify-ncm.`,
  }
}

// =============================================================================
// NOVO AUXILIAR DETERMINÍSTICO: AVALIAÇÃO DE QUALIFICADORES QUANTITATIVOS INTRAFAMÍLIA
// =============================================================================

interface IntrafamilyQualifierEvaluationResult {
  hasPattern: boolean
  matchedPattern?: string
  extractedCategory?: string
  requiredThreshold?: number
  comparisonOperator?: 'gte' | 'gt' | 'lte' | 'lt' | 'exact'
  productValueFound?: number
  satisfied: boolean
  scoreAdjustment: number // +80 para satisfeito, penalização (-60) para incompatibilidade patente
  reason: string
}

/**
 * Avalia incompatibilidade tecnológica genérica entre o perfil técnico do produto e a NCM candidata.
 * Princípio universal permanente: A classificação aduaneira baseia-se na tecnologia real declarada
 * (princípio da verdade material aduaneira) e NUNCA em terminologias comerciais de marketing
 * ("Cinema", "Cine", "movie" no nome do produto não deslocam enquadramento entre capítulos).
 *
 * Posição 90.07: restrita a câmeras e projetores cinematográficos com captação sobre PELÍCULA / FILME FOTOGRÁFICO.
 * Câmeras com sensor eletrônico/digital (CMOS, CCD, captador eletrônico, resolução digital 4K/6K/8K/12K/HD,
 * saídas digitais SDI/HDMI, gravação em cartão/SSD) enquadram-se na posição 85.25 (câmeras de televisão,
 * câmeras digitais e câmeras de vídeo).
 */
function checkTechnologyIncompatibility(
  ncm: string,
  ncmDesc: string,
  technicalProfile: string,
): { incompatible: boolean; reason: string } {
  const normNcm = normalizeNcm(ncm)
  const isPos9007 = normNcm.startsWith('9007')
  const descLower = (ncmDesc || '').toLowerCase()
  const profileLower = (technicalProfile || '').toLowerCase()

  const officialDemandsFilm =
    descLower.includes('película') ||
    descLower.includes('pelicula') ||
    descLower.includes('filme cinematográfico') ||
    descLower.includes('filme cinematografico') ||
    descLower.includes('largura inferior a 16 mm') ||
    descLower.includes('largura de 16 mm ou mais') ||
    descLower.includes('largura de 35 mm')

  const isPositionOrDescFilmRestricted =
    isPos9007 || (officialDemandsFilm && normNcm.startsWith('90'))

  if (!isPositionOrDescFilmRestricted) {
    return { incompatible: false, reason: '' }
  }

  // Verifica se o perfil técnico do produto indica captação eletrônica / digital
  const electronicCapturePatterns = [
    /\b(?:sensor|sensores|sensors?)\b/i,
    /\b(?:cmos|ccd|captador(?:es)?(?:\s+de\s+imagem)?)\b/i,
    /\b(?:digital(?:is)?|digitais)\b/i,
    /\b(?:\d+k|4k|6k|8k|12k|full\s*hd|ultra\s*hd|uhd)\b/i,
    /\b(?:sdi|12g-sdi|3g-sdi|hd-sdi|hdmi|usb-c|thunderbolt)\b/i,
    /\b(?:bravia|cinealta|bionz|exmor|global\s*shutter)\b/i,
    /\b(?:electronic\s+shutter|obturador\s+eletr[oô]nico)\b/i,
  ]

  const hasElectronicCapture = electronicCapturePatterns.some((pat) => pat.test(profileLower))

  if (hasElectronicCapture) {
    return {
      incompatible: true,
      reason:
        'Posição 90.07 restrita a captação sobre película fotográfica; câmeras com sensor eletrônico/saída digital enquadram-se na posição 85.25.',
    }
  }

  return { incompatible: false, reason: '' }
}

/**
 * Converte palavras numéricas em português/inglês para números inteiros
 */
function parseWordNumber(word: string): number | null {
  if (!word) return null
  const w = word.toLowerCase().trim()
  const num = parseInt(w, 10)
  if (!isNaN(num)) return num

  const wordMap: Record<string, number> = {
    um: 1,
    uma: 1,
    one: 1,
    dois: 2,
    duas: 2,
    two: 2,
    tres: 3,
    três: 3,
    three: 3,
    quatro: 4,
    four: 4,
    cinco: 5,
    five: 5,
    seis: 6,
    six: 6,
    sete: 7,
    seven: 7,
    oito: 8,
    eight: 8,
    nove: 9,
    nine: 9,
    dez: 10,
    ten: 10,
    doze: 12,
    twelve: 12,
    dezesseis: 16,
    sixteen: 16,
    vinte: 20,
    twenty: 20,
    trinta: 30,
    thirty: 30,
  }
  return wordMap[w] ?? null
}

/**
 * Extrai padrões quantitativos da descrição oficial de um NCM ou Ex:
 * Padrões como:
 * - "oito ou mais entradas" / "8 ou mais entradas"
 * - "com três ou mais captadores de imagem"
 * - "mais de 10 entradas de áudio ou de vídeo"
 * - "de mais de 20 entradas e mais de 16 saídas"
 * - "4 canais ou mais" / "acima de 8 canais"
 *
 * Confronta com as especificações técnicas declaradas no produto.
 * Se o produto satisfaz a condição quantitativa: +80 pontos decisivos;
 * Se for patente incompatibilidade (ex.: produto com 4 entradas contra "oito ou mais"): penalização (-60);
 * Função GENÉRICA: vale para qualquer capítulo/posição (84, 85, 90), sem hardcode de NCM ou produto.
 */
/**
 * Extrai a contagem técnica de entradas físicas de vídeo declaradas nas especificações do produto,
 * confrontando com termos como "SDI", "HDMI", "entradas de vídeo", "video inputs", etc.
 * Retorna { count, snippet } ou null se nenhuma contagem for localizada.
 */
function extractDeclaredVideoInputCount(
  productSpecs: string,
): { count: number; snippet: string } | null {
  if (!productSpecs || typeof productSpecs !== 'string') return null
  const text = productSpecs.toLowerCase()

  // 1. Padrões explícitos como:
  // "10 entradas SDI", "20 video inputs", "8 entradas de vídeo", "4 HDMI inputs", "20 x 12G-SDI inputs",
  // "entradas de vídeo: 8", "video inputs: 10", "8 inputs (1080p)", "8x SDI", "8 canais de entrada"
  const patterns: RegExp[] = [
    /\b(oito|tr[eê]s|duas|dois|quatro|cinco|seis|sete|nove|dez|doze|dezesseis|vinte|\d+)\s*(?:x\s*)?(?:entradas?\s*(?:de\s*)?(?:v[ií]deo|video)?|(?:video\s*)?inputs?)\s*(?:sdi|hdmi|12g|3g|4k|bnc)?\b/i,
    /\b(?:entradas?\s*(?:de\s*)?(?:v[ií]deo|video)?|(?:video\s*)?inputs?)\s*(?::|de)?\s*(oito|tr[eê]s|duas|dois|quatro|cinco|seis|sete|nove|dez|doze|dezesseis|vinte|\d+)\b/i,
    /\b(oito|tr[eê]s|duas|dois|quatro|cinco|seis|sete|nove|dez|doze|dezesseis|vinte|\d+)\s*(?:x\s*)?(?:12g-sdi|6g-sdi|3g-sdi|hd-sdi|sdi|hdmi)\s*(?:entradas?|inputs?)\b/i,
    /\b(oito|tr[eê]s|duas|dois|quatro|cinco|seis|sete|nove|dez|doze|dezesseis|vinte|\d+)\s*(?:canais|channels)\s*(?:de\s*)?(?:entrada|input)\b/i,
    /\b(\d+)\s*(?:x|[-])\s*(?:in|inputs?|entradas?)\b/i,
  ]

  for (const pat of patterns) {
    const m = text.match(pat)
    if (m) {
      const num = parseWordNumber(m[1])
      if (num !== null && num > 0) {
        return { count: num, snippet: m[0] }
      }
    }
  }

  // 2. Tentar somar entradas declaradas quando houver especificação segregada (ex: "4 SDI e 4 HDMI inputs")
  const dualMatch = text.match(
    /\b(\d+)\s*(?:x\s*)?(?:sdi|12g-sdi|3g-sdi|hdmi)\s*(?:inputs?|entradas?)?\s*(?:e|\+|and)\s*(\d+)\s*(?:x\s*)?(?:sdi|12g-sdi|3g-sdi|hdmi)\s*(?:inputs?|entradas?)\b/i,
  )
  if (dualMatch) {
    const n1 = parseInt(dualMatch[1], 10)
    const n2 = parseInt(dualMatch[2], 10)
    if (!isNaN(n1) && !isNaN(n2)) {
      return { count: n1 + n2, snippet: dualMatch[0] }
    }
  }

  return null
}

/**
 * Extrai a contagem física real de sensores/captadores de imagem declarados nas especificações do produto.
 * REQUISITO DETERMINÍSTICO (3): Exige 3+ captadores/sensores físicos declarados (cmos/ccd/captador/sensor).
 * Filtra expressamente linguagem de marketing ("3 câmeras em 1", "multi-câmera", "3 cameras in 1",
 * "3-in-1", "all-in-one", "3 presets") — só contam menções técnicas diretas a sensores/captadores de imagem.
 */
function extractPhysicalSensorCount(
  productSpecs: string,
): { count: number; snippet: string } | null {
  if (!productSpecs || typeof productSpecs !== 'string') return null
  const text = productSpecs.toLowerCase()

  // 1. Filtrar falso-positivos de marketing antes da contagem
  // Ex: "3 câmeras em 1", "3-in-1 camera", "multi-câmera" não contam como 3 sensores
  const isMarketingClaim =
    /\b(?:3\s*(?:c[aâ]meras?|cameras?)\s*(?:em|in)\s*1|3-in-1|all-in-one|multi-c[aâ]mera|multicamera)\b/i.test(
      text,
    )

  // 2. Padrões técnicos diretos para múltiplos sensores/captadores:
  // "3 CMOS", "3x 2/3", "3 sensores de imagem", "3 captadores", "three 2/3-inch sensors",
  // "três sensores", "3 ccd", "sistema de 3 sensores", "3-sensor", "3-chip", "3 chips"
  const multiSensorPatterns: RegExp[] = [
    /\b(oito|tr[eê]s|duas|dois|quatro|cinco|seis|sete|\d+)\s*(?:x|\*|-)?\s*(?:\d+(?:\/\d+)?["”]?(?:\s*(?:4k|hd|type))?)?\s*(?:cmos|ccd|captadores?(?:\s+de\s+imagem)?|sensores?(?:\s+de\s+imagem)?|chips?|image\s+sensors?)\b/i,
    /\b(?:sistema\s+de\s+|sistema\s+com\s+)(oito|tr[eê]s|duas|dois|quatro|cinco|seis|sete|\d+)\s*(?:sensores?|captadores?|cmos|ccd)\b/i,
    /\b(3-chip|3\s+chips|3-sensor|3\s+sensors|tri-sensor)\b/i,
    /\b(?:three|tr[eê]s)\s+(?:\d+(?:\/\d+)?["”]?(?:\s*(?:4k|hd|type))?)?\s*(?:cmos|ccd|sensors?|captadores?)\b/i,
  ]

  for (const pat of multiSensorPatterns) {
    const m = text.match(pat)
    if (m) {
      if (
        m[0].includes('3-chip') ||
        m[0].includes('3 chips') ||
        m[0].includes('3-sensor') ||
        m[0].includes('3 sensors') ||
        m[0].includes('tri-sensor')
      ) {
        return { count: 3, snippet: m[0] }
      }
      const num = parseWordNumber(m[1])
      if (num !== null && num > 0) {
        return { count: num, snippet: m[0] }
      }
    }
  }

  // 3. Padrões de sensor único (1 sensor):
  // "1 sensor", "single sensor", "single chip", "single-chip", "1-chip", "sensor único", "1x sensor",
  // "sensor super 35", "sensor 6k", "sensor full frame", "large format sensor", "sensor cmos de ..."
  const singleSensorPatterns: RegExp[] = [
    /\b(?:sensor\s+[uú]nico|single\s+sensor|single-chip|1-chip|1\s+sensor|um\s+sensor|1x\s+sensor)\b/i,
    /\b(?:sensor\s+(?:6k|4k|8k|12k|super\s*35|s35|full\s*frame|full-frame|aps-c|micro\s*four\s*thirds|mft))\b/i,
    /\b(?:sensor\s+cmos\s+(?:super\s*35|6k|4k|full\s*frame))\b/i,
    /\b(?:super\s*35mm|super\s*35)\s+(?:hdr\s+)?(?:image\s+)?sensor\b/i,
  ]

  for (const pat of singleSensorPatterns) {
    const m = text.match(pat)
    if (m) {
      return { count: 1, snippet: m[0] }
    }
  }

  // Se o texto fala apenas em marketing de "3 câmeras em 1", registrar como não-qualificante de múltiplos sensores físicos
  if (isMarketingClaim) {
    return { count: 1, snippet: 'claim de marketing comercial (não são 3 sensores físicos)' }
  }

  return null
}

function evaluateIntrafamilyQualifierScore(
  ncmDescricaoFull: string,
  exText: string | null | undefined,
  productSpecs: string,
): IntrafamilyQualifierEvaluationResult {
  const combinedDesc = `${ncmDescricaoFull || ''} ${exText || ''}`.toLowerCase()
  const prodText = (productSpecs || '').toLowerCase()

  if (!combinedDesc.trim()) {
    return {
      hasPattern: false,
      satisfied: false,
      scoreAdjustment: 0,
      reason: 'Descrição vazia para avaliação de qualificadores.',
    }
  }

  // Regex genérica para qualificadores quantitativos em descrições oficiais NCM/Ex
  // Suporta numerais ou palavras ("oito", "três", etc.) seguidos de operadores ("ou mais", "a", "+", "acima de", "mais de")
  // e de categorias técnicas (entradas, canais, captadores, sensores, saídas, portas, inputs, outputs, etc.)
  // Também suporta o formato inverso: "mais de (\d+|palavra) (entradas|...)"
  const patterns = [
    // Padrão 1: "oito ou mais entradas", "3 ou mais captadores", "8+ canais", "4 a 8 portas"
    /\b(oito|tr[eê]s|duas|dois|quatro|cinco|seis|sete|nove|dez|doze|dezesseis|vinte|\d+)\s*(?:ou\s+mais|\+|acima\s+de|a\s+\d+)\s*(entradas|inputs|canais|channels|captadores|sensores|sa[ií]das|outputs|portas)\b/i,
    // Padrão 2: "mais de 10 entradas", "acima de 8 canais", "superior a 20 entradas"
    /\b(?:mais\s+de|superior\s+a|acima\s+de)\s*(oito|tr[eê]s|duas|dois|quatro|cinco|seis|sete|nove|dez|doze|dezesseis|vinte|\d+)\s*(entradas|inputs|canais|channels|captadores|sensores|sa[ií]das|outputs|portas)\b/i,
    // Padrão 3: "com três ou mais captadores de imagem"
    /\b(?:com\s+)?(oito|tr[eê]s|duas|dois|quatro|cinco|seis|sete|nove|dez|doze|dezesseis|vinte|\d+)\s*(?:ou\s+mais)\s*(?:de\s+)?(entradas|inputs|canais|channels|captadores|sensores|sa[ií]das|outputs|portas)\b/i,
  ]

  let matchedRaw = ''
  let numVal: number | null = null
  let category = ''
  let operator: 'gte' | 'gt' | 'exact' = 'gte'

  for (const pat of patterns) {
    const m = combinedDesc.match(pat)
    if (m) {
      matchedRaw = m[0]
      numVal = parseWordNumber(m[1])
      category = (m[2] || '').toLowerCase()
      if (/mais\s+de|superior\s+a/i.test(m[0])) {
        operator = 'gt'
      } else {
        operator = 'gte'
      }
      break
    }
  }

  if (!numVal || !category) {
    return {
      hasPattern: false,
      satisfied: false,
      scoreAdjustment: 0,
      reason: 'Nenhum qualificador quantitativo oficial identificado na descrição da subposição.',
    }
  }

  // Mapeamento semântico da categoria para busca no produto
  // Ex: "entradas" -> regex para "X entradas", "X inputs", "X in", "X-in", etc.
  const categoryTerms: Record<string, string[]> = {
    entradas: ['entradas?', 'inputs?', 'in\\b'],
    inputs: ['entradas?', 'inputs?', 'in\\b'],
    canais: ['canais', 'canal', 'channels?', 'ch\\b'],
    channels: ['canais', 'canal', 'channels?', 'ch\\b'],
    captadores: ['captadores?', 'sensores?', 'sensors?', 'cmos', 'ccd'],
    sensores: ['sensores?', 'sensors?', 'captadores?', 'cmos', 'ccd'],
    saídas: ['sa[ií]das?', 'outputs?', 'out\\b'],
    outputs: ['sa[ií]das?', 'outputs?', 'out\\b'],
    portas: ['portas?', 'ports?'],
  }

  const terms = categoryTerms[category] || [category]
  const termsRegexStr = terms.join('|')

  // Buscar número associado a essa categoria no texto do produto
  // Formatos comuns no produto: "8 entradas", "8 inputs", "8-channel", "8 channels", "3 CMOS", "3x 2/3", "3 sensores"
  const productSearchPatterns = [
    new RegExp(
      `\\b(oito|tr[eê]s|duas|dois|quatro|cinco|seis|sete|nove|dez|doze|dezesseis|vinte|\\d+)\\s*(?:x|\\*)?\\s*(?:de\\s+)?(?:${termsRegexStr})\\b`,
      'i',
    ),
    new RegExp(
      `\\b(?:${termsRegexStr})\\s*(?:de|:)?\\s*(oito|tr[eê]s|duas|dois|quatro|cinco|seis|sete|nove|dez|doze|dezesseis|vinte|\\d+)\\b`,
      'i',
    ),
    new RegExp(
      `\\b(oito|tr[eê]s|duas|dois|quatro|cinco|seis|sete|nove|dez|doze|dezesseis|vinte|\\d+)-(?:${termsRegexStr})\\b`,
      'i',
    ),
    new RegExp(
      `(\\d+)x\\s*\\d+(?:/\\d+)?["”]?(?:\\s*(?:4k|hd)?)?\\s*(?:cmos|ccd|sensor|captador)`,
      'i',
    ), // Ex: "3x 2/3 4K CMOS"
  ]

  let productNum: number | null = null
  let matchedProductSnippet = ''

  for (const pPat of productSearchPatterns) {
    const pMatch = prodText.match(pPat)
    if (pMatch) {
      matchedProductSnippet = pMatch[0]
      productNum = parseWordNumber(pMatch[1])
      if (productNum !== null) break
    }
  }

  // Se não achou na busca estrita de categoria, mas o produto menciona "8 SDI", "8 HDMI", etc.,
  // e a categoria oficial é entradas/inputs
  if (productNum === null && (category === 'entradas' || category === 'inputs')) {
    const sdiMatch = prodText.match(
      /\b(oito|tr[eê]s|duas|dois|quatro|cinco|seis|sete|nove|dez|doze|dezesseis|vinte|\d+)\s*(?:entradas?\s*)?(?:sdi|hdmi|video|v[ií]deo)\b/i,
    )
    if (sdiMatch) {
      matchedProductSnippet = sdiMatch[0]
      productNum = parseWordNumber(sdiMatch[1])
    }
  }

  // REQUISITO DETERMINÍSTICO (3) CÂMERAS - FILTRAGEM DE MARKETING E CAPTADORES FÍSICOS:
  // Para captadores/sensores (ex.: "com três ou mais captadores de imagem"), exige menção técnica
  // real a sensores físicos (cmos, ccd, captador, sensor). Filtrar slogans comerciais e marketing
  // tipo "3 câmeras em 1", "multi-câmera", "3 cameras in 1" que não indicam múltiplos sensores físicos.
  if (category === 'captadores' || category === 'sensores') {
    const sensorCount = extractPhysicalSensorCount(prodText)
    if (sensorCount !== null) {
      productNum = sensorCount.count
      matchedProductSnippet = sensorCount.snippet
    }
  }

  // REQUISITO DETERMINÍSTICO: INCOMPATIBILIDADE TECNOLÓGICA (POSIÇÃO 90.07 PELÍCULA VS. SENSOR ELETRÔNICO):
  // Se o NCM/Ex pertencer à posição 90.07 ou exigir película fotográfica, e o produto declarar
  // tecnologia eletrônica/digital (sensor, cmos, ccd, digital, etc.), penalização eliminatória imediata (-300)
  const techIncomp = checkTechnologyIncompatibility(
    combinedDesc.match(/\b\d{4,8}\b/)?.[0] || '',
    combinedDesc,
    prodText,
  )
  if (techIncomp.incompatible) {
    return {
      hasPattern: true,
      matchedPattern: 'Tecnologia de captação',
      satisfied: false,
      scoreAdjustment: -300,
      reason: techIncomp.reason,
    }
  }

  // REQUISITO DETERMINÍSTICO (2) SWITCHERS - ENTRADAS DE VÍDEO:  // Para entradas/inputs de vídeo, extrair a contagem técnica de entradas de sinal
  if (category === 'entradas' || category === 'inputs') {
    const inputCount = extractDeclaredVideoInputCount(prodText)
    if (inputCount !== null) {
      productNum = inputCount.count
      matchedProductSnippet = inputCount.snippet
    }
  }

  // Se achou o número no produto, comparar
  if (productNum !== null) {
    const isSatisfied = operator === 'gt' ? productNum > numVal : productNum >= numVal

    if (isSatisfied) {
      return {
        hasPattern: true,
        matchedPattern: matchedRaw,
        extractedCategory: category,
        requiredThreshold: numVal,
        comparisonOperator: operator,
        productValueFound: productNum,
        satisfied: true,
        scoreAdjustment: 80, // +80 pontos decisivos
        reason: `Qualificador quantitativo oficial satisfeito: produto possui ${productNum} ${category} ("${matchedProductSnippet}"), atendendo à exigência "${matchedRaw}". (+80 pts)`,
      }
    } else {
      return {
        hasPattern: true,
        matchedPattern: matchedRaw,
        extractedCategory: category,
        requiredThreshold: numVal,
        comparisonOperator: operator,
        productValueFound: productNum,
        satisfied: false,
        scoreAdjustment: -60, // Penalização por incompatibilidade patente
        reason: `Incompatibilidade quantitativa patente: produto possui apenas ${productNum} ${category} ("${matchedProductSnippet}"), não atendendo à exigência "${matchedRaw}". (-60 pts)`,
      }
    }
  }

  return {
    hasPattern: true,
    matchedPattern: matchedRaw,
    extractedCategory: category,
    requiredThreshold: numVal,
    comparisonOperator: operator,
    satisfied: false,
    scoreAdjustment: 0,
    reason: `Qualificador quantitativo identificado na descrição oficial ("${matchedRaw}"), mas quantidade não comprovada no texto do produto.`,
  }
}

// =============================================================================
// PRINCÍPIO GENÉRICO UNIVERSAL: DETECÇÃO E VÍNCULO INDIRETO DE NCMs DE PEÇAS
// =============================================================================

interface PartsHeadingRange {
  start: number
  end: number
  rawStart: string
  rawEnd: string
}

interface PartsNcmDetectionResult {
  isParts: boolean
  detectedRanges: PartsHeadingRange[]
}

/**
 * Identifica candidato "NCM de peças/partes" pela assinatura textual genérica
 * (ex.: "partes ... destinadas ... aos aparelhos das posições 85.24 a 85.28",
 * "partes e acessórios reconhecíveis como destinada... às máquinas das posições 84.70 a 84.72",
 * "exclusivamente destinadas aos aparelhos da posição 85.25", etc.).
 * Extrai os intervalos ou listas de posições declarados no texto oficial do NCM.
 */
function isPartsNcmPattern(description: string): PartsNcmDetectionResult {
  if (!description || typeof description !== 'string') {
    return { isParts: false, detectedRanges: [] }
  }

  const text = description.toLowerCase()

  // 1. Assinatura primária: menção a partes/acessórios e destinação/utilização
  const hasPartsWord = /\b(?:partes?|pe[çc]as?|acess[oó]rios?)\b/i.test(text)
  const hasDestinedWord =
    /\b(?:destinad[ao]s?|utilizad[ao]s?|concebid[ao]s?|pr[oó]pri[ao]s?|exclusiva(?:mente)?|principalmente)\b/i.test(
      text,
    )
  const hasPositionWord =
    /\b(?:posi[çc][oõ]es|posi[çc][aã]o|subposi[çc][oõ]es|subposi[çc][aã]o|n[úu]meros?)\b/i.test(
      text,
    )

  const isPartsSignature = hasPartsWord && (hasDestinedWord || hasPositionWord)
  if (!isPartsSignature) {
    return { isParts: false, detectedRanges: [] }
  }

  const detectedRanges: PartsHeadingRange[] = []

  // 2. Extração genérica de intervalos no formato "85.24 a 85.28", "84.25 a 84.30", "84.70 a 84.72"
  const rangeRegex = /(\d{2})\.?(\d{2})\s*(?:a|à|-|at[ée]|to)\s*(\d{2})\.?(\d{2})/gi
  let match: RegExpExecArray | null
  while ((match = rangeRegex.exec(text)) !== null) {
    const startNum = parseInt(`${match[1]}${match[2]}`, 10)
    const endNum = parseInt(`${match[3]}${match[4]}`, 10)
    if (!isNaN(startNum) && !isNaN(endNum) && startNum <= endNum) {
      detectedRanges.push({
        start: startNum,
        end: endNum,
        rawStart: `${match[1]}.${match[2]}`,
        rawEnd: `${match[3]}.${match[4]}`,
      })
    }
  }

  // 3. Extração de posições pontuais declaradas após menção a posições/subposições
  // Ex: "aos aparelhos da posição 85.25", "às máquinas da subposição 8471.30"
  const singlePosRegex =
    /(?:posi[çc][aã]o|subposi[çc][aã]o|n[úu]meros?)\s*(?:n[°ºo]\s*)?(\d{2})\.?(\d{2})/gi
  let singleMatch: RegExpExecArray | null
  while ((singleMatch = singlePosRegex.exec(text)) !== null) {
    const posNum = parseInt(`${singleMatch[1]}${singleMatch[2]}`, 10)
    if (!isNaN(posNum)) {
      const alreadyCovered = detectedRanges.some((r) => posNum >= r.start && posNum <= r.end)
      if (!alreadyCovered) {
        detectedRanges.push({
          start: posNum,
          end: posNum,
          rawStart: `${singleMatch[1]}.${singleMatch[2]}`,
          rawEnd: `${singleMatch[1]}.${singleMatch[2]}`,
        })
      }
    }
  }

  return {
    isParts: true,
    detectedRanges,
  }
}

/**
 * Verifica se uma dada posição (4 dígitos, ex: "8525") está compreendida
 * em algum dos intervalos de posições extraídos do NCM de partes.
 */
function isHeadingContainedInPartsRanges(
  heading4Digits: string,
  ranges: PartsHeadingRange[],
): boolean {
  if (!heading4Digits || !ranges || ranges.length === 0) return false
  const headNum = parseInt(heading4Digits.replace(/\D/g, '').slice(0, 4), 10)
  if (isNaN(headNum)) return false

  return ranges.some((range) => headNum >= range.start && headNum <= range.end)
}

/**
 * Extrai os códigos de posição/heading (4 dígitos, ex: "8525") das máquinas-alvo (target_machines)
 * identificadas na Fase 0 / product_understanding.
 *
 * Mapeia tanto códigos numéricos explícitos (ex: "8525", "85.25", "posição 8525") quanto
 * termos ontológicos de máquinas de destino do Sistema Harmonizado (ex: câmeras PTZ / estúdio -> 8525,
 * monitores / telas -> 8528, microfones / áudio -> 8518, computadores -> 8471, lentes -> 9002).
 */
function extractTargetMachineHeadings(targetMachines?: any[] | null): string[] {
  if (!targetMachines || !Array.isArray(targetMachines) || targetMachines.length === 0) {
    return []
  }

  const headings = new Set<string>()
  const headingCodeRegex = /\b(\d{2})\.?(\d{2})\b/g

  for (const rawItem of targetMachines) {
    if (!rawItem) continue
    const itemStr = String(rawItem).trim()
    if (!itemStr) continue

    // 1. Extração direta de códigos de 4 dígitos (ex: "8525", "85.25", "posição 8525")
    let match: RegExpExecArray | null
    while ((match = headingCodeRegex.exec(itemStr)) !== null) {
      const h = `${match[1]}${match[2]}`
      const capNum = parseInt(match[1], 10)
      if (capNum >= 1 && capNum <= 97) {
        headings.add(h)
      }
    }

    const lower = itemStr.toLowerCase()

    // 2. Mapeamento ontológico por termos técnicos de destino da NCM / Sistema Harmonizado:
    // Posição 85.25: Câmeras de televisão, câmeras digitais, câmeras de vídeo, PTZ, estúdio, broadcast
    if (
      /\b(c[aâ]meras?|camcorders?|ptz|filmadoras?|est[uú]dio|televis[aã]o|broadcast|produ[cç][aã]o ao vivo)\b/i.test(
        lower,
      )
    ) {
      headings.add('8525')
    }

    // Posição 85.28: Monitores e projetores, aparelhos receptores de televisão
    if (/\b(monitores?|displays?|projetores?|telas?|televisores?|tvs?)\b/i.test(lower)) {
      headings.add('8528')
    }

    // Posição 85.17: Aparelhos de transmissão/recepção de voz, imagem ou outros dados, redes, roteadores
    if (
      /\b(telecomunica[cç][aã]o|roteadores?|switches?|modems?|intercom|redes?|transmiss[aã]o de dados)\b/i.test(
        lower,
      )
    ) {
      headings.add('8517')
    }

    // Posição 85.18: Microfones e suportes, alto-falantes, fones de ouvido, amplificadores de áudio
    if (/\b(microfones?|mics?|alto-falantes?|fones?|headsets?|[aá]udio)\b/i.test(lower)) {
      headings.add('8518')
    }

    // Posição 85.21: Aparelhos de gravação ou reprodução de vídeo (VTR, VCR, decks gravadores)
    if (/\b(gravadores?|reprodutores?|decks?|vtr|vcr)\b/i.test(lower)) {
      headings.add('8521')
    }

    // Posição 85.25: Aparelhos emissores (transmissores) para radiodifusão ou televisão, câmeras de televisão, digitais e de vídeo, PTZ
    if (
      /\b(c[aâ]meras?|camcorders?|ptz|filmadoras?|est[uú]dio|televis[aã]o|broadcast|produ[cç][aã]o ao vivo|controle de c[aâ]meras?|controlador(?:es)?\s+ptz|remote\s+controllers?|c[aâ]meras?\s+ptz)\b/i.test(
        lower,
      )
    ) {
      headings.add('8525')
    }

    // Posição 84.71: Máquinas automáticas para processamento de dados (computadores, servidores, workstations, unidades de processamento de dados)
    // Mapear para 8471 SOMENTE com evidência estrita de processamento de dados e descartar quando o contexto for controle de câmeras/PTZ
    const isControlContext =
      /\b(controle|controlador(?:es)?|remote|ptz|c[aâ]meras?|joysticks?|consoles?)\b/i.test(lower)
    const isStrictDataProcessing =
      /\b(computador(?:es)?|servidor(?:es)?|workstations?|unidade\s+de\s+processamento\s+de\s+dados)\b/i.test(
        lower,
      )
    if (isStrictDataProcessing && !isControlContext) {
      headings.add('8471')
    }

    // Posição 90.02: Lentes, objetivas, teleobjetivas, filtros ópticos montados
    if (/\b(lentes?|objetivas?|teleobjetivas?|filtros? [oó]pticos?)\b/i.test(lower)) {
      headings.add('9002')
    }

    // Posição 90.06 / 90.07: Câmeras fotográficas ou cinematográficas
    if (/\b(cinematogr[aá]fic[ao]s?|cinematografia)\b/i.test(lower)) {
      headings.add('9007')
    }

    // Posição 96.20: Tripés, monopés, pedestais e artigos semelhantes
    if (/\b(trip[eé]s?|monop[eé]s?|pedestais?)\b/i.test(lower)) {
      headings.add('9620')
    }
  }

  return Array.from(headings)
}

/**
 * Avalia se o produto sob análise possui função própria completa e autônoma,
 * ou se é uma peça/acessório dependente sem função independente.
 * Aplica princípios universais (RGI 1, RGI 3b, Nota 2).
 */
type ProductNatureCategory =
  | 'aparelho com função própria completa'
  | 'acessório dependente (sem função autônoma, requer produto principal para operar)'
  | 'peça de reposição (substituição de componente)'

/**
 * Normaliza o valor de product_nature declarado na Fase 0 / product_understanding
 * para uma das três categorias mutuamente exclusivas.
 */
function normalizeProductNature(val?: any): ProductNatureCategory {
  const raw = String(val || '')
    .toLowerCase()
    .trim()

  if (
    raw.includes('peça de reposição') ||
    raw.includes('peca de reposicao') ||
    raw.includes('substituição de componente') ||
    raw.includes('substituicao de componente') ||
    raw.includes('reposição') ||
    raw.includes('reposicao') ||
    raw.includes('spare part') ||
    raw.includes('replacement part')
  ) {
    return 'peça de reposição (substituição de componente)'
  }

  if (
    raw.includes('acessório dependente') ||
    raw.includes('acessorio dependente') ||
    raw.includes('sem função autônoma') ||
    raw.includes('sem funcao autonoma') ||
    raw.includes('requer produto principal') ||
    raw.includes('acessório sem função autônoma') ||
    raw.includes('acessorio sem funcao autonoma') ||
    raw.includes('dependent accessory')
  ) {
    return 'acessório dependente (sem função autônoma, requer produto principal para operar)'
  }

  return 'aparelho com função própria completa'
}

/**
 * Avalia se o produto sob análise é estritamente uma PEÇA DE REPOSIÇÃO (substituição de componente)
 * sujeita à proibição inversa universal (NCM de partes não pode vencer aparelho autônomo).
 *
 * REGRA VINCULANTE: A proibição inversa vale APENAS para PEÇA DE REPOSIÇÃO.
 * NUNCA para ACESSÓRIO DEPENDENTE que requer produto principal para operar (ex: controle servo zoom de teleobjetiva).
 * O termo "controlador" / "controle" no texto comercial NÃO é tratado como prova de aparelho autônomo
 * quando a Fase 0 declara "acessório dependente".
 */
function evaluateProductHasStandaloneFunction(params: {
  productUnderstanding?: any
  productText?: string
  isKit?: boolean
}): boolean {
  const pu = params.productUnderstanding

  // 1. Prioridade absoluta para o campo categorizado 'product_nature' da Fase 0
  if (pu?.product_nature) {
    const nature = normalizeProductNature(pu.product_nature)
    if (nature === 'peça de reposição (substituição de componente)') {
      return false
    }
    if (
      nature === 'acessório dependente (sem função autônoma, requer produto principal para operar)'
    ) {
      // PRÉ-CONDIÇÃO OBRIGATÓRIA DA DEPENDÊNCIA REAL (Princípio Genérico):
      // Um produto só é legitimamente acessório dependente sem função autônoma se NÃO consegue
      // exercer sua utilidade primordial sem a máquina servida.
      // Se possui função primordial autônoma (captação acústica/áudio, reprodução de áudio,
      // exibição de imagem/vídeo, medição autônoma, processamento autônomo), NÃO é acessório dependente!
      const textToCheck =
        `${params.productText || ''} ${pu?.identity || ''} ${pu?.essential_function || ''}`.toLowerCase()
      // Se possui utilidade primordial autônoma entregue a múltiplos destinos independentes
      // (captação acústica/áudio, reprodução de áudio, exibição autônoma de imagem/vídeo, medição autônoma, processamento autônomo),
      // tem função autônoma e NÃO é parte/acessório dependente.
      // Controladores remotos, joysticks, demandas de servo/foco NÃO possuem utilidade fora da máquina servida!
      const isServicedMachineController =
        /\b(controlador|controller|controle remoto|remote control|joystick|servo zoom|zoom demand|focus demand)\b/i.test(
          textToCheck,
        )
      if (isServicedMachineController) {
        return false
      }

      const hasAutonomousDelivery =
        /\b(microfone|microfones|microphone|microphones|fones? de ouvido|headphones?|alto-falante|alto-falantes|loudspeakers?|monitores? de v[ií]deo|displays? aut[oô]nomos?|c[aâ]meras?)\b/i.test(
          textToCheck,
        )
      if (hasAutonomousDelivery) {
        return true
      }
      // É acessório dependente sem função autônoma! Não tem função standalone.
      return false
    }
    if (nature === 'aparelho com função própria completa') {
      return true
    }
  }

  // 2. Se o product_understanding declarou natureza técnica ou função essencial
  const puFunction = (pu?.essential_function || pu?.primary_use || '').toLowerCase()
  const puNature = (pu?.technical_nature || '').toLowerCase()
  const fullTextContext =
    `${params.productText || ''} ${pu?.identity || ''} ${puFunction} ${puNature}`.toLowerCase()

  // Controladores remotos de máquinas, mesas/consoles dedicados e manoplas de servo operam servindo
  // a máquina-alvo — NÃO são aparelhos autônomos de telecomunicação ou processamento de dados.
  const isDedicatedController =
    /\b(controlador remoto|remote controller|controle de câmeras?|camera remote controller|joystick control|zoom demand|focus demand|manopla de servo)\b/i.test(
      fullTextContext,
    )
  if (isDedicatedController) {
    return false
  }

  // Se o produto entrega função primordial autônoma (captação/reprodução de áudio, imagem, exibição),
  // ele é autônomo e não mera parte/acessório dependente.
  const autonomousDeliveryIndicators = [
    'sistema de microfone',
    'microfone',
    'microphone',
    'fones de ouvido',
    'headphones',
    'alto-falante',
    'monitor de vídeo',
    'câmera',
    'mesa de corte',
    'switch de rede',
    'network switch',
    'roteador',
    'processador de áudio',
  ]

  for (const autoInd of autonomousDeliveryIndicators) {
    if (fullTextContext.includes(autoInd)) {
      return true
    }
  }

  const partsIndicators = [
    'mera peça',
    'peça de reposição',
    'peca de reposicao',
    'substituição de componente',
    'substituicao de componente',
    'componente passivo',
    'gabinete vazio',
    'chassi sem circuitos',
    'parafuso',
    'engrenagem',
    'conector avulso',
    'acessório dependente',
    'acessorio dependente',
    'sem função autônoma',
    'sem funcao autonoma',
  ]

  for (const partTerm of partsIndicators) {
    if (puNature.includes(partTerm) || puFunction.includes(partTerm)) {
      return false
    }
  }

  if (params.isKit) return true

  // Indicadores de aparelho autônomo COMPLETO (sem "controlador" ou "controle" soltos)
  const standaloneIndicators = [
    'aparelho com função própria completa',
    'aparelho com função própria',
    'aparelho completo',
    'função própria completa',
    'standalone',
    'transmissor',
    'receptor',
  ]

  for (const ind of standaloneIndicators) {
    if (puNature.includes(ind) || puFunction.includes(ind)) {
      return true
    }
  }

  // Por padrão, se não marcado como peça ou acessório dependente, aparelho autônomo
  return true
}

/**
 * Avalia a telemetria da lógica de partes com vínculo indireto para gravação no log
 */
/**
 * Detecta se a descrição hierárquica oficial de um NCM corresponde a um aparelho de função própria residual.
 * Princípio universal: posições que contenham a assinatura "não especificados nem compreendidos noutras posições"
 * ou "não especificadas nem compreendidas em outras posições" (ex.: 8543, 8479, etc.).
 */
function isResidualStandaloneDeviceNcm(description: string): boolean {
  if (!description || typeof description !== 'string') return false
  const text = description.toLowerCase()
  return (
    /\bn[aã]o\s+especificad[ao]s?\s+nem\s+compreendid[ao]s?\b/i.test(text) ||
    /\bn[aã]o\s+especificad[ao]s?\s+noutras?\s+posi[çc][oõ]es\b/i.test(text) ||
    /\bn[aã]o\s+especificad[ao]s?\s+em\s+outras?\s+posi[çc][oõ]es\b/i.test(text)
  )
}

/**
 * Interface do veredito de precedência de partes sobre residual de função própria.
 */
interface PartsPrecedenceVerdict {
  applied: boolean
  winning_parts_ncm: string | null
  winning_parts_desc?: string | null
  demoted_residual_ncm: string | null
  demoted_residual_desc?: string | null
  target_machine_position?: string | null
  matched_range?: string | null
  reason?: string | null
}

/**
 * Avalia se há precedência determinística de partes sobre residual de função própria.
 * Princípio universal: Quando product_nature = "acessório dependente" e existir NCM de partes cujo
 * intervalo cubra a posição dos target_machines, o NCM de partes prevalece sobre NCMs residuais
 * ("não especificados nem compreendidos noutras posições", ex.: 8543), pois por RGI 1 a destinação
 * específica a aparelhos de determinada posição prevalece sobre o cesto residual.
 */
function evaluatePartsPrecedenceOverResidual(params: {
  productNature: ProductNatureCategory
  currentRecNcm: string
  currentRecDesc: string
  candidates: any[]
  targetHeadings: string[]
}): {
  shouldOverride: boolean
  winningCandidate: any | null
  demotedCandidate: any | null
  matchedRangeStr: string | null
  matchedHeading: string | null
  verdict: PartsPrecedenceVerdict
} {
  const isDependentAccessory =
    params.productNature ===
    'acessório dependente (sem função autônoma, requer produto principal para operar)'

  if (!isDependentAccessory) {
    return {
      shouldOverride: false,
      winningCandidate: null,
      demotedCandidate: null,
      matchedRangeStr: null,
      matchedHeading: null,
      verdict: {
        applied: false,
        winning_parts_ncm: null,
        demoted_residual_ncm: null,
        reason: 'Precedência de partes não se aplica: produto não é acessório dependente.',
      },
    }
  }

  // PRÉ-CONDIÇÃO DETERMINÍSTICA DA DEPENDÊNCIA REAL (Princípio Genérico 1 e 2):
  // A precedência da Nota 2(b) de partes só pode ser habilitada para acessório dependente se
  // a recomendação atual NÃO pertencer à família de uma função essencial própria entregue pelo produto
  // (ex.: posição 85.18 para captação/reprodução de áudio, 85.28 para exibição).
  // A existência de um elo acessório (como fio, rádio, suporte de câmera) NÃO rebaixa um aparelho de áudio/vídeo
  // com função própria para posição de radiotransmissão nem para partes de câmera.
  const currentDigitsForDepCheck = normalizeNcm(params.currentRecNcm)
  if (currentDigitsForDepCheck.startsWith('8518') || currentDigitsForDepCheck.startsWith('8528')) {
    return {
      shouldOverride: false,
      winningCandidate: null,
      demotedCandidate: null,
      matchedRangeStr: null,
      matchedHeading: null,
      verdict: {
        applied: false,
        winning_parts_ncm: null,
        demoted_residual_ncm: null,
        reason:
          'Precedência de partes não se aplica: a posição atual corresponde à família da função essencial própria entregue pelo produto (áudio/vídeo autônomo).',
      },
    }
  }

  // Verifica se o NCM atualmente recomendado é passível de sobreposição por partes:
  // - Posições residuais de aparelhos com função própria (ex.: 8543 / 8543.70.99)
  // - Ou recomendação atual iniciada por '8537' (quadros/consoles de comando elétrico) ou '8543'
  // - Ou aparelhos genéricos de meio de transmissão/telecomunicação (8517 / 8517.62) quando a função
  //   essencial é controlar/operar a máquina servida (o meio IP/cabo/rádio não é telecomunicação)
  // - Ou NCM residual pela assinatura de texto oficial ("não especificados nem compreendidos noutras posições")
  const currentDigits = normalizeNcm(params.currentRecNcm)
  const isCurrentOverridableByParts =
    isResidualStandaloneDeviceNcm(params.currentRecDesc) ||
    currentDigits.startsWith('8537') ||
    currentDigits.startsWith('8543') ||
    currentDigits.startsWith('8517')

  if (!isCurrentOverridableByParts) {
    return {
      shouldOverride: false,
      winningCandidate: null,
      demotedCandidate: null,
      matchedRangeStr: null,
      matchedHeading: null,
      verdict: {
        applied: false,
        winning_parts_ncm: null,
        demoted_residual_ncm: null,
        reason:
          'Recomendação atual não é NCM residual ou posição sobreponível por partes (8517/8537/8543).',
      },
    }
  }

  // Procurar candidato de partes cujo intervalo case com as posições dos target_machines
  for (const cand of params.candidates || []) {
    const candDesc = cand.ncm_descricao_full || cand.ncm_descricao || cand.source_text || ''
    const partsPattern = isPartsNcmPattern(candDesc)
    if (!partsPattern.isParts || partsPattern.detectedRanges.length === 0) continue

    for (const heading of params.targetHeadings) {
      if (isHeadingContainedInPartsRanges(heading, partsPattern.detectedRanges)) {
        const matchedRangeText = partsPattern.detectedRanges
          .map((r) => `${r.rawStart} a ${r.rawEnd}`)
          .join(', ')

        const winNcm = normalizeNcm(cand.ncm)
        const demNcm = normalizeNcm(params.currentRecNcm)

        return {
          shouldOverride: true,
          winningCandidate: cand,
          demotedCandidate: {
            ncm: params.currentRecNcm,
            description: params.currentRecDesc,
          },
          matchedRangeStr: matchedRangeText,
          matchedHeading: heading,
          verdict: {
            applied: true,
            winning_parts_ncm: winNcm,
            winning_parts_desc: candDesc,
            demoted_residual_ncm: demNcm,
            demoted_residual_desc: params.currentRecDesc,
            target_machine_position: heading,
            matched_range: matchedRangeText,
            reason: `Precedência determinística aplicada (RGI 1, Nota 2(b) do Cap. 85): Para acessório dependente destinado a aparelhos da posição ${heading} (intervalo 85.24 a 85.28), o NCM de partes ${winNcm} (intervalo ${matchedRangeText}) prevalece sobre a posição de função genérica/residual ${demNcm} com base na Nota 2(b) do Capítulo 85.`,
          },
        }
      }
    }
  }

  return {
    shouldOverride: false,
    winningCandidate: null,
    demotedCandidate: null,
    matchedRangeStr: null,
    matchedHeading: null,
    verdict: {
      applied: false,
      winning_parts_ncm: null,
      demoted_residual_ncm: null,
      reason: 'Nenhum NCM de partes casando com os target_machines encontrado entre os candidatos.',
    },
  }
}

/**
 * Avalia a telemetria da lógica de partes com vínculo indireto para gravação no log
 */
function evaluatePartsLogicTelemetry(params: {
  recommendedNcm: string
  recommendedDesc: string
  alternatives: any[]
  candidates: any[]
  targetMachines: string[]
  partsPrecedenceApplied?: PartsPrecedenceVerdict | null
}): {
  parts_logic_triggered: boolean
  matched_range?: string | null
  parts_candidates_found: string[]
  recommended_is_parts: boolean
  alternative_parts: string[]
  parts_precedence_applied: PartsPrecedenceVerdict
  notes: string
} {
  const partsCands = (params.candidates || []).filter((c: any) => {
    const desc = c.ncm_descricao_full || c.ncm_descricao || c.source_text || ''
    return isPartsNcmPattern(desc).isParts
  })

  const recPattern = isPartsNcmPattern(params.recommendedDesc)
  const altParts = (params.alternatives || []).filter((a: any) => {
    return isPartsNcmPattern(a.description || a.reason || '').isParts
  })

  let matchedRangeStr: string | null = null
  for (const pc of partsCands) {
    const desc = pc.ncm_descricao_full || pc.ncm_descricao || pc.source_text || ''
    const pInfo = isPartsNcmPattern(desc)
    if (pInfo.detectedRanges.length > 0) {
      matchedRangeStr = pInfo.detectedRanges.map((r) => `${r.rawStart} a ${r.rawEnd}`).join(', ')
      break
    }
  }

  const precedenceVerdict: PartsPrecedenceVerdict = params.partsPrecedenceApplied || {
    applied: false,
    winning_parts_ncm: null,
    demoted_residual_ncm: null,
  }

  const triggered =
    partsCands.length > 0 || recPattern.isParts || altParts.length > 0 || precedenceVerdict.applied

  return {
    parts_logic_triggered: triggered,
    matched_range: matchedRangeStr,
    parts_candidates_found: partsCands.map((c: any) => normalizeNcm(c.ncm)),
    recommended_is_parts: recPattern.isParts,
    alternative_parts: altParts.map((a: any) => normalizeNcm(a.ncm)),
    parts_precedence_applied: precedenceVerdict,
    notes: precedenceVerdict.applied
      ? `Precedência de partes aplicada com sucesso: NCM ${precedenceVerdict.winning_parts_ncm} venceu sobre residual ${precedenceVerdict.demoted_residual_ncm}.`
      : triggered
        ? `Lógica universal de partes com vínculo indireto avaliada (${partsCands.length} candidatos de partes na base).`
        : 'Nenhum candidato de partes com vínculo indireto envolvido.',
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Endpoint de verificação de integridade e versão do deploy (GET / ou query param ?health=true)
  const reqUrl = new URL(req.url)
  if (req.method === 'GET' || reqUrl.searchParams.get('health') === 'true') {
    return new Response(
      JSON.stringify({
        status: 'ok',
        function: 'classify-ncm',
        version: '3.8.0-build.620',
        knowledge_base_version: '3.1',
        features: [
          'phase0_canonical_composition_derivation',
          'phase0_tripartite_product_nature',
          'orphan_ncm_sweep_invariant',
          'ex_checklist_report_suppression_when_no_ex',
          'auditor_role_ai_providers',
          'two_pass_composite_models',
          'family_expansion_6digits',
          'intrafamily_qualifier_tiebreak',
          'candidate_catalog_integrity_check',
          'full_candidate_audit_logging',
          'parts_ncm_indirect_linking',
          'parts_vs_dependent_accessory_distinction',
          'parts_precedence_over_residual_standalone',
          'parts_precedence_over_8537_and_residual',
          'parts_precedence_over_transmission_medium_8517',
          'own_utility_dependency_test',
          'controller_part_precedence',
          'auditor_verdict_reinclusion_no_silent_fallback',
          'target_machine_serviced_device_mapping',
          'expanded_parts_deterministic_retrieval',
          'defensive_ai_provider_safeguards',
          'candidates_sweep_alternatives_promotion',
          'alternatives_source_tracking',
          'intrafamily_qualifier_score_evaluation',
          'pre_decision_intrafamily_tiebreak',
          'functional_incompatibility_penalization',
          'real_dependency_condition_note2b',
          'essential_delivery_over_medium_principle',
          'auditor_nature_correction_before_ncm',
          'deterministic_85437099_injection',
          'film_only_9007_exclusion',
          'technology_incompatibility_veto',
          'digital_cinema_camera_8525_normalization',
          'statement_timeout_fix',
        ],
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  const startTime = Date.now()

  // 1. Validação de método HTTP
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido. Use POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 2. Validação e extração de Auth JWT do Supabase
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({
        error: 'Cabeçalho Authorization ausente ou malformado. Requer Bearer <JWT>.',
      }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const jwt = authHeader.replace('Bearer ', '').trim()
  if (!jwt) {
    return new Response(
      JSON.stringify({ error: 'Token JWT ausente no cabeçalho Authorization.' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const serviceRoleKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || ''

  // Cliente admin com service_role para ler tabelas protegidas (ai_providers, efetivas, logs)
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  let callerUserId: string | null = null

  // Se a requisição veio com a chave de serviço (ex: chamadas internas/M2M entre sistemas com a mesma infraestrutura)
  if (jwt === serviceRoleKey) {
    const { data: defaultUser } = await supabaseAdmin
      .from('customers')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle()
    callerUserId = defaultUser?.user_id || null
  } else {
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const {
      data: { user },
      error: userError,
    } = await supabaseUserClient.auth.getUser(jwt)

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: 'JWT inválido ou expirado.',
          details: userError?.message,
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    callerUserId = user.id
  }

  // 3. Leitura e validação do payload de entrada
  let body: ClassifyRequestBody
  try {
    body = await req.json()
  } catch (_e) {
    return new Response(JSON.stringify({ error: 'JSON malformado no corpo da requisição.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const productDescription = (body.product_description || '').trim()
  if (!productDescription || productDescription.length < 3) {
    return new Response(
      JSON.stringify({
        error: 'O campo product_description é obrigatório e deve conter no mínimo 3 caracteres.',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const brand = (body.brand || '').trim()
  const model = (body.model || '').trim()
  const additionalSpecs = (body.additional_specs || '').trim()
  const topN = Math.max(8, Math.min(Number(body.top_n) || 15, 30))
  const saveLog = body.save_log !== false
  const productId = body.product_id || null
  const impSimProductId = body.imp_sim_product_id || null

  try {
    // 4. Construir Assinatura Enxuta do Produto
    const leanSignature = buildLeanProductSignature({
      brand,
      model,
      description: productDescription,
    })

    // 5. Análise de Composição Universal (Sistemas / Conjuntos / Kits - RGI 3b/3c)
    // Inicialização prévia de componentes com base no texto comercial para suficiência inicial
    let combinedProductText = [productDescription, brand, model, additionalSpecs]
      .filter(Boolean)
      .join(' ')
    let compositionAnalysis: CompositionAnalysisResult =
      analyzeProductComposition(combinedProductText)

    // 6. GATILHO CONDICIONAL DE BUSCA WEB (ANTES DA DECISÃO)
    // Se a descrição interna não permitir identificar a composição (se for kit com composição indefinida)
    // ou se as specs internas forem insuficientes para qualificar aspectos técnicos,
    // acionar a busca na web OBRIGATORIAMENTE antes de decidir (gatilho condicional, não opcional).
    const webSources: WebSource[] = []
    let webContentSummary = ''

    let sufficiencyCheck = evaluateInformationSufficiency({
      productDescription,
      brand,
      model,
      additionalSpecs,
      compositionAnalysis,
    })

    if (!sufficiencyCheck.isSufficient) {
      try {
        const searchQuery = [brand, model, productDescription, 'specs datasheet']
          .filter(Boolean)
          .join(' ')
          .slice(0, 150)

        const searchResults = await searchWebTechnicalSpecs(searchQuery)
        for (const item of searchResults) {
          webSources.push(item)
        }

        if (webSources.length > 0) {
          webContentSummary = webSources
            .map((s, idx) => `[Fonte ${idx + 1}: ${s.title}] (${s.url})\n${s.snippet || ''}`)
            .join('\n\n')

          // Reavaliar composição e suficiência enriquecidas pelo conteúdo web
          combinedProductText = [
            productDescription,
            brand,
            model,
            additionalSpecs,
            webContentSummary,
          ]
            .filter(Boolean)
            .join(' ')
          compositionAnalysis = analyzeProductComposition(combinedProductText)
          sufficiencyCheck = evaluateInformationSufficiency({
            productDescription,
            brand,
            model,
            additionalSpecs,
            compositionAnalysis,
          })
        }
      } catch (webErr) {
        console.warn('Busca web complementar falhou sem interromper classificação:', webErr)
      }
    }

    const fullTechnicalProfile = [combinedProductText, webContentSummary].filter(Boolean).join('\n')

    // 7. RECUPERAÇÃO ORIENTADA POR SETOR (SEM LISTAS HARDCODED)
    // Mapeamento semântico da assinatura do produto para sua família de posições no banco,
    // garantindo diversidade de posições adjacentes e priorização da família correspondente à assinatura
    const openAiKey = Deno.env.get('OPENAI_API_KEY') || ''
    let queryEmbedding: number[] | null = null
    if (openAiKey) {
      try {
        // Enriquecer embedding da consulta com a assinatura e componentes verbatim
        const embeddingInput = [
          leanSignature,
          compositionAnalysis.detectedComponents.join(' '),
          compositionAnalysis.targetMachines.length > 0
            ? `partes acessorios ${compositionAnalysis.targetMachines.join(' ')}`
            : '',
        ]
          .filter(Boolean)
          .join(' ')

        queryEmbedding = await generateEmbedding(embeddingInput, openAiKey)
      } catch (embErr) {
        console.warn('Falha ao gerar embedding para assinatura enxuta NCM:', embErr)
      }
    }

    let candidates = await retrieveSectorOrientedCandidates({
      supabaseAdmin,
      query: leanSignature,
      queryEmbedding,
      fullTechnicalProfile,
      detectedComponents: compositionAnalysis.detectedComponents,
      targetMachines: compositionAnalysis.targetMachines,
      topN,
    })

    if (candidates.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Nenhum candidato NCM localizado na base oficial para os termos informados.',
          recommendation: null,
          alternatives: [],
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 8. Buscar provedores de IA ativos na tabela public.ai_providers ordenados por prioridade
    // Selecionamos também a coluna 'role' para separar 1ª passada (analyst) e 2ª passada (auditor)
    const { data: rawProviders, error: provError } = await supabaseAdmin
      .from('ai_providers')
      .select(
        'id, provider_name, provider_type, model_id, api_key_secret_name, custom_endpoint, priority_order, role',
      )
      .eq('is_active', true)
      .order('priority_order', { ascending: true })

    if (provError || !rawProviders || rawProviders.length === 0) {
      console.error('Nenhum provedor de IA ativo encontrado em public.ai_providers:', provError)
      return new Response(
        JSON.stringify({
          error: 'Nenhum provedor de IA ativo configurado no sistema.',
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const allRawProviders = rawProviders as (LLMProviderConfig & { role?: string })[]

    // SALVAGUARDA DEFENSIVA (1): Filtrar provedores suportados nativamente pela função.
    // Ignorar (com log de aviso claro, sem derrubar a inferência) qualquer provedor cujo provider_type
    // não seja suportado nativamente — em especial provider_type='custom' com endpoint não-OpenAI-compatível
    // como o Anthropic /v1/messages.
    const ignoredProvidersSummary: Array<{ id: string; name: string; reason: string }> = []
    const allProviders: (LLMProviderConfig & { role?: string })[] = []

    for (const prov of allRawProviders) {
      const pCheck = isSupportedAIProvider(prov)
      if (!pCheck.supported) {
        console.warn(
          `[Salvaguarda Defensiva Provedor de IA]: Provedor ignorado "${prov.provider_name}" (${prov.model_id}, type=${prov.provider_type || 'não informado'}). Motivo: ${pCheck.reason}`,
        )
        ignoredProvidersSummary.push({
          id: prov.id,
          name: prov.provider_name,
          reason: pCheck.reason,
        })
      } else {
        allProviders.push(prov)
      }
    }

    if (allProviders.length === 0) {
      const reasonsList = ignoredProvidersSummary
        .map((ip) => `"${ip.name}": ${ip.reason}`)
        .join('; ')
      console.error(
        `Nenhum provedor de IA suportado permaneceu ativo após filtragem defensiva. Provedores ignorados: ${reasonsList}`,
      )
      return new Response(
        JSON.stringify({
          error: `Nenhum provedor de IA compatível e suportado está ativo. Provedores desconsiderados: ${reasonsList}`,
          ignored_providers: ignoredProvidersSummary,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // SALVAGUARDA DEFENSIVA (2): Separar provedores para Análise (1ª passada) e Auditoria (2ª passada).
    // Se após filtrar não restar provedor ativo para um papel necessário (analyst/auditor), retornar erro claro
    // dizendo qual provedor foi ignorado e por quê, em vez de tentar chamada com configuração ou chave errada.
    const analystProviders = allProviders.filter(
      (p) => (p.role || 'general') === 'analyst' || (p.role || 'general') === 'general',
    )
    const primaryAnalystProviders = analystProviders.length > 0 ? analystProviders : allProviders

    if (primaryAnalystProviders.length === 0) {
      const reasonsList = ignoredProvidersSummary
        .map((ip) => `"${ip.name}": ${ip.reason}`)
        .join('; ')
      return new Response(
        JSON.stringify({
          error: `Nenhum provedor ativo compatível para o papel de analista (1ª passada). Provedores ignorados: ${reasonsList}`,
          ignored_providers: ignoredProvidersSummary,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const auditorProvidersList = allProviders.filter((p) => (p.role || 'general') === 'auditor')
    const primaryAuditorProviders =
      auditorProvidersList.length > 0 ? auditorProvidersList : allProviders

    if (primaryAuditorProviders.length === 0) {
      const reasonsList = ignoredProvidersSummary
        .map((ip) => `"${ip.name}": ${ip.reason}`)
        .join('; ')
      return new Response(
        JSON.stringify({
          error: `Nenhum provedor ativo compatível para o papel de auditor (2ª passada). Provedores ignorados: ${reasonsList}`,
          ignored_providers: ignoredProvidersSummary,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 9. PROMPT UNIVERSAL COM ANÁLISE DE COMPOSIÇÃO (RGI 3b / 3c) E RESTRIÇÃO DE EX
    // Incluir TODOS os candidatos recuperados (incluindo os vindos da expansão de família hierárquica)
    // Formatar catálogo de candidatos mantendo concisão para respeitar limites TPM de provedores de IA
    const candidatesCatalogText = candidates
      .map((c: any, index: number) => {
        const exText = c.ex ? ` [Ex-Tarifário: ${c.ex}]` : ' [Sem Ex]'
        const exDesc = c.ex_descricao ? ` | Ex-Desc: ${c.ex_descricao.slice(0, 300)}` : ''
        const fullDesc = c.ncm_descricao_full || c.ncm_descricao || c.source_text || ''
        const expansionTag = c.is_family_expansion
          ? ` [Origem: Expansão de Família Hierárquica ${c.expansion_parent_6 || ''}]`
          : ''
        return `${index + 1}. NCM: ${c.ncm}${exText}${expansionTag}
   Descrição Hierárquica Completa: ${fullDesc}${exDesc}
   Alíquotas Banco: II=${c.ii_rate}%, IPI=${c.ipi_rate}%, PIS=${c.pis_rate}%, COFINS=${c.cofins_rate}%`
      })
      .join('\n\n')

    const systemPrompt = `Você é o Auditor Fiscal Chefe e Perito em Classificação Aduaneira da My Way Video / My Way Business, especialista na Nomenclatura Comum do Mercosul (NCM), Tarifa Externa Comum (TEC), Notas Explicativas do Sistema Harmonizado (NESH), Regras Gerais para Interpretação (RGI) e Ex-Tarifários (GECEX).

SUA MISSÃO:
Analisar as especificações técnicas de qualquer produto ou sistema e determinar a classificação NCM e Ex-Tarifário rigorosamente correta e juridicamente defensável.
Regra permanente: Todas as instruções são princípios genéricos universais aplicáveis a qualquer mercadoria (Capítulos 84, 85, 90, etc.), jamais atreladas a produtos específicos.

METODOLOGIA OBRIGATÓRIA UNIVERSAL:

0. FASE 0 OBRIGATÓRIA — CONHECIMENTO PLENO DO PRODUTO (PRÉ-REQUISITO DA CLASSIFICAÇÃO):
   Antes de qualquer confronto com posições ou códigos NCM, você DEVE construir o perfil técnico completo do produto:
   - Identidade ontológica: o que o produto É em sua substância física e técnica (ex.: "manopla de controle de servo zoom/foco", "controlador remoto IP", "câmera", "microfone", "conversor").
   - Natureza do produto (product_nature): CLASSIFICAÇÃO OBRIGATÓRIA em exatamente UMA das três categorias mutuamente exclusivas:
     * "acessório dependente (sem função autônoma, requer produto principal para operar)": dispositivo acessório auxiliar ou controlador dedicado cuja utilidade primordial SÓ se exerce operando, conectando ou servindo a máquina-alvo — MESMO que tecnicamente inicialize sozinho ou processe comandos digitalmente (ex.: controlador remoto dedicado de câmeras PTZ via IP/serial, manopla de servo zoom de teleobjetiva, console de comando dedicado de máquina).
       CRITÉRIO OBRIGATÓRIO DE DEPENDÊNCIA REAL (UTILIDADE VS. FUNCIONAMENTO TÉCNICO):
       O teste de dependência real é sobre UTILIDADE, não sobre capacidade de ligar ou trafegar pacotes elétricos/digitais. Produto é "acessório dependente / parte dedicada" quando sua utilidade primordial SÓ se exerce controlando, operando ou servindo a máquina-alvo. O fato de possuir processador, interface de rede IP ou joystick NÃO o transforma em aparelho autônomo nem em aparelho de telecomunicação!
     * "aparelho com função própria completa": equipamento autônomo completo que entrega utilidade própria e autônoma a destinos diversos e independentes da máquina servida (ex.: captação acústica de microfones serve a qualquer gravador/mixer/computador, monitores exibem imagem de qualquer fonte, switchers comutam múltiplos sinais).
     * "peça de reposição (substituição de componente)": componente individual ou sobressalente destinado a substituir peça danificada/desgastada (ex.: engrenagem avulsa, gaxeta, conector avulso, placa sobressalente).
   - Função essencial: o que o produto primariamente ENTREGA, NÃO o meio que usa:
     * PRINCÍPIO DA ENTREGA VS. MEIO: A função essencial do produto/conjunto é o serviço final que ele realiza (ex.: captar áudio acústico = microfone na posição 85.18; exibir imagem = monitor na posição 85.28; captar vídeo = câmera na posição 85.25; controlar/operar remotamente câmeras = parte/acessório na posição 85.29), e JAMAIS o meio físico ou tecnológico de transmissão empregado (elo de rádio UHF, pacotes IP / Ethernet, comandos seriais RS-422, Bluetooth, Wi-Fi, cabo elétrico ou conector).
     * CONTROLAR REMOTAMENTE UMA MÁQUINA NÃO É TELECOMUNICAÇÃO (85.17) NEM PROCESSAMENTO DE DADOS (84.71): Comandos de controle transmitidos via rede IP ou cabo são mero MEIO de acionamento. Controladores remotos dedicados de câmeras ou outras máquinas NÃO são aparelhos de transmissão/comunicação de dados (85.17). A classificação como parte da máquina servida (ex.: 8529.90.90 para câmeras) tem prioridade absoluta sobre posições de meio de transmissão (85.17) e posições residuais de função própria (8543 / 8543.70.99).
     * A existência de transmissão de rádio ou montagem auxiliar (ex.: "camera-mount", sapata de câmera, elo sem fio) NÃO reclassifica um microfone para aparelho de radiotransmissão (85.17) nem para partes de câmera (85.29).
   - Características técnicas relevantes citadas literalmente no texto (interfaces, conectividade, sinais, estrutura).
   - Máquina(s) de destino: se o produto é periférico, parte, acessório ou projetado para operar com uma máquina externa, declare essa máquina (ex.: "teleobjetivas", "câmeras de estúdio"). Em construções "X para Y", Y é máquina de destino, JAMAIS componente do produto.
   - Sentença canônica obrigatória: DEVE constar textualmente no campo canonical_statement a frase no padrão exato:
     "o produto é um [tipo] que [função essencial], destinado a [máquina]" (ou "destinado a operação autônoma" se não houver máquina de destino).
   - A recomendação é INVÁLIDA sem a declaração completa do bloco 'product_understanding'.

1. ANÁLISE DE COMPOSIÇÃO UNIVERSAL (SISTEMAS / CONJUNTOS / KITS - RGI 3b / 3c):
   Para QUALQUER produto reconhecido como sistema, conjunto, sortido ou kit (produtos compostos por múltiplos elementos que operam em conjunto, como transmissor + receptor, console + fonte, etc.):
   (a) EXIGÊNCIA VERBATIM: Os componentes listados DEVEM ser citados TEXTUALMENTE na descrição/especificações do produto fora de conectivos de finalidade ("para", "destinado a", "destina-se a", "for", "designed for", "control of") e fora de modificadores de montagem ("-mount").
   (b) FUNÇÃO ESSENCIAL: Enunciar a função essencial do conjunto como um todo (caráter essencial da RGI 3b) e classificar na família de posições que reflete essa função essencial.
   (c) PROIBIÇÃO ABSOLUTA DE EX SINGULAR PARA CONJUNTO: NUNCA aplique a um conjunto a descrição de um Ex-Tarifário que descreve um item singular/isolado, SALVO se houver fundamento explícito demonstrando que o Ex contempla o conjunto inteiro.

2. METODOLOGIA FUNÇÃO-PRIMEIRO (FUNCTION-FIRST) E PRIORIZAÇÃO DA POSIÇÃO ESPECÍFICA:
   - Valide toda a classificação contra a sentença canônica da Fase 0.
   - Posições específicas têm prioridade absoluta sobre posições residuais/genéricas (RGI 3a).
   - Não classifique em posições genéricas de telecomunicação de dados produtos que possuem posição própria correspondente à sua função específica de áudio, imagem ou medição.
   - VETO DE CONTRADIÇÃO DE NATUREZA: É expressamente PROIBIDO classificar o produto em um NCM cuja descrição hierárquica oficial descreva uma natureza ontológica totalmente diferente do produto (por exemplo: classificar um controlador/console periférico como se fosse a máquina que ele controla, ou classificar um cabo/suporte como monitor).
   - PREFERÊNCIA POR FUNÇÃO GENÉRICA COMPATÍVEL SOBRE FUNÇÃO ESPECÍFICA INCOMPATÍVEL: Entre famílias empatadas na escolha, prefira SEMPRE uma posição de função genérica tecnicamente compatível (ex.: máquinas/aparelhos elétricos com função própria, partes e acessórios reconhecíveis) sobre uma posição de função específica incompatível cuja descrição contradiga o produto.

3. REGRA OBRIGATÓRIA DE DESEMPATE INTRAFAMÍLIA (DISCRIMINAÇÃO TÉCNICA TABULADA):
   - Quando mais de uma subposição da mesma família (mesmos 4 ou 6 primeiros dígitos) estiver entre as candidatas (por exemplo: ramos irmãos 8543.70.xx, 8525.89.xx, 8471.xx, 8518.xx, 9007.xx):
     * O DISCRIMINADOR VINCULANTE É O QUALIFICADOR TÉCNICO TABULADO da subposição (número de entradas, canais, captadores/sensores de imagem, saídas, portas, resolução, tipo de transmissão, dimensões, potência, etc.), situado no SUFIXO FINAL da ncm_descricao_full (após a barra hierárquica "|" ou última vírgula).
     * REGRA DE PREVALÊNCIA ESPECÍFICA ENTRE IRMÃOS RESIDUAIS DA MESMA SUBPOSIÇÃO: entre irmãos da mesma subposição de 6 dígitos, prevalece OBRIGATORIAMENTE aquele cuja descrição específica contemple a função técnica real do equipamento E cujos qualificadores quantitativos (entradas, canais, captadores, sensores, portas) sejam satisfeitos pelo produto, SOBRE subitens residuais de outras aplicações físicas (ex.: telecomunicações, RF, micro-ondas) ou cestos genéricos "Outros".
     * O qualificador de cada subposição irmã DEVE ser confrontado ponto a ponto com as especificações técnicas reais do produto extraídas na Fase 0.
     * Prevalece OBRIGATORIAMENTE a subposição mais específica cujo qualificador técnico seja plenamente satisfeito pelas especificações do produto (ex.: havendo 8 entradas, prevalece "com oito ou mais entradas" sobre "Outros para micro-ondas" ou "Outros"; havendo 3 sensores/captadores, prevalece "Com três ou mais captadores de imagem" sobre "Outras" / sensores únicos).
     * É TERMINANTEMENTE PROIBIDO decidir por menor carga tributária ou por ordem de aparição na lista de candidatos.
4. PROIBIÇÃO ABSOLUTA DE CRITÉRIO TRIBUTÁRIO / ALÍQUOTA:
   - É ESTRITAMENTE PROIBIDO utilizar alíquota ou vantagem tributária (II 0%, Ex vantajoso, redução de carga tributária) como critério de escolha ou desempate.
   - O enquadramento aduaneiro funda-se exclusivamente na função essencial, nas notas da TEC e no texto oficial da NCM/NESH.
   - A alíquota é mera consequência legal do enquadramento técnico, NUNCA motivo ou justificativa.

5. CONDICIONALIDADES RESTRITIVAS DE EX-TARIFÁRIOS:
   - Os Ex-Tarifários são normas de exceção tributária de interpretação estrita (Art. 111 do CTN).
   - Cada valor técnico do produto confrontado com o Ex deve ser copiado LITERALMENTE das especificações. Valor não comprovado ou contraditório impede a concessão do Ex.

6. PRINCÍPIO UNIVERSAL DE VÍNCULO INDIRETO E PRECEDÊNCIA DE PARTES SOBRE RESIDUAL:
   - Identificação do padrão: Linhas cuja descrição hierárquica possui assinatura de "partes e acessórios reconhecíveis como destinada... aos aparelhos/máquinas das posições X a Y" (ou posições específicas equivalentes, ex: 8529.90.90 cobrindo 85.24 a 85.28, 8431 cobrindo 84.25 a 84.30, 8473 cobrindo 84.70 a 84.72, etc.).
   - "Partes reconhecidas" na NCM abrange tanto PEÇAS DE REPOSIÇÃO quanto ACESSÓRIOS DEPENDENTES que não funcionam sozinhos.
   - Teste de vínculo indireto: As máquinas de destino declaradas na Fase 0 (target_machines) estão compreendidas dentro do intervalo de posições declarado no texto oficial do NCM de partes?
     * Se SIM: O NCM de partes é candidato legítimo (RGI 1 e 2; Nota 2 dos Capítulos 84, 85 e 90).
   - REGRA DE PRECEDÊNCIA DE PARTES SOBRE RESIDUAL DE FUNÇÃO PRÓPRIA (RGI 1, NOTA 2(b) DO CAP. 85):
     * Quando product_nature = "acessório dependente (sem função autônoma, requer produto principal para operar)" e existir NCM de partes cujo vínculo indireto casar (intervalo de posições cobre a posição dos target_machines):
       A ordem de decisão é: NCM de partes casando = RECOMENDADO.
       NCM de aparelho de função própria residual (texto contém "não especificados nem compreendidos noutras posições", ex.: 8543 / 8543.70.99) NÃO PODE vencer um NCM de partes casando. O residual só é recomendável quando nenhuma parte casar ou quando o produto for aparelho autônomo completo.
       Justificativa obrigatória citando a Nota 2(b) do Cap. 85 e o intervalo de posições do texto da parte. O residual derrotado deve constar como alternativa residual.
   - REGRA PARA "aparelho com função própria completa":
     * Para aparelho completo (product_nature = "aparelho com função própria completa"), a regra de precedência de partes NÃO se aplica — aparelho completo fica na sua NCM de função autônoma (ex.: câmera em 8525.89.21), e NCM de partes não vence aparelho completo.
   - REGRA DA PROIBIÇÃO INVERSA (DELIMITAÇÃO PRECISA):
     * A proibição de vencer vale ESTRITAMENTE para "peça de reposição (substituição de componente)". Uma peça de reposição avulsa nunca pode ser recomendada para equipamento autônomo completo.
     * NUNCA aplique a proibição inversa a "acessório dependente (sem função autônoma, requer produto principal para operar)".
     * Para acessório dependente, o NCM de partes DEVE ser RECOMENDADO quando o vínculo indireto casar (target_machines dentro do intervalo declarado no texto).
     * O conflito com aparelho completo é resolvido por RGI 3b considerando a categoria "product_nature" da Fase 0, e JAMAIS por termos de marketing soltos como "controlador" ou "controle".
   - JUSTIFICATIVA OBRIGATÓRIA DE VÍNCULO INDIRETO:
     * Quando o recomendado for acessório dependente em NCM de partes, explicitar a natureza: "acessório sem função autônoma, destinado a [target_machines], dentro do intervalo X a Y declarado no texto (RGI 1/2, Nota 2(b) do Cap. 85)".
     * Quando for aparelho com função própria autônoma, este prevalece na recomendação, e o NCM de partes DEVE constar como alternativa com justificativa do vínculo indireto.

7. UNIVERSO DE CANDIDATOS E FORMATO DE SAÍDA:
- Escolha o recommended_ncm e recommended_ex EXCLUSIVAMENTE a partir da lista de candidatos fornecida.
- Na justificativa ("justification"), é OBRIGATÓRIO citar a descrição hierárquica completa oficial (Capítulo | Posição | Subitem do NCM escolhido) para fundamentar com precisão aduaneira o enquadramento.
- HIERARQUIZAÇÃO ENTRE APARELHO COM FUNÇÃO PRÓPRIA E PARTES/ACESSÓRIOS:
  Quando a função essencial for "aparelho com função própria" e existir família de partes/acessórios da máquina de destino, AMBAS as famílias devem constar na resposta (uma na recomendação e a outra nas alternativas) com a devida justificativa técnica de hierarquização e vínculo indireto.
- Responda OBRIGATORIAMENTE em JSON válido sem texto externo, no formato exato:
{
"product_understanding": {
  "identity": "O que o produto é em sua substância técnica ontológica",
  "product_nature": "aparelho com função própria completa" | "acessório dependente (sem função autônoma, requer produto principal para operar)" | "peça de reposição (substituição de componente)",
  "essential_function": "Função técnica essencial que confere utilidade primária",
  "technical_features": ["especificação 1", "especificação 2"],
  "target_machines": ["máquina de destino 1"],
  "canonical_statement": "o produto é um [tipo] que [função essencial], destinado a [máquina]"
},
"is_kit_or_system": boolean,
"components_list": ["componente verbatim 1", "componente verbatim 2"],
"essential_function": "Enunciação clara e precisa da função essencial do produto ou conjunto",
"recommended_ncm": "8 dígitos",
"recommended_ex": "número do Ex (ex: '019') ou '' se sem Ex",
"justification": "Justificativa detalhada citando a descrição hierárquica completa (ncm_descricao_full), análise de composição (RGI 3b), confronto com a sentença canônica da Fase 0 e notas da TEC",
"legal_basis": {
 "regime": "BK ou BIT ou GERAL",
 "notes": "referência legal ou justificativa sumária"
},
"confidence": "alta" | "media" | "baixa",
"alternatives": [
 {
   "ncm": "8 dígitos",
   "ex": "Ex ou ''",
   "reason": "Motivo fiscal e técnico funcionalmente plausível"
 }
]
}`

    const userPrompt = `PRODUTO A CLASSIFICAR:
- Descrição: ${productDescription}
- Marca / Fabricante: ${brand || 'Não informada'}
- Modelo / P/N: ${model || 'Não informado'}
- Especificações adicionais: ${additionalSpecs || 'Nenhuma informada'}

FASE 0 — INFORMAÇÕES TÉCNICAS DO PRODUTO:
- Componentes físicos integrados (verbatim, fora de conectivos de destino): ${compositionAnalysis.detectedComponents.join(', ') || 'Item singular (sem múltiplos componentes integrados)'}
- Máquina(s) de destino da função (extraídas de conectivos/montagem): ${compositionAnalysis.targetMachines.join(', ') || 'Nenhuma (operação autônoma)'}
- É reconhecido como Sistema / Conjunto / Kit: ${compositionAnalysis.isKit ? 'SIM' : 'NÃO'}

AVALIAÇÃO DE SUFICIÊNCIA DAS INFORMAÇÕES:
- Informações suficientes internamente: ${sufficiencyCheck.isSufficient ? 'SIM' : 'NÃO'} (${sufficiencyCheck.reason})
${webContentSummary ? `\nINFORMAÇÕES TÉCNICAS COMPLEMENTARES OBTIDAS VIA BUSCA WEB:\n${webContentSummary}\n` : ''}

LISTA DE CANDIDATOS NCM VÁLIDOS (Recuperados do Banco de Dados Oficial):
${candidatesCatalogText}

Construa a FASE 0 obrigatória no campo 'product_understanding' com a sentença canônica "o produto é um [tipo] que [função essencial], destinado a [máquina]", avalie todos os candidatos e forneça o JSON estruturado conforme o protocolo aduaneiro.`

    // 10. Chamada ao LLM com cascata de fallback (1ª Passada - Análise Técnica)
    let llmResponseJson: any = null
    let analystModelUsed = ''
    let auditorModelUsed = ''
    let lastLlmError = ''

    for (const provider of primaryAnalystProviders) {
      const apiKey = Deno.env.get(provider.api_key_secret_name) || ''
      if (!apiKey) continue

      try {
        const rawContent = await invokeLLMWithTimeout(
          provider,
          apiKey,
          systemPrompt,
          userPrompt,
          25000,
        )

        const parsed = parseLLMJsonResponse(rawContent)
        if (parsed && parsed.recommended_ncm) {
          const normRecNcm = normalizeNcm(parsed.recommended_ncm)
          const candidateMatch = candidates.find((c: any) => normalizeNcm(c.ncm) === normRecNcm)

          if (candidateMatch) {
            llmResponseJson = parsed
            analystModelUsed = `${provider.provider_name} (${provider.model_id})`
            break
          } else {
            console.warn(
              `LLM sugeriu NCM ${parsed.recommended_ncm} fora da lista de candidatos. Tentando fallback.`,
            )
          }
        }
      } catch (err: any) {
        lastLlmError = err?.message || String(err)
        console.warn(`Falha no provedor ${provider.provider_name}:`, lastLlmError)
      }
    }

    if (!llmResponseJson) {
      console.error('Todos os provedores LLM falharam ao classificar NCM:', lastLlmError)
      return new Response(
        JSON.stringify({
          error: 'Falha na inferência dos provedores de IA ativos.',
          details: lastLlmError,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 11. CÓDIGO DETERMINÍSTICO — CHECKLIST UNIVERSAL DE CONDIÇÕES RESTRITIVAS DO EX
    // Extração em código de qualificadores do Ex e confrontação com o perfil técnico do produto.
    // Formato obrigatório na justificativa: "produto: X → Ex exige: Y → ATENDE/NÃO ATENDE"
    // Se qualquer condição não for atendida, o Ex é VETADO AUTOMATICAMENTE em código.
    const initialRecNcm = normalizeNcm(llmResponseJson.recommended_ncm)
    let initialRecEx = (llmResponseJson.recommended_ex || '').toString().trim()

    let activeExCandidate = candidates.find(
      (c: any) => normalizeNcm(c.ncm) === initialRecNcm && (c.ex || '').trim() === initialRecEx,
    )

    // Se o candidato tiver Ex-Tarifário, executar checklist de validação em código
    let checklistLog: ExChecklistResult = {
      passed: true,
      status: 'APROVADO',
      requiresExpertReview: false,
      comparisons: [],
      missingInformation: [],
      needsWebSearch: false,
    }

    let checklistFormattedReport = ''
    let exVetoApplied = false

    if (initialRecEx && activeExCandidate?.ex_descricao) {
      // 11.A Se specs internas forem insuficientes para verificar uma condição, acionar busca na web antes de decidir
      checklistLog = evaluateExChecklistAgainstProduct({
        exDescription: activeExCandidate.ex_descricao,
        productText: fullTechnicalProfile,
        isKit: compositionAnalysis.isKit,
        detectedComponents: compositionAnalysis.detectedComponents,
      })

      // Se precisava de busca na web e ainda não tinha sido feita, acionar agora
      if (checklistLog.needsWebSearch && webSources.length === 0) {
        try {
          const targetedQuery = [brand, model, activeExCandidate.ex_descricao.slice(0, 60)]
            .filter(Boolean)
            .join(' ')
          const addlSources = await searchWebTechnicalSpecs(targetedQuery)
          for (const s of addlSources) webSources.push(s)
          if (addlSources.length > 0) {
            const addlSummary = addlSources
              .map(
                (s, idx) =>
                  `[Fonte Web Adicional ${idx + 1}: ${s.title}] (${s.url})\n${s.snippet || ''}`,
              )
              .join('\n\n')
            webContentSummary = [webContentSummary, addlSummary].filter(Boolean).join('\n\n')
            // Reavalia com as novas informações
            checklistLog = evaluateExChecklistAgainstProduct({
              exDescription: activeExCandidate.ex_descricao,
              productText: [fullTechnicalProfile, addlSummary].join('\n'),
              isKit: compositionAnalysis.isKit,
              detectedComponents: compositionAnalysis.detectedComponents,
            })
          }
        } catch (searchErr) {
          console.warn('Busca web complementar de desempate do checklist falhou:', searchErr)
        }
      }

      // Montar a justificativa formatada no padrão exigido:
      // "produto: X → Ex exige: Y → ATENDE/NÃO ATENDE"
      if (checklistLog.comparisons.length > 0) {
        checklistFormattedReport = checklistLog.comparisons
          .map(
            (c) =>
              `• produto: ${c.productValue} → Ex exige: ${c.exRequirement} → ${c.status}${c.reason ? ` (${c.reason})` : ''}`,
          )
          .join('\n')
      } else if (checklistLog.status === 'NÃO VERIFICADO') {
        checklistFormattedReport =
          '• Extração de qualificadores técnicos do Ex resultou vazia: status NÃO VERIFICADO (requer revisão especialista).'
      }

      // VETO AUTOMÁTICO EM CÓDIGO se qualquer condição não for atendida
      if (!checklistLog.passed) {
        exVetoApplied = true
        console.warn(
          `[Checklist Ex-Tarifário Veto Automático]: O Ex ${initialRecEx} da posição ${initialRecNcm} foi vetado. Motivo: ${checklistLog.vetoReason}`,
        )

        // Remover o Ex da recomendação e rebaixar para a alíquota base ou alternativa adequada
        initialRecEx = ''
        llmResponseJson.recommended_ex = ''
      }
    }

    // 12. SEGUNDA PASSADA DE AUDITORIA LLM
    // Se a 1ª passada recomendou posição genérica residual (ex: 85176291 ou similar) quando há candidatos
    // específicos de setor ou componentes no catálogo de candidatos, alertar na auditoria
    const initialRecommendation = {
      recommended_ncm: initialRecNcm,
      recommended_ex: (llmResponseJson.recommended_ex || '').toString().trim(),
      essential_function: llmResponseJson.essential_function || '',
      justification: llmResponseJson.justification || '',
      product_understanding: llmResponseJson.product_understanding || null,
    }

    let auditVerdict: {
      action: 'APROVA' | 'VETA'
      essential_function: string
      corrected_ncm?: string
      corrected_ex?: string
      correction_reason?: string
      audit_critique: string
      override_applied?: boolean
      override_reason?: string
      product_understanding?: any
    } = {
      action: 'APROVA',
      essential_function: initialRecommendation.essential_function,
      audit_critique: 'Aprovado pelo perito auditor.',
      product_understanding: initialRecommendation.product_understanding,
    }

    // Inicializar auditorModelUsed com o modelo que será chamado ou com o provedor preferencial
    if (primaryAuditorProviders.length > 0) {
      auditorModelUsed = `${primaryAuditorProviders[0].provider_name} (${primaryAuditorProviders[0].model_id})`
    }
    // Se o código determinístico vetou o Ex, registrar o status no initialRecommendation
    if (exVetoApplied) {
      initialRecommendation.recommended_ex = ''
    }

    try {
      const auditorSystemPrompt = `Você é o Auditor Revisor Sênior da Receita Federal e Aduana, atuando como segunda instância independente para homologar ou vetar a recomendação de classificação NCM.

PROTOCOLO OBRIGATÓRIO DE AUDITORIA (PRINCÍPIOS GENÉRICOS UNIVERSAIS):
0. FASE 0 OBRIGATÓRIA — AUDITORIA DE ENTENDIMENTO DO PRODUTO (PRÉ-REQUISITO):
   - Você DEVE conferir se o 'product_understanding' da 1ª passada é perfeitamente coerente com a descrição do produto e suas especificações.
   - Valide rigorosamente o campo 'product_nature' em exatamente uma das três categorias:
     "aparelho com função própria completa" / "acessório dependente (sem função autônoma, requer produto principal para operar)" / "peça de reposição (substituição de componente)".
   - CRITÉRIO DA DEPENDÊNCIA REAL E CORREÇÃO DE NATUREZA (UTILIDADE VS. FUNCIONAMENTO TÉCNICO):
     * O teste de dependência é sobre UTILIDADE, não sobre capacidade de ligar ou emitir pacotes IP/elétricos.
     * Dispositivos cuja utilidade primordial é CONTROLAR ou OPERAR a máquina servida (ex.: controlador remoto dedicado de câmeras PTZ, manopla servo zoom) são ACESSÓRIOS DEPENDENTES (partes dedicadas), mesmo que inicializem sozinhos ou tenham comandos via IP.
     * Somente produtos que entregam utilidade própria autônoma a destinos diversos (ex.: captação de áudio de microfones) são "aparelho com função própria completa".
   - PRINCÍPIO DO QUE O PRODUTO ENTREGA (NÃO O MEIO):
     * A função essencial é o que o produto ENTREGA (ex.: captar áudio = 85.18; controlar câmeras = parte na 8529.90.90), NÃO o meio de transporte do sinal (elo de rádio UHF, protocolo IP, Ethernet, RS-422, cabo).
     * CONTROLAR UMA MÁQUINA NÃO É SERVIÇO DE TELECOMUNICAÇÃO: Comandos de controle enviados via IP são o MEIO. É expressamente PROIBIDO classificar controladores de câmeras em posições de telecomunicação (85.17) ou de processamento de dados (84.71).
     * O NCM de partes casado com a máquina servida (ex.: 8529.90.90 para câmeras) prevalece sobre aparelhos genéricos de meio de transmissão (8517) e residuais (8543).
     * O auditor JAMAIS pode vetar o NCM da família da função essencial própria (ex.: 85.18 para microfones) com base em premissa de 'acessório dependente' ou 'radiotransmissão'.
   - Em "X para Y", Y é máquina de destino, JAMAIS componente integrado.
   - Entendimento incoerente INVALIDA a recomendação (action: "VETA").
   - Construa ou homologue o perfil técnico na saída com a sentença canônica canônica obrigatória:
     "o produto é um [tipo] que [função essencial], destinado a [máquina]".
1. ENUNCIAÇÃO DA FUNÇÃO ESSENCIAL: declare a função essencial que confere caráter essencial ao produto ou conjunto global (RGI 1 e RGI 3b).
2. DESEMPATE INTRAFAMÍLIA OBRIGATÓRIO (DISCRIMINAÇÃO TÉCNICA TABULADA):
   - Quando mais de uma subposição da mesma família hierárquica (mesmos 4 ou 6 primeiros dígitos) estiver presente entre as candidatas (ex.: 8543.70.x, 8525.89.x):
     * O DISCRIMINADOR VINCULANTE É O QUALIFICADOR TÉCNICO TABULADO da subposição (nº de entradas, canais, captadores/sensores de imagem, saídas, portas, resolução, tecnologia do sensor, tipo de modulação, dimensões, potência, etc.), situado no sufixo final da ncm_descricao_full.
     * REGRA DE PREVALÊNCIA ESPECÍFICA ENTRE IRMÃOS RESIDUAIS DA MESMA SUBPOSIÇÃO: entre irmãos da mesma subposição de 6 dígitos (ex.: 8543.70.x), prevalece OBRIGATORIAMENTE aquele cuja descrição específica contemple a função do equipamento E cujos qualificadores quantitativos (entradas, canais, captadores, sensores, portas) sejam satisfeitos pelo produto, SOBRE subitens de outras aplicações físicas restritas (ex.: micro-ondas, RF, telecomunicação) ou cestos residuais "Outros".
     * Esse qualificador DEVE ser confrontado rigorosamente com as especificações do produto extraídas na Fase 0 (ex.: para switcher com 8 entradas, subitem com "oito ou mais entradas" DEVE prevalecer sobre subitens de micro-ondas ou "Outros"; para câmera com 3 sensores, prevalece "Com três ou mais captadores de imagem").
     * Prevalece OBRIGATORIAMENTE a subposição mais específica cujo qualificador seja satisfeito pelas especificações do produto.
     * É TERMINANTEMENTE PROIBIDO decidir por menor carga tributária ou por ordem de aparição na lista. Se a 1ª passada escolheu uma subposição menos específica ou com qualificador incorreto, você DEVE VETAR e CORRIGIR ("corrected_ncm").
3. O VETO AO EX-TARIFÁRIO NÃO ENCERRA A ANÁLISE:
   - Vetar um Ex-Tarifário NÃO significa manter automaticamente o NCM base residual.
   - O auditor DEVE re-confrontar a descrição oficial da posição/subposição do NCM base com a função essencial do produto.
   - Se a descrição da posição base não corresponder com exatidão à função essencial, a recomendação DEVE MIGRAR (action: "VETA") para a família correta entre os candidatos disponíveis.
4. CONJUNTOS / SISTEMAS: NUNCA homologue Ex-Tarifário singular individual para conjuntos ou sistemas de múltiplos elementos funcionais.
5. CONDIÇÕES TÉCNICAS E COERÊNCIA (A CORREÇÃO NÃO É SEGUNDA CHANCE SEM AUDITORIA):
   - A NCM/Ex corrigido na 2ª passada deve passar pelo MESMO checklist de condições restritivas e confronto com a sentença canônica da Fase 0.
   - É terminantemente VETADO qualquer candidato cuja descrição hierárquica (ncm_descricao_full) contradiga a natureza ontológica do produto (ex.: candidato descreve "câmera" para um produto que é controlador remoto; candidato descreve "monitor" para um produto que é cabo ou transmissor).
6. PROIBIÇÃO ESTRITA DE VANTAGEM TRIBUTÁRIA / ALÍQUOTA:
   - É ESTRITAMENTE PROIBIDO usar alíquota ou vantagem fiscal (II 0%, Ex vantajoso) como critério de escolha ou desempate.
7. PREFERÊNCIA POR FUNÇÃO GENÉRICA COMPATÍVEL SOBRE FUNÇÃO ESPECÍFICA INCOMPATÍVEL:
   - Entre famílias empatadas na correção, prefira SEMPRE uma posição de função genérica tecnicamente compatível (ex.: aparelhos com função própria, partes e acessórios reconhecíveis) sobre uma posição de função específica incompatível.
8. VETO A TODAS AS ALTERNATIVAS:
   - O veto por contradição de natureza e coerência técnica vale para TODA a lista de alternativas. Nenhuma alternativa com autocontradição ou incompatibilidade ontológica pode ser mantida.
9. VÍNCULO INDIRETO PARA NCMs DE PARTES E ACESSÓRIOS:
   - Para candidatos NCM de partes (assinatura "partes e acessórios reconhecíveis como destinada... aos aparelhos das posições X a Y"):
   - "Partes reconhecidas" abrange tanto peças de reposição quanto acessórios dependentes sem função autônoma.
   - A PROIBIÇÃO INVERSA VALE APENAS PARA "peça de reposição (substituição de componente)".
   - Para "acessório dependente (sem função autônoma)", o NCM de partes DEVE poder ser recomendado quando o vínculo indireto casar com as target_machines no intervalo do NCM.
   - Conflito com aparelho completo é dirimido por RGI 3b via product_nature da Fase 0, nunca por palavras soltas de marketing.
   - Quando o recomendado for acessório dependente em NCM de partes, a justificativa deve explicitar: "acessório sem função autônoma, destinado a [target_machines], dentro do intervalo X a Y declarado no texto (RGI 1/2, Nota 2)".

RESPOSTA OBRIGATÓRIA EM JSON:
{
  "product_understanding": {
    "identity": "Identidade do produto",
    "product_nature": "aparelho com função própria completa" | "acessório dependente (sem função autônoma, requer produto principal para operar)" | "peça de reposição (substituição de componente)",
    "essential_function": "Função essencial",
    "target_machines": ["máquina de destino"],
    "canonical_statement": "o produto é um [tipo] que [função essencial], destinado a [máquina]",
    "coherent_with_description": boolean
  },
  "essential_function": "Função essencial do produto/conjunto",
  "action": "APROVA" ou "VETA",
  "audit_critique": "Análise crítica do confronto entre a descrição do NCM, o product_understanding e a função essencial",
  "corrected_ncm": "8 dígitos se VETA",
  "corrected_ex": "Ex corrigido ou ''",
  "correction_reason": "Fundamentação legal da migração de posição ou do veto"
}`

      const auditorUserPrompt = `PRODUTO ANALISADO:
- Marca: ${brand || 'Não informada'} | Modelo: ${model || 'Não informado'}
- Descrição: ${productDescription}
- Assinatura: ${leanSignature}
- É Conjunto/Sistema: ${compositionAnalysis.isKit ? 'SIM' : 'NÃO'} (Componentes verbatim fora de conectivos: ${compositionAnalysis.detectedComponents.join(', ') || 'Nenhum identificado textualmente'})
- Máquina(s) de destino identificadas: ${compositionAnalysis.targetMachines.join(', ') || 'Nenhuma (operação autônoma)'}
- Especificações: ${additionalSpecs || 'N/A'}

RECOMENDAÇÃO DA 1ª PASSADA:
- Entendimento do Produto (Fase 0): ${JSON.stringify(initialRecommendation.product_understanding || {})}
- Função Enunciada: ${initialRecommendation.essential_function}
- NCM: ${initialRecommendation.recommended_ncm} | Ex: ${initialRecommendation.recommended_ex || 'Nenhum'}
- Status do Checklist em Código: ${checklistLog.passed ? checklistLog.status || 'ATENDEU' : 'VETADO PELO CÓDIGO'}
${checklistFormattedReport ? `\nCHECKLIST DE CONDIÇÕES DO EX:\n${checklistFormattedReport}\n` : ''}

ATENÇÃO AUDITOR:
1. DESEMPATE INTRAFAMÍLIA: Verifique se existem subposições irmãs no mesmo ramo (mesmos 6 primeiros dígitos) no catálogo abaixo (ex.: 8543.70.x, 8525.89.x). Entre irmãos da mesma subposição de 6 dígitos, prevalece a subposição cuja descrição específica contemple a função do equipamento E cujos qualificadores quantitativos (entradas, canais, captadores, sensores, portas) sejam satisfeitos pelo produto (ex.: 8 entradas -> "oito ou mais entradas"), sobre residuais de outras aplicações físicas (ex.: sinais de micro-ondas) ou "Outros". Confrontar o qualificador discriminante no final da ncm_descricao_full com as especificações do produto. Prevalece SEMPRE a subposição mais específica correspondente às especificações reais. VETE e corrija se a 1ª passada escolheu subposição irmã menos específica, com qualificador incompatível ou aplicação física excludente.
2. Se o Ex foi vetado ou se a posição base recomendada (${initialRecommendation.recommended_ncm}) não descreve a função essencial da mercadoria com exatidão e existem posições específicas de família no catálogo abaixo, VETE (action: "VETA") e MIGRE para o NCM mais adequado entre os candidatos disponíveis.
3. VETAR O EX NÃO SIGNIFICA MANTER O NCM RESIDUAL: Você DEVE verificar se a posição base 4/6/8 dígitos faz sentido para o produto. Se não fizer, altere o NCM em "corrected_ncm".
4. A CORREÇÃO DEVE RESPEITAR A NATUREZA DO PRODUTO: Jamais corrija para um NCM cuja descrição contradiga o que o produto é (ex.: não escolha NCM de câmera para controlador, nem NCM de máquinas para produto eletroeletrônico).
5. É TERMINANTEMENTE PROIBIDO escolher por benefício fiscal (alíquota zero/reduzida) ou por ordem de recuperação. O critério é 100% técnico.
6. Se houver dúvida entre posições específicas que contradizem o produto e posições genéricas compatíveis (máquinas com função própria / partes e acessórios), prefira a genérica compatível.
7. VÍNCULO INDIRETO E PRECEDÊNCIA DE PARTES SOBRE RESIDUAL (RGI 1, NOTA 2(b) DO CAP. 85 / NESH):
   - Avalie se as target_machines da Fase 0 estão compreendidas no intervalo de posições do texto oficial do NCM de partes (ex.: 8529.90.90 cobrindo 85.24 a 85.28).
   - REGRA DE PRECEDÊNCIA PARA "acessório dependente (sem função autônoma, requer produto principal para operar)":
     * Quando product_nature = "acessório dependente" e existir NCM de partes cujo vínculo indireto casar (intervalo de posições cobre a posição dos target_machines, ex.: câmeras da posição 8525):
       A ordem de decisão é OBRIGATÓRIA: NCM de partes casando = RECOMENDADO.
       NCM de aparelho de função própria RESIDUAL (cuja descrição oficial contenha "não especificados nem compreendidos noutras posições" ou "não especificadas noutras posições", ex.: posição residual 8543 / 8543.70.99) NÃO PODE vencer um NCM de partes casando.
       Pela RGI 1 e Nota 2(b) do Cap. 85, a destinação específica a aparelhos de determinada posição prevalece sobre o cesto residual geral.
       O residual só é recomendável quando NENHUMA parte casar ou quando o produto for aparelho autônomo completo.
       Se a 1ª passada recomendou o residual (ex.: 8543.70.99) para um acessório dependente com partes casando (ex.: 8529.90.90), você DEVE VETAR (action: "VETA") e CORRIGIR para o NCM de partes ("corrected_ncm"), rebaixando o residual a alternativa.
       Justificativa OBRIGATÓRIA citando a Nota 2(b) do Cap. 85 e o intervalo de posições do texto da parte.
     * PREVALÊNCIA DA FUNÇÃO PRÓPRIA AUTÔNOMA: A regra de precedência de partes NUNCA se aplica a produtos com função primordial autônoma (captação/reprodução de áudio como microfones da posição 85.18, monitores de vídeo da posição 85.28). O auditor NUNCA pode vetar o NCM da família da função própria (85.18) alegando que o elo sem fio ou acessório de montagem o transforma em parte ou rádio.
   - REGRA PARA "aparelho com função própria completa":
     * Para aparelho completo (product_nature = "aparelho com função própria completa"), a regra anterior NÃO se aplica. O aparelho completo fica na sua NCM de função autônoma (ex.: microfone em 8518, câmera em 8525.89.21, switcher/console autônomo), e NCM de partes NÃO vence aparelho completo.
   - PROIBIÇÃO INVERSA:
     * A proibição inversa vale APENAS para "peça de reposição (substituição de componente)". Uma peça de reposição avulsa nunca pode ser recomendada para equipamento autônomo completo.

LISTA DE CANDIDATOS VÁLIDOS:
${candidatesCatalogText}`

      for (const provider of primaryAuditorProviders) {
        const apiKey = Deno.env.get(provider.api_key_secret_name) || ''
        if (!apiKey) continue

        try {
          const auditRawContent = await invokeLLMWithTimeout(
            provider,
            apiKey,
            auditorSystemPrompt,
            auditorUserPrompt,
            20000,
          )
          const parsedAudit = parseLLMJsonResponse(auditRawContent)
          if (parsedAudit && (parsedAudit.action === 'APROVA' || parsedAudit.action === 'VETA')) {
            auditorModelUsed = `${provider.provider_name} (${provider.model_id})`
            auditVerdict = {
              action: parsedAudit.action,
              essential_function:
                parsedAudit.essential_function || initialRecommendation.essential_function,
              corrected_ncm: parsedAudit.corrected_ncm
                ? normalizeNcm(parsedAudit.corrected_ncm)
                : undefined,
              corrected_ex: (parsedAudit.corrected_ex || '').toString().trim(),
              correction_reason: parsedAudit.correction_reason || '',
              audit_critique: parsedAudit.audit_critique || '',
              product_understanding:
                parsedAudit.product_understanding || initialRecommendation.product_understanding,
            }
            break
          }
        } catch (auditCallErr) {
          console.warn(
            `Falha na chamada de auditoria com provedor ${provider.provider_name}:`,
            auditCallErr,
          )
        }
      }

      // 12.A AUDITORIA RIGOROSA DA 2ª PASSADA (CORREÇÃO DO AUDITOR)
      // A correção do auditor não é um salvo-conduto: deve passar por auditoria técnica completa.
      if (auditVerdict.action === 'VETA' && auditVerdict.corrected_ncm) {
        let correctedDigits = normalizeNcm(auditVerdict.corrected_ncm)
        let correctedExDigits = (auditVerdict.corrected_ex || '').toString().trim()

        let candidateMatch =
          candidates.find(
            (c: any) =>
              normalizeNcm(c.ncm) === correctedDigits &&
              (!correctedExDigits || (c.ex || '').trim() === correctedExDigits),
          ) || candidates.find((c: any) => normalizeNcm(c.ncm) === correctedDigits)

        // Se o candidato corrigido não existir nos candidatos recuperados,
        // buscar diretamente em imp_sim_tax_rates via supabaseAdmin, reconstruir o objeto
        // candidato e promover a recommendation sem fallback silencioso
        if (!candidateMatch) {
          console.log(
            `[Auditoria 2ª Passada] Candidato corrigido ${correctedDigits} não estava no array de candidatos. Buscando diretamente em imp_sim_tax_rates...`,
          )

          let dbCandidateQuery = supabaseAdmin
            .from('imp_sim_tax_rates')
            .select(
              'ncm, ex, ncm_descricao_full, ncm_descricao, ex_descricao, ii_rate, ipi_rate, pis_rate, cofins_rate, has_ex_tarifario',
            )
            .eq('ncm', correctedDigits)

          if (correctedExDigits) {
            dbCandidateQuery = dbCandidateQuery.eq('ex', correctedExDigits)
          }

          const { data: directDbRows, error: directDbErr } = await dbCandidateQuery.limit(1)

          let directDbRow = directDbRows && directDbRows.length > 0 ? directDbRows[0] : null
          if (!directDbRow && correctedExDigits) {
            // Tenta sem o filtro de Ex se não encontrou com Ex exato
            const { data: fallbackDbRows } = await supabaseAdmin
              .from('imp_sim_tax_rates')
              .select(
                'ncm, ex, ncm_descricao_full, ncm_descricao, ex_descricao, ii_rate, ipi_rate, pis_rate, cofins_rate, has_ex_tarifario',
              )
              .eq('ncm', correctedDigits)
              .limit(1)
            if (fallbackDbRows && fallbackDbRows.length > 0) {
              directDbRow = fallbackDbRows[0]
            }
          }

          if (directDbRow) {
            const reincludedCandidate: any = {
              ncm: directDbRow.ncm,
              ex: directDbRow.ex || correctedExDigits || '',
              ncm_descricao_full: directDbRow.ncm_descricao_full || directDbRow.ncm_descricao || '',
              ncm_descricao: directDbRow.ncm_descricao || '',
              ex_descricao: directDbRow.ex_descricao || '',
              ii_rate: directDbRow.ii_rate ?? 0,
              ipi_rate: directDbRow.ipi_rate ?? 0,
              pis_rate: directDbRow.pis_rate ?? 2.1,
              cofins_rate: directDbRow.cofins_rate ?? 9.65,
              has_ex_tarifario: Boolean(directDbRow.has_ex_tarifario || directDbRow.ex),
              is_auditor_reincluded: true,
              score: 0.99,
            }

            candidates.unshift(reincludedCandidate)
            candidateMatch = reincludedCandidate
            console.log(
              `[Auditoria 2ª Passada] Candidato corrigido ${correctedDigits} reincluído com sucesso a partir de imp_sim_tax_rates.`,
            )
          } else {
            const notFoundMsg = `Candidato corrigido pelo auditor (${correctedDigits}) não existe na tabela oficial imp_sim_tax_rates.`
            console.warn(
              `[Auditoria 2ª Passada] ${notFoundMsg} Registrando override_reason.`,
              directDbErr,
            )
            auditVerdict.override_reason = notFoundMsg
          }
        }

        if (!candidateMatch) {
          console.warn(
            `[Auditoria 2ª Passada] Candidato corrigido ${correctedDigits} indisponível na base oficial. Mantendo 1ª passada com justificativa registrada no veredito.`,
          )
        } else {
          // (1) VERIFICAÇÃO DE VEDAÇÃO POR CONTRADIÇÃO DE NATUREZA E INCOMPATIBILIDADE TECNOLÓGICA:
          // A descrição hierárquica do candidato não pode contradizer a natureza essencial do produto,
          // nem violar vetos tecnológicos universais (ex.: 90.07 película vs. captação digital 85.25)
          const natureContradiction = checkNatureContradiction({
            productText: fullTechnicalProfile,
            candidateDesc:
              candidateMatch.ncm_descricao_full ||
              candidateMatch.ncm_descricao ||
              candidateMatch.source_text ||
              '',
            detectedComponents: compositionAnalysis.detectedComponents,
          })
          const techIncompAuditor = checkTechnologyIncompatibility(
            correctedDigits,
            candidateMatch.ncm_descricao_full ||
              candidateMatch.ncm_descricao ||
              candidateMatch.source_text ||
              '',
            fullTechnicalProfile,
          )
          if (techIncompAuditor.incompatible) {
            natureContradiction.contradicted = true
            natureContradiction.reason = techIncompAuditor.reason
          }

          // (2) VERIFICAÇÃO DE PROIBIÇÃO DE CRITÉRIO FISCAL / ALÍQUOTA:
          // Se a justificativa do auditor cita explicitamente termos tributários/alíquotas como motivo de escolha
          const taxCriterionCheck = checkTaxAdvantageCriterion({
            auditCritique: auditVerdict.audit_critique,
            correctionReason: auditVerdict.correction_reason,
            initialCandidate:
              activeExCandidate ||
              candidates.find((c: any) => normalizeNcm(c.ncm) === initialRecNcm),
            correctedCandidate: candidateMatch,
          })

          // (3) CHECKLIST DE CONDIÇÕES RESTRITIVAS DO EX NA CORREÇÃO (se houver Ex):
          let correctedChecklistLog: ExChecklistResult = {
            passed: true,
            status: 'APROVADO',
            requiresExpertReview: false,
            comparisons: [],
            missingInformation: [],
            needsWebSearch: false,
          }

          if (correctedExDigits && candidateMatch.ex_descricao) {
            correctedChecklistLog = evaluateExChecklistAgainstProduct({
              exDescription: candidateMatch.ex_descricao,
              productText: fullTechnicalProfile,
              isKit: compositionAnalysis.isKit,
              detectedComponents: compositionAnalysis.detectedComponents,
            })

            if (!correctedChecklistLog.passed) {
              console.warn(
                `[Auditoria 2ª Passada] Ex ${correctedExDigits} proposto pelo auditor NÃO atende às condições. Removendo Ex da correção.`,
              )
              correctedExDigits = ''
              auditVerdict.corrected_ex = ''
            }
          }

          // (2.B) PROIBIÇÃO INVERSA DE PEÇAS E PRESERVAÇÃO DA FUNÇÃO ESSENCIAL PRÓPRIA (Princípio Genérico 1, 2 e 3):
          // Se o produto possui função própria autônoma (ex.: captação/reprodução de áudio, vídeo, monitor),
          // ele NÃO pode ser classificado em NCM de partes (ex.: 8529 para câmeras), nem o auditor pode
          // vetar a família da função própria (85.18 para microfones) alegando acessório dependente ou rádio.
          // Se a Fase 0 errou a natureza declarando "acessório dependente" para produto com função autônoma
          // (ex.: microfone sem fio), corrigimos a natureza ANTES de avaliar o NCM.
          const isCandidateParts = isPartsNcmPattern(
            candidateMatch.ncm_descricao_full ||
              candidateMatch.ncm_descricao ||
              candidateMatch.source_text ||
              '',
          )
          const effectivePU =
            auditVerdict.product_understanding || initialRecommendation.product_understanding

          const productHasStandaloneFunction = evaluateProductHasStandaloneFunction({
            productUnderstanding: effectivePU,
            productText: fullTechnicalProfile,
            isKit: compositionAnalysis.isKit,
          })

          let effectiveNature = normalizeProductNature(effectivePU?.product_nature)

          // Correção de natureza da Fase 0 quando o produto possui função essencial autônoma
          if (
            productHasStandaloneFunction &&
            effectiveNature ===
              'acessório dependente (sem função autônoma, requer produto principal para operar)'
          ) {
            console.log(
              '[Auditoria/Pipeline] Corrigindo natureza da Fase 0: produto possui função essencial primordial autônoma, reclassificando para aparelho com função própria completa.',
            )
            effectiveNature = 'aparelho com função própria completa'
            if (auditVerdict.product_understanding) {
              auditVerdict.product_understanding.product_nature = effectiveNature
            }
          }

          // Violação de partes: ocorre quando o candidato corrigido é NCM de partes mas o produto tem função própria autônoma.
          // ATENÇÃO: Dispositivos cuja função é controlar/operar máquina externa dedicada (ex.: câmeras)
          // NÃO sofrem violação de partes — a classificação como parte da máquina servida é legítima e prioritária.
          const isControllerDevice =
            /\b(controlador|controller|controle remoto|remote control|joystick|servo zoom|zoom demand|focus demand)\b/i.test(
              fullTechnicalProfile,
            )
          const partsInverseViolation =
            isCandidateParts.isParts && productHasStandaloneFunction && !isControllerDevice

          // Veto adicional: Se a 1ª passada recomendou corretamente a família da função essencial (ex: 8518 para microfones)
          // e o auditor tentou vetar para NCM de partes (8529) ou de meio de transmissão (8517)
          const initialNcmClean = normalizeNcm(initialRecommendation.recommended_ncm)
          const isEssentialFamilyInitial =
            (initialNcmClean.startsWith('8518') &&
              /\b(microfone|microphone|audio|[aá]udio)\b/i.test(fullTechnicalProfile)) ||
            (initialNcmClean.startsWith('8528') &&
              /\b(monitor|display|tela)\b/i.test(fullTechnicalProfile))

          const auditorVetoOfEssentialFamilyInvalid =
            isEssentialFamilyInitial &&
            (correctedDigits.startsWith('8529') || correctedDigits.startsWith('8517'))

          if (partsInverseViolation) {
            console.warn(
              `[Auditoria 2ª Passada: VETO POR PROIBIÇÃO INVERSA DE PEÇAS] Candidato ${correctedDigits} é NCM de partes/peças, mas o produto é aparelho com função própria autônoma (nature=${effectiveNature}).`,
            )
          }

          if (auditorVetoOfEssentialFamilyInvalid) {
            console.warn(
              `[Auditoria 2ª Passada: VETO DE TESE DO AUDITOR] Auditor vetou a família da função essencial própria (${initialNcmClean}) para NCM de partes/transmissão (${correctedDigits}) com base no meio e não na entrega.`,
            )
          }

          // Se a correção do auditor foi VETADA pela verificação de natureza ontológica, critério fiscal, proibição inversa ou veto inválido de família essencial
          if (
            natureContradiction.contradicted ||
            taxCriterionCheck.violatesTaxProhibition ||
            partsInverseViolation ||
            auditorVetoOfEssentialFamilyInvalid
          ) {
            const vetoReasonText = auditorVetoOfEssentialFamilyInvalid
              ? `A função essencial do produto é o que ele ENTREGA (captação/reprodução), não o meio de transmissão: o NCM da família da função própria (${initialNcmClean}) não pode ser vetado para partes (${correctedDigits}).`
              : partsInverseViolation
                ? `Proibição de partes para aparelho autônomo: produto possui função própria completa autônoma (RGI 3b), não podendo ser enquadrado em NCM de partes (${correctedDigits}).`
                : natureContradiction.reason || taxCriterionCheck.reason
            console.warn(
              `[Auditoria 2ª Passada: VETO DA CORREÇÃO] Correção para ${correctedDigits} foi vetada:`,
              vetoReasonText,
            )

            // (4) PREFERÊNCIA POR FUNÇÃO GENÉRICA COMPATÍVEL SOBRE ESPECÍFICA INCOMPATÍVEL:
            // Tentar selecionar a melhor alternativa tecnicamente compatível
            const fallbackCandidate = selectBestCompatibleFallback({
              candidates,
              rejectedNcms: [initialRecNcm, correctedDigits],
              productText: fullTechnicalProfile,
              detectedComponents: compositionAnalysis.detectedComponents,
            })

            if (fallbackCandidate) {
              const fallbackNcmClean = normalizeNcm(fallbackCandidate.ncm)
              const fallbackExClean = (fallbackCandidate.ex || '').toString().trim()
              console.log(
                `[Auditoria 2ª Passada: Fallback de Função Genérica Compatível] Selecionado NCM ${fallbackNcmClean} (Ex ${fallbackExClean || 'sem Ex'}).`,
              )

              auditVerdict.override_applied = true
              auditVerdict.override_reason = `Correção do auditor para ${correctedDigits} vetada (${vetoReasonText}). Aplicada preferência técnica por função genérica compatível NCM ${fallbackNcmClean}.`
              auditVerdict.corrected_ncm = fallbackNcmClean
              auditVerdict.corrected_ex = fallbackExClean
              auditVerdict.correction_reason = auditVerdict.override_reason

              llmResponseJson.recommended_ncm = fallbackNcmClean
              llmResponseJson.recommended_ex = fallbackExClean
              llmResponseJson.justification = `[Revisão de Auditoria Aduaneira: Veto e Enquadramento Técnico Compatível]\n${auditVerdict.override_reason}`

              // Atualizar checklist se o novo candidato tiver Ex
              if (fallbackExClean && fallbackCandidate.ex_descricao) {
                checklistLog = evaluateExChecklistAgainstProduct({
                  exDescription: fallbackCandidate.ex_descricao,
                  productText: fullTechnicalProfile,
                  isKit: compositionAnalysis.isKit,
                  detectedComponents: compositionAnalysis.detectedComponents,
                })
              }
            } else {
              // Se não encontrou fallback melhor, anular a correção inválida do auditor
              auditVerdict.action = 'APROVA'
              auditVerdict.audit_critique += ` [Nota: A correção proposta para ${correctedDigits} foi rejeitada por incompatibilidade técnica com o produto].`
            }
          } else {
            // Correção do auditor é tecnicamente válida e aceita
            llmResponseJson.recommended_ncm = correctedDigits
            llmResponseJson.recommended_ex = correctedExDigits
            llmResponseJson.justification = `[Revisão de Auditoria Aduaneira: Veto e Correção Homologados]\n${auditVerdict.correction_reason || auditVerdict.audit_critique}`

            if (correctedExDigits) {
              checklistLog = correctedChecklistLog
            }
          }
        }
      }
    } catch (auditErr) {
      console.warn('Falha na segunda passada de auditoria:', auditErr)
    }

    // CALIBRAÇÃO: COMPOSITION_ANALYSIS DERIVADA DIRETAMENTE DA FASE 0 (Auditada pela IA)
    // Descartar extração ruidosa de targetMachines por regex comercial.
    // Derivar targetMachines canônicas de product_understanding.target_machines.
    // isKit: true SOMENTE se o produto é comercializado como conjunto de múltiplos itens fisicamente
    // autônomos vendidos juntos (ex: transmissor + receptor), JAMAIS aparelho singular.
    // 12.A.0 CONJUNTO DE NCMS VETADOS (PROPAGAÇÃO DE VETO UNIVERSAL)
    const vetoedNcms = new Set<string>()

    // =========================================================================
    // 12.A.1 VETO TECNOLÓGICO DETERMINÍSTICO DA POSIÇÃO 90.07 (PELÍCULA VS DIGITAL)
    // =========================================================================
    // Se a 1ª passada ou o auditor sugeriu NCM da posição 90.07 (ou com exigência de película)
    // para produto com captação eletrônica/digital (sensor, cmos, ccd, 4k/6k/8k, sdi, etc.):
    // 1. VETAR terminantemente a posição 90.07;
    // 2. Redirecionar para a posição 85.25 usando a contagem de captadores JÁ EXISTENTE:
    //    - 1–2 sensores físicos declarados -> 85258929 ("Outras")
    //    - 3+ sensores físicos declarados -> 85258921 ("Com três ou mais captadores de imagem")
    // 3. Adicionar os NCMs de 9007 ao conjunto vetoedNcms para NUNCA constarem em alternativas.
    try {
      const preCheckRecNcm = normalizeNcm(llmResponseJson.recommended_ncm)
      const preCheckRecCand =
        candidates.find((c: any) => normalizeNcm(c.ncm) === preCheckRecNcm) ||
        (await resolveEffectiveTaxRate(supabaseAdmin, preCheckRecNcm, ''))
      const preCheckRecDesc =
        preCheckRecCand?.ncm_descricao_full || preCheckRecCand?.ncm_descricao || ''

      const techVetoCheck = checkTechnologyIncompatibility(
        preCheckRecNcm,
        preCheckRecDesc,
        fullTechnicalProfile,
      )

      if (techVetoCheck.incompatible) {
        console.log(
          `[Veto Tecnológico Posição 90.07]: NCM ${preCheckRecNcm} vetado para câmera eletrônica/digital. Motivo: ${techVetoCheck.reason}`,
        )
        vetoedNcms.add(preCheckRecNcm)
        // Veta qualquer outro 9007 existente
        for (const c of candidates) {
          if (normalizeNcm(c.ncm).startsWith('9007')) {
            vetoedNcms.add(normalizeNcm(c.ncm))
          }
        }

        // Redirecionamento determinístico para posição 85.25 com contagem de captadores existente
        const sensorCountResult = extractPhysicalSensorCount(fullTechnicalProfile)
        const target8525Ncm =
          sensorCountResult !== null && sensorCountResult.count >= 3 ? '85258921' : '85258929'

        const targetCand =
          candidates.find((c: any) => normalizeNcm(c.ncm) === target8525Ncm) ||
          (await resolveEffectiveTaxRate(supabaseAdmin, target8525Ncm, ''))

        const targetDesc =
          targetCand?.ncm_descricao_full ||
          targetCand?.ncm_descricao ||
          (target8525Ncm === '85258921'
            ? 'Com três ou mais captadores de imagem'
            : 'Outras câmeras de televisão, câmeras digitais e câmeras de vídeo')

        llmResponseJson.recommended_ncm = target8525Ncm
        llmResponseJson.recommended_ex = ''
        llmResponseJson.justification = `[Veto Tecnológico - Posição 90.07 Excluída / Enquadramento na Posição 85.25]: ${techVetoCheck.reason} Terminologias de marketing ("Cinema", "Cine", "movie" no nome comercial) não alteram a classificação entre capítulos: a tecnologia declarada é captação eletrônica digital com ${sensorCountResult ? `${sensorCountResult.count} captador(es) ("${sensorCountResult.snippet}")` : 'sensor eletrônico'}. Enquadramento correto na NCM ${target8525Ncm} (${targetDesc}).\n\n${llmResponseJson.justification || ''}`

        auditVerdict.action = 'VETA'
        auditVerdict.corrected_ncm = target8525Ncm
        auditVerdict.corrected_ex = ''
        auditVerdict.correction_reason = techVetoCheck.reason
      }
    } catch (techErr) {
      console.warn('Erro na avaliação de veto tecnológico 90.07:', techErr)
    }

    const finalProductUnderstanding = auditVerdict?.product_understanding ||
      llmResponseJson?.product_understanding || {
        identity: leanSignature,
        essential_function: initialRecommendation.essential_function,
        target_machines: compositionAnalysis.targetMachines,
        canonical_statement: `o produto é um ${leanSignature} que ${initialRecommendation.essential_function}, destinado a ${compositionAnalysis.targetMachines.join(', ') || 'operação autônoma'}`,
      }
    const rawTargetMachinesFromPhase0: string[] = Array.isArray(
      finalProductUnderstanding?.target_machines,
    )
      ? finalProductUnderstanding.target_machines
      : []

    // Filtrar e normalizar targetMachines da Fase 0
    const canonicalTargetMachines = Array.from(
      new Set(
        rawTargetMachinesFromPhase0
          .map((tm: any) => String(tm || '').trim())
          .filter(
            (tm: string) =>
              tm.length >= 3 &&
              !/^(controle|panorâmica|panor[aâ]mica|zoom|pan|tilt|operacao|operação|autonoma|autônoma|nenhuma)$/i.test(
                tm,
              ),
          ),
      ),
    )

    // Avaliação canônica de isKit: apenas se múltiplos itens fisicamente autônomos
    // (ex: transmissor + receptor, TX+RX) ou explicitamente reconhecido pelo modelo e auditado
    const isActuallyKit = evaluateCanonicalIsKit({
      productUnderstanding: finalProductUnderstanding,
      productText: combinedProductText,
      initialDetectedComponents: compositionAnalysis.detectedComponents,
    })

    compositionAnalysis = {
      isKit: isActuallyKit,
      detectedComponents: isActuallyKit ? compositionAnalysis.detectedComponents : [],
      compositionIdentified: isActuallyKit
        ? compositionAnalysis.detectedComponents.length >= 2
        : true,
      targetMachines: canonicalTargetMachines,
    }

    // =========================================================================
    // 12.B DESEMPATE DETERMINÍSTICO INTRAFAMÍLIA PRÉ-DECISÃO (REQUISITOS 1, 2 E 3)
    // =========================================================================
    // No seletor final de candidatos, executar o checklist de condições/qualificadores
    // sobre TODOS os irmãos do mesmo desdobramento de 6 dígitos (ex.: 8543.70.x, 8525.89.x)
    // ANTES de consolidar a escolha, como critério eliminatório e de desempate.
    // Se o candidato atualmente selecionado pertencer a um desdobramento de 6 dígitos onde
    // existe um irmão cuja descrição oficial contempla qualificadores quantitativos satisfeitos
    // pelo produto (ex.: 85437035 com "oito ou mais entradas"), e o atual não os possui ou é
    // de aplicação física excludente/residual genérico, substituir pelo irmão qualificado.
    try {
      const currentChosenNcm = normalizeNcm(llmResponseJson.recommended_ncm)
      if (currentChosenNcm.length === 8) {
        const subpos6 = currentChosenNcm.slice(0, 6)
        const siblingCandidates = candidates.filter((c: any) =>
          normalizeNcm(c.ncm).startsWith(subpos6),
        )

        if (siblingCandidates.length > 1) {
          // Avaliar cada irmão da subposição de 6 dígitos
          let bestSibling: any = null
          let bestSiblingScore = -999
          let bestSiblingReason = ''

          const currentCand = siblingCandidates.find(
            (c: any) => normalizeNcm(c.ncm) === currentChosenNcm,
          )
          const currentNatureCheck = currentCand
            ? checkNatureContradiction({
                productText: fullTechnicalProfile,
                candidateDesc: currentCand.ncm_descricao_full || currentCand.ncm_descricao || '',
                detectedComponents: compositionAnalysis.detectedComponents,
              })
            : { contradicted: false }

          for (const sib of siblingCandidates) {
            const sibNcm = normalizeNcm(sib.ncm)
            const sibDesc = sib.ncm_descricao_full || sib.ncm_descricao || sib.source_text || ''

            // 1. Verificar contradição de natureza / incompatibilidade funcional e tecnológica
            const natureCheck = checkNatureContradiction({
              productText: fullTechnicalProfile,
              candidateDesc: sibDesc,
              detectedComponents: compositionAnalysis.detectedComponents,
            })
            const techCheck = checkTechnologyIncompatibility(sibNcm, sibDesc, fullTechnicalProfile)

            let sibScore = sib.combined_score ?? sib.vector_score ?? 0.5
            if (natureCheck.contradicted || techCheck.incompatible) {
              sibScore -= 300 // Eliminatório
              if (techCheck.incompatible) {
                vetoedNcms.add(sibNcm)
              }
            }

            // 2. Avaliar qualificadores quantitativos
            const qualEval = evaluateIntrafamilyQualifierScore(
              sibDesc,
              sib.ex_descricao,
              fullTechnicalProfile,
            )
            if (qualEval.hasPattern) {
              sibScore += qualEval.scoreAdjustment
            }

            // 3. Penalização de cesto residual não qualificado quando há irmão específico
            const isGenericOther = /\b(?:outros?|outras?)\b/i.test(sibDesc.split('|').pop() || '')
            if (isGenericOther) {
              sibScore -= 10
            }

            if (sibScore > bestSiblingScore) {
              bestSiblingScore = sibScore
              bestSibling = sib
              bestSiblingReason =
                qualEval.hasPattern && qualEval.satisfied
                  ? qualEval.reason
                  : natureCheck.contradicted
                    ? `Subitem anterior vetado por incompatibilidade funcional.`
                    : 'Maior aderência técnica intrafamília.'
            }
          }

          // REGRAS DETERMINÍSTICAS (2) SWITCHERS E (3) CÂMERAS - VETO / PREVALÊNCIA DIRETA:
          // (2) Switchers: 85437035 exige 8+ entradas de vídeo declaradas. Menos de 8 -> INELEGÍVEL (veto).
          // Se o produto tiver 8+ entradas, 85437035 é preferido. Se tiver menos de 8, 85437035 é vetado, promovendo 85437099.
          const declaredInputs = extractDeclaredVideoInputCount(fullTechnicalProfile)
          if (subpos6 === '854370') {
            if (currentChosenNcm === '85437035') {
              if (declaredInputs !== null && declaredInputs.count < 8) {
                console.log(
                  `[Regra Determinística Switcher]: 85437035 inelegível (possui apenas ${declaredInputs.count} entradas de vídeo, exige 8+). Promovendo residual 85437099.`,
                )
                currentNatureCheck.contradicted = true
                vetoedNcms.add('85437035')
              }
            } else if (declaredInputs !== null && declaredInputs.count >= 8) {
              const sib35 = siblingCandidates.find((c: any) => normalizeNcm(c.ncm) === '85437035')
              if (sib35) {
                bestSibling = sib35
                bestSiblingScore = 150
                bestSiblingReason = `Produto possui ${declaredInputs.count} entradas de vídeo declaradas ("${declaredInputs.snippet}"), atendendo ao requisito oficial da NCM 85437035 (oito ou mais entradas).`
              }
            }
          }

          // (3) Câmeras: 85258921 ("com três ou mais captadores de imagem") exige 3+ captadores/sensores físicos declarados.
          // Câmera com 1 ou 2 sensores físicos -> 85258921 INELEGÍVEL (veto), enquadramento vai para 85258929 ("Outras", II 20%).
          const declaredSensors = extractPhysicalSensorCount(fullTechnicalProfile)
          if (subpos6 === '852589') {
            if (currentChosenNcm === '85258921') {
              if (declaredSensors !== null && declaredSensors.count < 3) {
                console.log(
                  `[Regra Determinística Câmeras]: 85258921 inelegível (possui ${declaredSensors.count} captador(es) físico(s), exige 3+). Redirecionando para 85258929 ("Outras").`,
                )
                currentNatureCheck.contradicted = true
                vetoedNcms.add('85258921')
                const sib29 = siblingCandidates.find((c: any) => normalizeNcm(c.ncm) === '85258929')
                if (sib29) {
                  bestSibling = sib29
                  bestSiblingScore = 150
                  bestSiblingReason = `Produto possui ${declaredSensors.count} captador(es) físico(s) de imagem ("${declaredSensors.snippet}"). A NCM 85258921 exige 3 ou mais captadores físicos; não atingindo o requisito, enquadra-se como 85258929 (Outras).`
                }
              }
            } else if (declaredSensors !== null && declaredSensors.count >= 3) {
              const sib21 = siblingCandidates.find((c: any) => normalizeNcm(c.ncm) === '85258921')
              if (sib21) {
                bestSibling = sib21
                bestSiblingScore = 150
                bestSiblingReason = `Produto possui ${declaredSensors.count} captadores físicos de imagem declarados ("${declaredSensors.snippet}"), satisfazendo plenamente a NCM 85258921 (três ou mais captadores).`
              }
            }
          }

          // Se o melhor irmão for diferente do atual e tiver pontuação decisivamente superior
          // (ex.: qualificador quantitativo satisfeito ou atual é contraditório/incompatível)
          if (
            bestSibling &&
            normalizeNcm(bestSibling.ncm) !== currentChosenNcm &&
            bestSiblingScore > 0 &&
            (currentNatureCheck.contradicted || bestSiblingScore >= 70)
          ) {
            const oldNcm = currentChosenNcm
            const newNcm = normalizeNcm(bestSibling.ncm)
            const newEx = (bestSibling.ex || '').toString().trim()

            console.log(
              `[Desempate Intrafamília Pré-Decisão]: NCM ${newNcm} prevaleceu sobre ${oldNcm} no desdobramento ${subpos6}. Motivo: ${bestSiblingReason}`,
            )

            llmResponseJson.recommended_ncm = newNcm
            llmResponseJson.recommended_ex = newEx
            llmResponseJson.justification = `[Desempate Intrafamília Pré-Decisão - RGI 1 / RGI 6]: No desdobramento hierárquico ${subpos6}, prevalece a subposição específica ${newNcm} (${bestSibling.ncm_descricao_full || bestSibling.ncm_descricao}) sobre o subitem ${oldNcm}. Fundamentação: ${bestSiblingReason}\n\n${llmResponseJson.justification || ''}`

            // Adicionar o NCM anterior nas alternativas se não estiver vetado
            if (!currentNatureCheck.contradicted && !vetoedNcms.has(oldNcm)) {
              if (!Array.isArray(llmResponseJson.alternatives)) {
                llmResponseJson.alternatives = []
              }
              llmResponseJson.alternatives.unshift({
                ncm: oldNcm,
                ex: currentCand?.ex || '',
                reason: `Classificação da subposição ${subpos6} aplicável quando os qualificadores específicos de outras subposições não forem atendidos.`,
              })
            }
          }
        }
      }
    } catch (intraErr) {
      console.warn('Falha no desempate determinístico intrafamília pré-decisão:', intraErr)
    }

    // =========================================================================
    // 13. PRECEDÊNCIA DETERMINÍSTICA DE PARTES SOBRE RESIDUAL (RGI 1, NOTA 2(b) DO CAP. 85)
    // =========================================================================
    // Princípio universal: Quando product_nature = "acessório dependente" e existir NCM de partes cujo
    // vínculo indireto casar (intervalo de posições cobre os target_machines), o NCM de partes prevalece
    // OBRIGATORIAMENTE sobre NCM residual de função própria ("não especificados nem compreendidos noutras posições",
    // ex.: 8543 / 85437099). O residual é rebaixado a alternativa residual com motivo explícito.
    const resolvedProductNature = normalizeProductNature(
      finalProductUnderstanding?.product_nature ||
        initialRecommendation.product_understanding?.product_nature,
    )

    // Obter posições das target_machines (ex: "8525")
    const resolvedTargetHeadings = extractTargetMachineHeadings(
      canonicalTargetMachines.length > 0
        ? canonicalTargetMachines
        : finalProductUnderstanding?.target_machines || [],
    )

    let currentRecNcmForCheck = normalizeNcm(llmResponseJson.recommended_ncm)
    const currentRecCandidate =
      candidates.find((c: any) => normalizeNcm(c.ncm) === currentRecNcmForCheck) ||
      (await resolveEffectiveTaxRate(supabaseAdmin, currentRecNcmForCheck, ''))

    const currentRecDescForCheck =
      currentRecCandidate?.ncm_descricao_full ||
      currentRecCandidate?.ncm_descricao ||
      currentRecCandidate?.source_text ||
      ''

    const partsPrecedenceEval = evaluatePartsPrecedenceOverResidual({
      productNature: resolvedProductNature,
      currentRecNcm: currentRecNcmForCheck,
      currentRecDesc: currentRecDescForCheck,
      candidates,
      targetHeadings: resolvedTargetHeadings,
    })

    let partsPrecedenceVerdict: PartsPrecedenceVerdict = partsPrecedenceEval.verdict

    if (partsPrecedenceEval.shouldOverride && partsPrecedenceEval.winningCandidate) {
      const winCand = partsPrecedenceEval.winningCandidate
      const demCand = partsPrecedenceEval.demotedCandidate
      const winNcm = normalizeNcm(winCand.ncm)
      const demNcm = normalizeNcm(demCand.ncm)

      console.log(
        `[Precedência de Partes]: Aplicada sobreposição determinística. Parte ${winNcm} venceu residual ${demNcm}.`,
      )

      llmResponseJson.recommended_ncm = winNcm
      llmResponseJson.recommended_ex = winCand.ex || ''

      const targetStr =
        canonicalTargetMachines.join(', ') ||
        finalProductUnderstanding?.target_machines?.join(', ') ||
        'câmeras / aparelhos de destino'

      const precedenceNote = `[Precedência Determinística de Partes - RGI 1 / Nota 2(b) do Cap. 85 / NESH]: O produto é acessório dependente destinado a ${targetStr} (posição ${partsPrecedenceEval.matchedHeading || 'alvo'}), compreendida no intervalo ${partsPrecedenceEval.matchedRangeStr} declarado no texto oficial da NCM ${winNcm}. Pela Nota 2(b) do Cap. 85, a destinação específica prevalece sobre aparelhos elétricos com função própria residuais ("não especificados nem compreendidos noutras posições", NCM ${demNcm}), o qual foi rebaixado a alternativa residual.`

      llmResponseJson.justification = `${precedenceNote}\n\n${llmResponseJson.justification || ''}`

      // Adicionar o residual derrotado como alternativa prioritária com a fundamentação de precedência
      if (!Array.isArray(llmResponseJson.alternatives)) {
        llmResponseJson.alternatives = []
      }
      llmResponseJson.alternatives.unshift({
        ncm: demNcm,
        ex: demCand.ex || '',
        reason: `Alternativa residual de aparelho com função própria. Rebaixado perante a NCM de partes ${winNcm} por aplicação da RGI 1 e Nota 2(b) do Cap. 85 (destinação específica a aparelhos da posição ${partsPrecedenceEval.matchedHeading || 'alvo'} prevalece sobre residual "não especificados noutras posições").`,
      })
    }

    // 13.B Resolução estrita das alíquotas efetivas via public.imp_sim_tax_rates_effective
    const recommendedNcmClean = normalizeNcm(llmResponseJson.recommended_ncm)
    // INVARIANTE ABSOLUTA: Se o veto ao Ex foi aplicado (exVetoApplied === true), recommendedExClean DEVE ser vazio ('')
    const recommendedExClean = exVetoApplied
      ? ''
      : (llmResponseJson.recommended_ex || '').toString().trim()

    const resolvedPrimary = await resolveEffectiveTaxRate(
      supabaseAdmin,
      recommendedNcmClean,
      recommendedExClean,
    )

    const primaryTaxRate =
      resolvedPrimary ||
      (await resolveEffectiveTaxRate(supabaseAdmin, recommendedNcmClean, '')) ||
      candidates.find((c: any) => normalizeNcm(c.ncm) === recommendedNcmClean)

    if (!primaryTaxRate) {
      return new Response(
        JSON.stringify({
          error: `Inconsistência cadastral: NCM ${recommendedNcmClean} não encontrado na tabela de taxas.`,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const iiRate = Number(primaryTaxRate.ii_efetivo ?? primaryTaxRate.ii_rate ?? 0)
    const ipiRate = Number(primaryTaxRate.ipi_rate ?? 0)
    const pisRate = Number(primaryTaxRate.pis_rate ?? 2.1)
    const cofinsRate = Number(primaryTaxRate.cofins_rate ?? 9.65)
    const totalTax = Number((iiRate + ipiRate + pisRate + cofinsRate).toFixed(2))

    const hasEx = Boolean(
      primaryTaxRate.has_ex_tarifario || (primaryTaxRate.ex && primaryTaxRate.ex !== ''),
    )

    const exDetails = hasEx
      ? {
          descricao: primaryTaxRate.ex_descricao || null,
          resolucao: primaryTaxRate.ex_resolucao || null,
          data_fim: primaryTaxRate.ex_data_fim || null,
        }
      : null

    // 14. Resolver alíquotas para alternativas com PROPAGAÇÃO DE VETO (Princípio Genérico):
    // Um NCM vetado pelo auditor ou pelo checklist de código NÃO PODE aparecer na recomendação nem nas alternativas.
    // Montar conjunto de NCMs vetados para exclusão estrita de toda a resposta.
    // NOTA: vetoedNcms já foi inicializado anteriormente e acumulou vetos da Fase 0 / Veto Tecnológico.
    // Se o auditor vetou a 1ª passada, o NCM inicial foi vetado
    if (auditVerdict.action === 'VETA') {
      vetoedNcms.add(normalizeNcm(initialRecommendation.recommended_ncm))
    }

    // Se a correção do auditor foi vetada pelo override de natureza/tributário
    if (auditVerdict.override_applied && auditVerdict.corrected_ncm) {
      // O NCM originalmente proposto pelo auditor antes do override foi vetado
      const rawAuditCorrection = normalizeNcm(
        (auditVerdict.override_reason || '').match(/\b(\d{8})\b/)?.[1] || '',
      )
      if (rawAuditCorrection) {
        vetoedNcms.add(rawAuditCorrection)
      }
    }

    // Se a correção do auditor foi rejeitada e revertida
    if (auditVerdict.action === 'APROVA' && auditVerdict.audit_critique.includes('foi rejeitada')) {
      const matchRejected = auditVerdict.audit_critique.match(/para\s+(\d{8})\s+foi\s+rejeitada/i)
      if (matchRejected && matchRejected[1]) {
        vetoedNcms.add(normalizeNcm(matchRejected[1]))
      }
    }

    const resolvedAlternatives: any[] = []
    const rawAlternatives = Array.isArray(llmResponseJson.alternatives)
      ? llmResponseJson.alternatives
      : []

    for (const alt of rawAlternatives) {
      const altNcmClean = normalizeNcm(alt.ncm || '')
      if (!altNcmClean || altNcmClean === recommendedNcmClean) continue
      // PROPAGAÇÃO DE VETO: se o NCM foi vetado pelo auditor, veto tecnológico ou checklist, ignorar
      if (vetoedNcms.has(altNcmClean)) {
        console.log(
          `[Propagação de Veto]: NCM alternativo ${altNcmClean} descartado pois consta nos NCMs vetados.`,
        )
        continue
      }

      // VETO TECNOLÓGICO ESPECÍFICO EM ALTERNATIVAS: posição 90.07 vetada para captação digital
      const altTechCheck = checkTechnologyIncompatibility(
        altNcmClean,
        alt.reason || '',
        fullTechnicalProfile,
      )
      if (altTechCheck.incompatible) {
        console.log(
          `[Veto Tecnológico Alternativa]: Alternativa ${altNcmClean} descartada (${altTechCheck.reason}).`,
        )
        vetoedNcms.add(altNcmClean)
        continue
      }

      // (a) VETO POR AUTOCONTRADIÇÃO NO CAMPO REASON:
      // Se o próprio campo reason afirma que ela não é adequada ("não é a classificação mais adequada",
      // "não se aplica", "inadequado", etc.), deve ser removida em código — autocontradição veta a linha
      const reasonLower = (alt.reason || '').toLowerCase()
      const selfContradictoryPatterns = [
        /n[aã]o [eé] a (?:classifica[cç][aã]o )?mais adequada/i,
        /n[aã]o [eé] adequada/i,
        /n[aã]o [eé] apropriad[ao]/i,
        /n[aã]o se aplica/i,
        /incompat[ií]vel com/i,
        /contradit[oó]ri[ao]/i,
        /incorret[ao]/i,
        /vetad[ao]/i,
      ]
      const isSelfContradictory = selfContradictoryPatterns.some((pat) => pat.test(reasonLower))
      if (isSelfContradictory) {
        console.log(
          `[Veto por Autocontradição]: Alternativa ${altNcmClean} removida por declarar que não é adequada no próprio reason: "${alt.reason}"`,
        )
        vetoedNcms.add(altNcmClean)
        continue
      }

      const altExClean = (alt.ex || '').toString().trim()
      const altResolved = await resolveAlternativeEntry({
        supabaseAdmin,
        ncm: altNcmClean,
        ex: altExClean,
        candidates,
        fullTechnicalProfile,
        compositionAnalysis,
        vetoedNcms,
        reason: alt.reason || 'Posição fiscal alternativa sugerida pelas passadas de IA.',
        source: 'citado pela IA',
      })

      if (altResolved) {
        resolvedAlternatives.push(altResolved)
      }
    }

    // =========================================================================
    // CALIBRAÇÃO UNIVERSAL: MONTAGEM FINAL DE ALTERNATIVAS A PARTIR DOS
    // CANDIDATOS AVALIADOS (EVALUATED CANDIDATES SWEEP)
    // =========================================================================
    // A lista de alternativas DEVE ser derivada dos evaluated_candidates, não
    // apenas das menções explícitas das passadas de IA.
    // Após o veredito final, varremos os candidatos avaliados e promovemos a
    // alternativas os NCMs de maior aderência não citados, aplicando a hierarquia:
    // 1. Candidatos de partes com vínculo indireto casado com target_machines
    //    (salvo veto se produto for aparelho com função própria autônoma verdadeira, ex.: microfone/monitor);
    // 2. Residuais de função própria do mesmo capítulo da máquina servida / produto
    //    (ex.: 8543 para Cap. 85, 8479 para Cap. 84, 9031 para Cap. 90);
    // 3. Demais candidatos com aderência semântica / setorial por ordem de score;
    // 4. Genéricos de terceiro nível por último.
    const resolvedProductNatureForSweep = normalizeProductNature(
      finalProductUnderstanding?.product_nature,
    )
    const isTrulyAutonomousDeliveryProduct =
      /\b(microfone|microphone|fones? de ouvido|headphones?|alto-falante|loudspeaker|monitor de v[ií]deo)\b/i.test(
        fullTechnicalProfile,
      )
    const isCompleteStandaloneProduct =
      resolvedProductNatureForSweep === 'aparelho com função própria completa' &&
      isTrulyAutonomousDeliveryProduct

    // Classificação de candidatos não citados por tiers
    const scoredCandidatesToPromote: Array<{
      cand: any
      tier: number
      prioritySubScore: number
      customReason: string
    }> = []

    for (const cand of candidates) {
      const cNcm = normalizeNcm(cand.ncm)
      if (!cNcm || cNcm === recommendedNcmClean) continue
      if (vetoedNcms.has(cNcm)) continue
      if (resolvedAlternatives.some((a) => a.ncm === cNcm)) continue

      const cFullDesc = cand.ncm_descricao_full || cand.ncm_descricao || cand.source_text || ''
      // VETO TECNOLÓGICO NA VARREDURA: Posição 90.07 ou exigência de película vetada para captação digital
      const sweepTechCheck = checkTechnologyIncompatibility(cNcm, cFullDesc, fullTechnicalProfile)
      if (sweepTechCheck.incompatible) {
        vetoedNcms.add(cNcm)
        continue
      }

      const partsPattern = isPartsNcmPattern(cFullDesc)
      const isResidual = isResidualStandaloneDeviceNcm(cFullDesc)

      // Verificar se as partes têm vínculo indireto com target_machines
      let matchesTargetMachineRange = false
      let matchedRangeText = ''
      if (partsPattern.isParts && partsPattern.detectedRanges.length > 0) {
        for (const heading of resolvedTargetHeadings) {
          if (isHeadingContainedInPartsRanges(heading, partsPattern.detectedRanges)) {
            matchesTargetMachineRange = true
            matchedRangeText = partsPattern.detectedRanges
              .map((r) => `${r.rawStart} a ${r.rawEnd}`)
              .join(', ')
            break
          }
        }
      }

      // REGRA GENÉRICA 5: NCMs de partes NÃO podem ultrapassar/ser promovidos
      // se o produto for aparelho com função primordial autônoma verdadeira (áudio/vídeo)
      if (partsPattern.isParts && isCompleteStandaloneProduct) {
        continue
      }
      const targetStr =
        canonicalTargetMachines.length > 0
          ? canonicalTargetMachines.join(', ')
          : finalProductUnderstanding?.target_machines?.join(', ') ||
            'máquinas de destino da função'

      const candChapter = cNcm.slice(0, 2)
      const recChapter = recommendedNcmClean.slice(0, 2)
      const primaryTargetHeading = resolvedTargetHeadings[0] || ''
      const targetChapter = primaryTargetHeading.slice(0, 2) || recChapter

      const baseScore = Number(cand.combined_score ?? cand.vector_score ?? cand.text_score ?? 0.5)

      // Tier 1: Partes casando primeiro (vínculo indireto com target_machines dentro do intervalo de posições)
      if (partsPattern.isParts && matchesTargetMachineRange) {
        const justification = `Vínculo indireto (Nota 2(b) do Cap. ${candChapter} / RGI 1): destina-se a ${targetStr}, dentro do intervalo de posições ${matchedRangeText} declarado expressamente no texto oficial do NCM. Promovido como alternativa a partir dos candidatos avaliados com vínculo indireto.`
        scoredCandidatesToPromote.push({
          cand,
          tier: 1,
          prioritySubScore: 100 + baseScore,
          customReason: justification,
        })
      }
      // Tier 2: Residual de função própria do mesmo capítulo da máquina servida / produto
      else if (isResidual && (candChapter === targetChapter || candChapter === recChapter)) {
        const justification = `Posição residual de função própria do Capítulo ${candChapter} (RGI 1 / RGI 6): abrange máquinas e aparelhos elétricos com função própria não especificados nas posições anteriores. Promovido como alternativa secundária a partir dos candidatos avaliados.`
        scoredCandidatesToPromote.push({
          cand,
          tier: 2,
          prioritySubScore: 50 + baseScore,
          customReason: justification,
        })
      }
      // Tier 3: Outros residuais de função própria de capítulos conexos
      else if (isResidual) {
        const justification = `Posição residual de função própria do Capítulo ${candChapter} (RGI 1): residual de aparelhos com função própria não compreendidos noutras posições. Promovido da varredura de candidatos avaliados.`
        scoredCandidatesToPromote.push({
          cand,
          tier: 3,
          prioritySubScore: 25 + baseScore,
          customReason: justification,
        })
      }
      // Tier 4: Candidatos de setor / família hierárquica específica (não genéricos residuais)
      else if (cand.is_component_sector || cand.is_family_expansion) {
        const justification = `Candidato avaliado com aderência setorial e semântica na base oficial (Capítulo ${candChapter}). Promovido da varredura de candidatos avaliados.`
        scoredCandidatesToPromote.push({
          cand,
          tier: 4,
          prioritySubScore: 10 + baseScore,
          customReason: justification,
        })
      }
      // Tier 5: Genéricos de terceiro nível por último
      else {
        const justification = `Posição fiscal alternativa aplicável com base nos candidatos avaliados no catálogo oficial.`
        scoredCandidatesToPromote.push({
          cand,
          tier: 5,
          prioritySubScore: baseScore,
          customReason: justification,
        })
      }
    }

    // Ordenar por tier (menor tier = maior prioridade) e depois pelo prioritySubScore decrescente
    scoredCandidatesToPromote.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier
      return b.prioritySubScore - a.prioritySubScore
    })

    // Promover os melhores candidatos não citados para preencher as alternativas até o teto de 4
    for (const item of scoredCandidatesToPromote) {
      if (resolvedAlternatives.length >= 4) break
      const cNcm = normalizeNcm(item.cand.ncm)
      if (resolvedAlternatives.some((a) => a.ncm === cNcm)) continue

      const altResolved = await resolveAlternativeEntry({
        supabaseAdmin,
        ncm: cNcm,
        ex: (item.cand.ex || '').toString().trim(),
        candidates,
        fullTechnicalProfile,
        compositionAnalysis,
        vetoedNcms,
        reason: item.customReason,
        source: 'promovido da varredura de candidatos',
      })

      if (altResolved) {
        resolvedAlternatives.push(altResolved)
      }
    }

    // =========================================================================
    // INJEÇÃO DETERMINÍSTICA DO NCM RESIDUAL 85437099 (INVARIANTE)
    // =========================================================================
    // Regra do usuário: o NCM 85437099 deve SEMPRE constar nas alternativas de
    // classificação NCM caso não seja o código recomendado e não esteja presente
    // nas alternativas já resolvidas. Enquadramento residual supletivo de referência.
    // Posição de inserção: imediatamente APÓS a 1ª alternativa (índice 1 da lista).
    // Se a lista atingir o teto de 4 alternativas, remove a última para acomodá-lo.
    if (
      recommendedNcmClean !== '85437099' &&
      !resolvedAlternatives.some((a) => a.ncm === '85437099')
    ) {
      try {
        const residualTaxRate = await resolveEffectiveTaxRate(supabaseAdmin, '85437099', '')
        let residualDesc =
          residualTaxRate?.ncm_descricao_full || residualTaxRate?.ncm_descricao || ''
        if (!residualDesc) {
          const { data: dbExactRow } = await supabaseAdmin
            .from('imp_sim_tax_rates')
            .select('ncm_descricao_full, ncm_descricao')
            .eq('ncm', '85437099')
            .limit(1)
            .maybeSingle()
          residualDesc =
            dbExactRow?.ncm_descricao_full ||
            dbExactRow?.ncm_descricao ||
            'Outras máquinas e aparelhos elétricos com função própria'
        }

        const resIi = Number(residualTaxRate?.ii_efetivo ?? residualTaxRate?.ii_rate ?? 10.8)
        const resIpi = Number(residualTaxRate?.ipi_rate ?? 6.5)
        const resPis = Number(residualTaxRate?.pis_rate ?? 2.1)
        const resCofins = Number(residualTaxRate?.cofins_rate ?? 9.65)
        const resTotal = Number((resIi + resIpi + resPis + resCofins).toFixed(2))

        const injected85437099Alt = {
          ncm: '85437099',
          ex: '',
          description: residualDesc,
          ii: resIi,
          ipi: resIpi,
          pis: resPis,
          cofins: resCofins,
          total_tax: resTotal,
          has_ex_tarifario: false,
          reason:
            'Posição fiscal residual supletiva (RGI 1 e 6): máquinas e aparelhos elétricos com função própria, não especificados nem compreendidos noutras posições do Capítulo 85 — enquadramento residual de referência para equipamentos de áudio/vídeo profissional.',
          alternatives_source: 'promovido da varredura de candidatos',
        }

        // Teto de 4 alternativas: se já tiver 4 ou mais, descartar a última (menos aderente)
        if (resolvedAlternatives.length >= 4) {
          resolvedAlternatives.pop()
        }

        // Inserção imediatamente após a 1ª alternativa (índice 1 da lista)
        // Se a lista estiver vazia, insere no início (índice 0)
        const insertIndex = resolvedAlternatives.length > 0 ? 1 : 0
        resolvedAlternatives.splice(insertIndex, 0, injected85437099Alt)
      } catch (injErr) {
        console.warn('Erro ao injetar determinísticamente NCM 85437099 nas alternativas:', injErr)
      }
    }

    const executionTimeMs = Date.now() - startTime

    const primaryDescription =
      primaryTaxRate.ex_descricao ||
      primaryTaxRate.ncm_descricao_full ||
      primaryTaxRate.ncm_descricao ||
      primaryTaxRate.source_text ||
      ''

    // Montar a justificativa final contendo a análise de composição e o checklist comparativo
    let finalJustification = llmResponseJson.justification || ''
    if (compositionAnalysis.isKit) {
      const compText = `[Análise de Composição RGI 3b/3c]: Produto identificado como conjunto/sistema (${compositionAnalysis.detectedComponents.join(', ')}). Enquadramento determinado pela função essencial do conjunto global.`
      if (!finalJustification.includes('[Análise de Composição')) {
        finalJustification = `${compText}\n\n${finalJustification}`
      }
    }

    // JUSTIFICATIVA OBRIGATÓRIA DE VÍNCULO INDIRETO QUANDO PEÇAS/ACESSÓRIOS FOR RECOMENDADO:
    const recPartsCheck = isPartsNcmPattern(primaryDescription)
    if (recPartsCheck.isParts && recPartsCheck.detectedRanges.length > 0) {
      const targetStr =
        canonicalTargetMachines.length > 0
          ? canonicalTargetMachines.join(', ')
          : finalProductUnderstanding?.target_machines?.join(', ') || 'aparelhos de destino'
      const rangesStr = recPartsCheck.detectedRanges
        .map((r) => `${r.rawStart} a ${r.rawEnd}`)
        .join(', ')
      const resolvedNature = normalizeProductNature(finalProductUnderstanding?.product_nature)
      const natureText =
        resolvedNature ===
        'acessório dependente (sem função autônoma, requer produto principal para operar)'
          ? 'acessório sem função autônoma'
          : resolvedNature === 'peça de reposição (substituição de componente)'
            ? 'peça de reposição'
            : 'parte/acessório'

      const indirectLinkNote = `[Vínculo Indireto de Partes e Acessórios]: Enquadramento como ${natureText}, destinado a ${targetStr}, dentro do intervalo de posições ${rangesStr} declarado expressamente no texto oficial da NCM (RGI 1/2, Nota 2 do Capítulo).`
      if (!finalJustification.includes('[Vínculo Indireto')) {
        finalJustification = `${indirectLinkNote}\n\n${finalJustification}`
      }
    }

    // TELEMETRIA E AUDITORIA DA LÓGICA DE PEÇAS (Requisito 4 e 5):
    // Identificar se a lógica de peças com vínculo indireto foi acionada e o veredito de precedência sobre residual
    const partsTelemetry = evaluatePartsLogicTelemetry({
      recommendedNcm: recommendedNcmClean,
      recommendedDesc: primaryDescription,
      alternatives: resolvedAlternatives,
      candidates,
      targetMachines: canonicalTargetMachines,
      partsPrecedenceApplied: partsPrecedenceVerdict,
    })

    // SUPRESSÃO DO BLOCO DE EX QUANDO NÃO HÁ EX:
    // O bloco de checklist formatado só é injetado no relatório do usuário se houver Ex homologado na resposta final.
    // Sem Ex na resposta final (finalRecommendationEx vazio), o bloco é omitido do relatório ao usuário,
    // mantendo os detalhes técnicos preservados no checklist_log interno e na telemetria.
    if (checklistFormattedReport && Boolean(recommendedExClean) && !exVetoApplied) {
      let reportHeader = ''
      if (checklistLog.status === 'NÃO VERIFICADO') {
        reportHeader = `[Checklist de Condições Restritivas do Ex-Tarifário: NÃO VERIFICADO - REQUER REVISÃO ESPECIALISTA]\n${checklistFormattedReport}\n\n`
      } else {
        reportHeader = `[Checklist de Condições Restritivas do Ex-Tarifário: HOMOLOGADO]\n${checklistFormattedReport}\n\n`
      }
      finalJustification = `${reportHeader}${finalJustification}`
    }

    // Se o veto de Ex foi aplicado, o Ex final NUNCA pode carregar valor de Ex vetado
    const finalRecommendationEx = exVetoApplied ? '' : primaryTaxRate.ex || recommendedExClean || ''
    const finalHasEx = exVetoApplied ? false : hasEx && Boolean(finalRecommendationEx)

    // REGENERAÇÃO ESTRITA DA FUNDAMENTAÇÃO LEGAL (legal_basis):
    // Proibido herdar referência a Ex remoto, vetado ou diferente do Ex final homologado.
    // Verificação em código: nenhum código de Ex citado no legal_basis pode diferir do Ex final.
    const finalExCode = finalRecommendationEx.toString().trim()
    let regeneratedLegalBasis = {
      ...(llmResponseJson.legal_basis || primaryTaxRate.legal_basis || {}),
    }

    const rawNotes = (regeneratedLegalBasis.notes || '').toString()
    // Procurar menções a Ex-Tarifário na nota
    const exMentionMatch = rawNotes.match(/ex(?:-tarif[aá]rio)?\s*[:#-]?\s*(\d{1,4})/i)

    if (exMentionMatch) {
      const citedExDigits = exMentionMatch[1].padStart(3, '0')
      const finalExDigits = finalExCode ? finalExCode.padStart(3, '0') : ''

      if (!finalExCode || citedExDigits !== finalExDigits) {
        // Ex citado difere do Ex final: REGENERAR notes por completo sem a menção ao Ex vetado/incompatível
        const cleanedNotes = rawNotes
          .replace(/conforme\s+descrito\s+no\s+ex-tarif[aá]rio\s*\d+/gi, '')
          .replace(/com\s+ex-tarif[aá]rio\s*\d+/gi, '')
          .replace(/ex-tarif[aá]rio\s*\d+/gi, '')
          .replace(/\s{2,}/g, ' ')
          .replace(/\s*\.\s*\./g, '.')
          .trim()

        regeneratedLegalBasis.notes =
          cleanedNotes && cleanedNotes.length > 5
            ? cleanedNotes
            : `Classificação determinada pela função essencial na NCM ${recommendedNcmClean} (${regeneratedLegalBasis.regime || 'Geral'}), sem Ex-Tarifário concedido.`
      }
    } else if (!finalExCode && /ex-tarif[aá]rio/i.test(rawNotes)) {
      regeneratedLegalBasis.notes = `Classificação na NCM ${recommendedNcmClean} com base nas Regras Gerais de Interpretação (RGI 1 / RGI 3). Sem aplicação de Ex-Tarifário.`
    }

    // =========================================================================
    // VARREDURA UNIVERSAL EM CASCATA DE MENÇÕES ÓRFÃS DE NCM/EX (INVARIANTE)
    // =========================================================================
    // Todo código NCM de 8 dígitos ou fragmento hierárquico (ex: 90319090, 9031.90.90, 9031)
    // ou menção de Ex pertencentes a candidatos vetados ou que não coincidam com o NCM/Ex final homologado
    // (ou com a própria linha da alternativa em que aparece) devem ser suprimidos/substituídos por
    // referência canônica neutra à função essencial do produto.

    // 1. Limpeza profunda em recommendation.justification
    finalJustification = sanitizeOrphanNcmReferences({
      text: finalJustification,
      allowedNcm: recommendedNcmClean,
      allowedEx: finalRecommendationEx,
      vetoedNcms,
      essentialFunction: initialRecommendation.essential_function || 'aparelho com função própria',
    })

    // 2. Limpeza profunda em recommendation.legal_basis.notes
    if (regeneratedLegalBasis.notes) {
      regeneratedLegalBasis.notes = sanitizeOrphanNcmReferences({
        text: String(regeneratedLegalBasis.notes),
        allowedNcm: recommendedNcmClean,
        allowedEx: finalRecommendationEx,
        vetoedNcms,
        essentialFunction:
          initialRecommendation.essential_function || 'aparelho com função própria',
      })
    }

    // 3. Limpeza profunda em alternatives[].reason e alternatives[].description
    for (const alt of resolvedAlternatives) {
      if (alt.reason) {
        alt.reason = sanitizeOrphanNcmReferences({
          text: String(alt.reason),
          allowedNcm: alt.ncm,
          allowedEx: alt.ex || '',
          vetoedNcms,
          essentialFunction:
            initialRecommendation.essential_function || 'aparelho com função própria',
        })
      }
      if (alt.description) {
        alt.description = sanitizeOrphanNcmReferences({
          text: String(alt.description),
          allowedNcm: alt.ncm,
          allowedEx: alt.ex || '',
          vetoedNcms,
          essentialFunction:
            initialRecommendation.essential_function || 'aparelho com função própria',
        })
      }
    }

    const recommendationObject = {
      ncm: recommendedNcmClean,
      ex: finalRecommendationEx,
      description: primaryDescription,
      ii: iiRate,
      ipi: ipiRate,
      pis: pisRate,
      cofins: cofinsRate,
      total_tax: totalTax,
      has_ex_tarifario: finalHasEx,
      justification: finalJustification,
      legal_basis: regeneratedLegalBasis,
      ex_details: finalHasEx ? exDetails : null,
    }

    // Formatar string combinada com as duas passadas
    // Ex: "openai (gpt-4o-mini) + deepseek (deepseek-chat)"
    const compositeModelUsed = auditorModelUsed
      ? `${analystModelUsed} + ${auditorModelUsed}`
      : analystModelUsed

    // =========================================================================
    // CORREÇÃO (4) — LOG COMPLETO DE CANDIDATOS AVALIADOS (AUDITORIA FUTURA)
    // =========================================================================
    // Gravar no log imp_sim_ncm_classification_log (payload agent_suggestion)
    // a lista completa de candidatos avaliados (NCM, Ex, score/direção de recuperação,
    // marcação se veio de expansão de família hierárquica, alíquotas).
    const evaluatedCandidatesLog = candidates.map((c: any) => ({
      ncm: normalizeNcm(c.ncm),
      ex: (c.ex || '').toString().trim(),
      description: c.ncm_descricao_full || c.ncm_descricao || '',
      ex_description: c.ex_descricao || null,
      vector_score: c.vector_score ?? null,
      text_score: c.text_score ?? null,
      combined_score: c.combined_score ?? null,
      ii_rate: c.ii_rate ?? null,
      ipi_rate: c.ipi_rate ?? null,
      pis_rate: c.pis_rate ?? null,
      cofins_rate: c.cofins_rate ?? null,
      is_family_expansion: Boolean(c.is_family_expansion),
      expansion_parent_6: c.expansion_parent_6 || null,
      is_component_sector: Boolean(c.is_component_sector),
      is_target_machine_parts: Boolean(c.is_target_machine_parts),
      is_parts_indirect_linking: Boolean(c.is_parts_indirect_linking),
      matched_parts_ranges: c.matched_parts_ranges || null,
    }))

    // 15. Gravação no log de auditoria (imp_sim_ncm_classification_log)
    let auditId: string | null = null
    if (saveLog) {
      try {
        const { data: logEntry, error: logError } = await supabaseAdmin
          .from('imp_sim_ncm_classification_log')
          .insert({
            input_description: productDescription,
            agent_suggestion: {
              recommendation: recommendationObject,
              alternatives: resolvedAlternatives,
              confidence: llmResponseJson.confidence || 'media',
              sufficient_info: sufficiencyCheck.isSufficient,
              model_used: compositeModelUsed,
              analyst_model: analystModelUsed,
              auditor_model: auditorModelUsed || 'none',
              product_understanding: finalProductUnderstanding,
              brand,
              model,
              additional_specs: additionalSpecs,
              lean_signature: leanSignature,
              initial_recommendation: initialRecommendation,
              audit_verdict: auditVerdict,
              composition_analysis: compositionAnalysis,
              checklist_log: checklistLog,
              ex_veto_applied: exVetoApplied,
              parts_indirect_logic: partsTelemetry,
              evaluated_candidates: evaluatedCandidatesLog,
              evaluated_candidates_count: evaluatedCandidatesLog.length,
            },
            final_choice_ncm: recommendedNcmClean,
            final_choice_ex: finalRecommendationEx,
            confirmed_by: callerUserId,
            status: 'pendente',
            product_id: productId,
            imp_sim_product_id: impSimProductId,
            audit_links: webSources,
            knowledge_base_version: '3.1',
            execution_time_ms: executionTimeMs,
          })
          .select('id')
          .single()

        if (logError) {
          console.warn('Erro ao gravar imp_sim_ncm_classification_log (não fatal):', logError)
        } else if (logEntry) {
          auditId = logEntry.id
        }
      } catch (logEx) {
        console.warn('Exceção ao gravar log de auditoria NCM:', logEx)
      }
    }

    const responsePayload = {
      success: true,
      audit_id: auditId,
      recommendation: recommendationObject,
      alternatives: resolvedAlternatives,
      product_understanding: finalProductUnderstanding,
      confidence: (llmResponseJson.confidence || 'media').toLowerCase(),
      sufficient_info: sufficiencyCheck.isSufficient,
      web_sources: webSources,
      model_used: compositeModelUsed,
      analyst_model: analystModelUsed,
      auditor_model: auditorModelUsed,
      candidates_count: candidates.length,
      evaluated_candidates: evaluatedCandidatesLog,
      execution_time_ms: executionTimeMs,
      audit_verdict: auditVerdict,
      lean_signature: leanSignature,
      composition_analysis: compositionAnalysis,
      checklist_log: checklistLog,
      parts_indirect_logic: partsTelemetry,
      version: '3.8.0-build.620',
      timestamp: new Date().toISOString(),
    }
    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Erro não tratado na edge function classify-ncm:', error)
    const errMessage = error?.message || String(error)
    const isTimeout = /timeout|statement timeout|canceling statement/i.test(errMessage)
    return new Response(
      JSON.stringify({
        error: isTimeout
          ? 'Tempo limite de consulta excedido no banco de dados. Por favor, tente novamente.'
          : 'Erro interno ao processar classificação fiscal.',
        details: errMessage,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// ==========================================
// FUNÇÕES AUXILIARES UNIVERSAIS
// ==========================================

/**
 * Avaliação canônica de isKit para a composição (Fase 0):
 * Regra: isKit é TRUE SOMENTE quando o produto é comercializado como conjunto de múltiplos itens
 * fisicamente autônomos que operam juntos (ex.: transmissor + receptor no sistema de microfone sem fio),
 * NUNCA para aparelho singular com botões/joystick/periféricos integrados (ex.: Sony RM-IP500).
 */
/**
 * Resolve e valida uma entrada de alternativa contra imp_sim_tax_rates_effective e imp_sim_tax_rates,
 * garantindo integridade estrita de NCM+Ex e calculando alíquotas oficiais e rastreamento de alternatives_source.
 */
async function resolveAlternativeEntry(params: {
  supabaseAdmin: any
  ncm: string
  ex: string
  candidates: any[]
  fullTechnicalProfile: string
  compositionAnalysis: CompositionAnalysisResult
  vetoedNcms: Set<string>
  reason: string
  source: 'citado pela IA' | 'promovido da varredura de candidatos'
}): Promise<any | null> {
  const {
    supabaseAdmin,
    ncm,
    ex,
    candidates,
    fullTechnicalProfile,
    compositionAnalysis,
    vetoedNcms,
    reason,
    source,
  } = params

  const altNcmClean = normalizeNcm(ncm)
  const altExClean = (ex || '').toString().trim()
  if (!altNcmClean || vetoedNcms.has(altNcmClean)) return null

  let altTaxRate = altExClean
    ? await resolveEffectiveTaxRate(supabaseAdmin, altNcmClean, altExClean)
    : null

  if (!altTaxRate) {
    altTaxRate = await resolveEffectiveTaxRate(supabaseAdmin, altNcmClean, '')
  }

  if (!altTaxRate) {
    altTaxRate = candidates.find((c: any) => normalizeNcm(c.ncm) === altNcmClean)
  }

  if (!altTaxRate) return null

  let officialRow = altTaxRate

  if (!officialRow.ncm_descricao_full) {
    const { data: dbExactRow } = await supabaseAdmin
      .from('imp_sim_tax_rates')
      .select(
        'ncm, ex, ncm_descricao_full, ncm_descricao, ex_descricao, ii_rate, ipi_rate, pis_rate, cofins_rate, has_ex_tarifario',
      )
      .eq('ncm', altNcmClean)
      .limit(1)
      .maybeSingle()
    if (dbExactRow) {
      officialRow = { ...officialRow, ...dbExactRow }
    }
  }

  let altFinalEx = officialRow.ex || altExClean || ''
  let altOfficialExDesc: string | null = officialRow.ex_descricao || null

  if (altFinalEx && officialRow.ex && normalizeNcm(officialRow.ncm) === altNcmClean) {
    if (String(officialRow.ex).trim() !== String(altFinalEx).trim()) {
      altFinalEx = ''
      altOfficialExDesc = null
    }
  } else if (altFinalEx && !officialRow.ex) {
    const { data: exCheckRow } = await supabaseAdmin
      .from('imp_sim_tax_rates')
      .select('ex, ex_descricao')
      .eq('ncm', altNcmClean)
      .eq('ex', altFinalEx)
      .maybeSingle()
    if (!exCheckRow) {
      altFinalEx = ''
      altOfficialExDesc = null
    } else {
      altOfficialExDesc = exCheckRow.ex_descricao
    }
  }

  if (altFinalEx && altOfficialExDesc) {
    const altExCheck = evaluateExChecklistAgainstProduct({
      exDescription: altOfficialExDesc,
      productText: fullTechnicalProfile,
      isKit: compositionAnalysis.isKit,
      detectedComponents: compositionAnalysis.detectedComponents,
    })
    if (!altExCheck.passed) {
      altFinalEx = ''
      altOfficialExDesc = null
    }
  }

  const officialFullNcmDesc = officialRow.ncm_descricao_full || officialRow.ncm_descricao || ''
  const altDesc =
    altFinalEx && altOfficialExDesc
      ? `${officialFullNcmDesc} | Ex ${altFinalEx}: ${altOfficialExDesc}`
      : officialFullNcmDesc

  const altNatureContradiction = checkNatureContradiction({
    productText: fullTechnicalProfile,
    candidateDesc: altDesc,
    detectedComponents: compositionAnalysis.detectedComponents,
  })
  if (altNatureContradiction.contradicted) {
    vetoedNcms.add(altNcmClean)
    return null
  }

  const altIi = Number(officialRow.ii_efetivo ?? officialRow.ii_rate ?? 0)
  const altIpi = Number(officialRow.ipi_rate ?? 0)
  const altPis = Number(officialRow.pis_rate ?? 2.1)
  const altCofins = Number(officialRow.cofins_rate ?? 9.65)
  const altTotal = Number((altIi + altIpi + altPis + altCofins).toFixed(2))

  return {
    ncm: altNcmClean,
    ex: altFinalEx,
    description: altDesc,
    ii: altIi,
    ipi: altIpi,
    pis: altPis,
    cofins: altCofins,
    total_tax: altTotal,
    has_ex_tarifario: Boolean(altFinalEx),
    reason: reason || 'Posição fiscal alternativa aplicável.',
    alternatives_source: source,
  }
}

function evaluateCanonicalIsKit(params: {
  productUnderstanding?: any
  productText: string
  initialDetectedComponents: string[]
}): boolean {
  const pu = params.productUnderstanding || {}
  const identity = String(pu.identity || '').toLowerCase()
  const essentialFunction = String(pu.essential_function || '').toLowerCase()
  const rawText = params.productText.toLowerCase()

  // Se a identidade ontológica declara um aparelho unitário singular
  const singularUnitPatterns = [
    /\b(controlador|controller|painel|mesa|console|c[aâ]mera|camcorder|conversor|gravador|monitor|switch|roteador|aparelho individual|dispositivo singular)\b/i,
  ]
  const isSingularIdentity = singularUnitPatterns.some((pat) => pat.test(identity))

  // Se for explicitamente par transmissor + receptor autônomos
  const hasAutonomousTxRxPair =
    (/\b(transmissor|transmitter|bodypack|utx|tx)\b/i.test(rawText) &&
      /\b(receptor|receiver|urx|rx)\b/i.test(rawText)) ||
    /\b(transmissor\s*\+\s*receptor|transmitter\s+and\s+receiver|sistema\s+sem\s+fio\s+completo)\b/i.test(
      rawText,
    )

  if (hasAutonomousTxRxPair) {
    return true
  }

  // Se a identidade for expressamente singular (ex: controlador remoto), NUNCA é kit
  if (isSingularIdentity) {
    return false
  }

  // Se o próprio product_understanding declarou is_kit_or_system
  if (pu.is_kit_or_system === true || pu.is_kit === true) {
    return true
  }

  // Itens autônomos múltiplos explícitos
  return false
}

/**
 * Varredura Universal de Menções Órfãs de NCM/Ex (Princípio Genérico):
 * Elimina referências textuais a NCMs vetados (ex: 9031, 90319090, 9031.90.90) ou Ex vetados
 * de justificativas, notas legais e razões de alternativas, substituindo por referências canônicas neutras.
 */
function sanitizeOrphanNcmReferences(params: {
  text: string
  allowedNcm: string
  allowedEx?: string
  vetoedNcms: Set<string>
  essentialFunction: string
}): string {
  let result = params.text || ''
  if (!result) return ''

  const allowedClean = normalizeNcm(params.allowedNcm)
  const allowedExClean = (params.allowedEx || '').toString().trim()
  const vetoedSet = params.vetoedNcms

  // 1. Substituir menções diretas a NCMs vetados (com ou sem pontuação)
  for (const vetoed of vetoedSet) {
    if (!vetoed || vetoed === allowedClean) continue

    // Formatos: 90319090, 9031.90.90, 9031.90, 9031
    const ncm8 = vetoed
    const ncmFormatted = `${vetoed.slice(0, 4)}.${vetoed.slice(4, 6)}.${vetoed.slice(6, 8)}`

    // Veto explícito de 8 dígitos
    const regex8 = new RegExp(`(?:ncm\\s*)?(?:${ncm8}|${ncmFormatted.replace(/\./g, '\\.')})`, 'gi')
    result = result.replace(regex8, `posição fiscal correspondente à função essencial`)

    // Veto de menções que citam especificamente a posição vetada como recomendada
    // Ex: "A classificação recomendada é NCM 90319090" -> "A classificação recomendada é NCM ${allowedClean}"
    const recRegex = new RegExp(
      `(?:classifica[cç][aã]o recomendada [eé] (?:a )?NCM\\s*)(?:${ncm8}|${ncmFormatted.replace(/\./g, '\\.')})`,
      'gi',
    )
    result = result.replace(recRegex, `classificação recomendada é NCM ${allowedClean}`)
  }

  // 2. Varrer qualquer NCM de 8 dígitos presente no texto que NÃO SEJA o NCM permitido
  // e que pertença aos capítulos regulados (84, 85, 90) caso não coincida
  // PRESERVAÇÃO: Não corromper intervalos de posições de 4 dígitos declarados em textos de vínculo indireto
  // (ex: "85.24 a 85.28", "posições 84.25 a 84.30"). Apenas códigos completos de 8 dígitos vetados são varridos.
  const anyNcm8Regex = /\b(\d{4})\.?(\d{2})\.?(\d{2})\b/g
  result = result.replace(anyNcm8Regex, (match, p1, p2, p3) => {
    const rawDigits = `${p1}${p2}${p3}`
    if (rawDigits === allowedClean) {
      return match
    }
    // Se for NCM diferente do permitido e vetado
    if (vetoedSet.has(rawDigits)) {
      return 'posição fiscal correspondente'
    }
    return match
  })

  // 3. Suprimir menções órfãs a "Fundamentação Complementar:" que perpetuem argumentos de NCM vetado
  // Se o trecho de "Fundamentação Complementar" mencionar posição vetada ou afirmar recomendação oposta
  result = result.replace(
    /Fundamenta[cç][aã]o Complementar:\s*A classifica[cç][aã]o recomendada [eé].*?(?=(?:\n\n|$))/gis,
    '',
  )

  // 4. Se não há Ex permitido, suprimir qualquer menção a Ex vetado (ex: "com Ex 247", "Ex-Tarifário 019")
  if (!allowedExClean) {
    result = result
      .replace(/conforme\s+descrito\s+no\s+ex-tarif[aá]rio\s*\d+/gi, '')
      .replace(/com\s+ex-tarif[aá]rio\s*\d+/gi, '')
      .replace(/ex-tarif[aá]rio\s*\d+/gi, '')
      .replace(/\[Checklist de Condições Restritivas do Ex-Tarifário:[^\]]+\]\s*/gi, '')
  }

  // 5. Normalizar espaços múltiplos e pontuação duplicada
  result = result
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*\.\s*\./g, '.')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim()

  return result
}

/**
 * Análise de Composição Universal (RGI 3b/3c):
 * Identifica se qualquer produto fornecido é um sistema, conjunto, sortido ou kit com múltiplos componentes.
 * REGRA VINCULANTE (Princípio Genérico):
 * Componentes listados na análise de composição DEVEM ser citados TEXTUALMENTE na descrição/especificações do produto (verbatim).
 * Componente que não aparece explicitamente no texto NÃO pode ser afirmado.
 * Expressões descritivas de uso ou montagem (ex: "camera-mount", "para câmera", "for camera", "camera mount",
 * "rack mount", "pole mount", "shoe mount") indicam montagem/acessório ou compatibilidade, NUNCA a presença do aparelho como componente.
 */
function analyzeProductComposition(text: string): CompositionAnalysisResult {
  if (!text)
    return {
      isKit: false,
      detectedComponents: [],
      compositionIdentified: false,
      targetMachines: [],
    }
  const lower = text.toLowerCase()

  const kitIndicators = [
    'sistema',
    'system',
    'conjunto',
    'set',
    'kit',
    'combo',
    'bundle',
    'pack',
    'transmissor + receptor',
    'transmitter and receiver',
    'tx + rx',
    'tx/rx',
    'bodypack + receiver',
  ]

  const isKitExplicit = kitIndicators.some((ind) => lower.includes(ind))

  // Identificação genérica de Máquinas de Destino da Função (conectivos de finalidade e modificadores de montagem)
  // Conectivos: "para", "destinado a", "destina-se a", "indicado para", "apropriado para", "for", "designed for", "compatible with", "control of", "uso em"
  const targetMachines: string[] = []
  const destinationPatterns = [
    /(?:para|destinado\s+a|destina-se\s+a|apropriad[ao]\s+para|indicad[ao]\s+para|compat[ií]vel\s+com|controle\s+d[aeo]s?|uso\s+em)\s+([a-záàâãéèêíïóôõöúçñ0-9\s-]{2,50})/gi,
    /(?:for|intended\s+for|suitable\s+for|compatible\s+with|designed\s+for|control\s+of)\s+([a-z0-9\s-]{2,50})/gi,
  ]

  for (const pat of destinationPatterns) {
    let match: RegExpExecArray | null
    while ((match = pat.exec(text)) !== null) {
      const phrase = match[1]
        .split(/[,.;/()–—\n\r]|(?:\b(?:with|com|and|e|de|do|da|including|incluindo)\b)/i)[0]
        .trim()
      if (phrase && phrase.length >= 3 && phrase.length <= 50) {
        targetMachines.push(phrase)
      }
    }
  }

  // Modificadores de montagem ("-mount", "-mounted", "-mountable") identificam acoplamento/máquina de destino, não componente
  const mountMatches = text.matchAll(/\b([a-z0-9]+)-(?:mount|mounted|mountable)\b/gi)
  for (const m of mountMatches) {
    const rawMount = m[1].toLowerCase()
    if (rawMount !== 'rack' && rawMount !== 'pole' && rawMount !== 'wall' && rawMount !== 'shoe') {
      targetMachines.push(m[1])
    }
  }

  // Normalização e deduplicação de máquinas de destino (descartar fragmentos triviais/recortes de marketing)
  const trivialMarketingFragments = new Set([
    'the',
    'an',
    'a',
    'all',
    'any',
    'o',
    'a',
    'os',
    'as',
    'um',
    'uma',
    'uns',
    'umas',
    'pro',
    'professional',
    'broadcast',
    'studio',
    'production',
    'live',
    'high',
    'ultra',
    'todas',
    'todos',
    'todo',
    'toda',
    'seu',
    'sua',
    'seus',
    'suas',
    'cada',
    'mais',
    'melhor',
  ])

  const uniqueTargets = Array.from(
    new Set(
      targetMachines
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 3 && !trivialMarketingFragments.has(t) && !/^\d+$/.test(t)),
    ),
  )

  // Criar cópia do texto com conectivos de finalidade e modificadores de montagem REMOVIDOS
  // Componente só entra se estiver citado textualmente FORA de conectivos de finalidade e fora de modificadores "-mount"
  let textForComponents = text
  const cleaningRegexes = [
    /\b[a-z0-9]+-(?:mount|mounted|mountable)\b/gi,
    /\b(?:camera|shoe|rack|pole|wall)\s+mount\b/gi,
    /(?:para|destinado\s+a|destina-se\s+a|apropriad[ao]\s+para|indicad[ao]\s+para|compat[ií]vel\s+com|controle\s+d[aeo]s?|uso\s+em)\s+[^\n\r,.;]+/gi,
    /(?:for|intended\s+for|suitable\s+for|compatible\s+with|designed\s+for|control\s+of)\s+[^\n\r,.;]+/gi,
  ]
  for (const cr of cleaningRegexes) {
    textForComponents = textForComponents.replace(cr, ' ')
  }

  // Detecção estrita e verbatim de componentes físicos integrados do produto
  const detected: string[] = []

  // 1. Transmissor
  const txMatch = textForComponents.match(
    /\b(transmissor(?:a|es)?|transmitter(?:s)?|bodypack|plug-on)\b/i,
  )
  if (txMatch) {
    detected.push(txMatch[0])
  }

  // 2. Receptor
  const rxMatch = textForComponents.match(
    /\b(receptor(?:a|es)?|receiver(?:s)?|base sintonizadora)\b/i,
  )
  if (rxMatch) {
    detected.push(rxMatch[0])
  }

  // 3. Microfone / Cápsula
  const micMatch = textForComponents.match(
    /\b(microfone(?:s)?|microphone(?:s)?|lavalier|lapela|headset)\b/i,
  )
  if (micMatch) {
    detected.push(micMatch[0])
  }

  // 4. Controlador / Console
  const ctrlMatch = textForComponents.match(
    /\b(controlador(?:es)?|controller(?:s)?|console(?:s)?|joystick(?:s)?)\b/i,
  )
  if (ctrlMatch) {
    detected.push(ctrlMatch[0])
  }

  // 5. Câmera: só entra como componente se sobrou no texto LIMPO (ou seja, quando NÃO é destino da função)
  const cameraMatch = textForComponents.match(/\b(c[aâ]mera(?:s)?|camcorder(?:s)?)\b/i)
  if (cameraMatch) {
    detected.push(cameraMatch[0])
  }

  // 6. Fonte / Alimentação / Bateria
  const psuMatch = textForComponents.match(
    /\b(power supply|fonte de alimenta[cç][aã]o|carregador(?:es)?|bateria(?:s)?|battery)\b/i,
  )
  if (psuMatch) {
    detected.push(psuMatch[0])
  }

  // 7. Lente / Óptica
  const lensMatch = textForComponents.match(/\b(lente(?:s)?|lens(?:es)?|[oó]ptica)\b/i)
  if (lensMatch) {
    detected.push(lensMatch[0])
  }

  // Deduplicação preservando verbatim
  const uniqueDetected = Array.from(new Set(detected))

  const hasTxRxPair =
    uniqueDetected.some((d) => /transmi/i.test(d)) && uniqueDetected.some((d) => /recep/i.test(d))
  const isKit = isKitExplicit || hasTxRxPair || uniqueDetected.length >= 2

  // A composição é considerada identificada se não é kit ou se, sendo kit, os componentes foram encontrados no texto
  const compositionIdentified = !isKit || uniqueDetected.length >= 2

  return {
    isKit,
    detectedComponents: uniqueDetected,
    compositionIdentified,
    targetMachines: uniqueTargets,
  }
}

/**
 * Extração de Qualificadores de texto de um Ex-Tarifário
 */
function extractExQualifiers(exDesc: string): ExQualifiers {
  const lower = exDesc.toLowerCase()

  // Tipo de sinal
  let signalType: 'digital' | 'analog' | null = null
  if (lower.includes('digital') || lower.includes('digitais')) {
    signalType = 'digital'
  } else if (
    lower.includes('analógico') ||
    lower.includes('analogico') ||
    lower.includes('analógica')
  ) {
    signalType = 'analog'
  }

  // Faixas de frequência ou medidas (ex: 470 a 720MHz, 2.4GHz, etc.)
  const freqRegex =
    /(\d+(?:[.,]\d+)?\s*(?:a|à|-|to)\s*\d+(?:[.,]\d+)?\s*(?:mhz|ghz|khz|hz)|\d+(?:[.,]\d+)?\s*(?:mhz|ghz|khz))/gi
  const frequencyRanges = (exDesc.match(freqRegex) || []).map((m) => m.trim())

  // Item singular (ex: "transmissores de áudio", "receptor", "adaptador") vs "sistemas", "conjuntos"
  const isPluralOrSingularIndividual =
    /^(transmissores|transmissor|receptores|receptor|módulos|módulo|adaptadores|adaptador|antenas|antena|cabos|cabo)\b/i.test(
      exDesc.trim(),
    )
  const isKitDescription = /\b(sistemas|sistema|conjuntos|conjunto|estação completa)\b/i.test(
    exDesc,
  )

  const isSingularItem = isPluralOrSingularIndividual && !isKitDescription
  let singularComponentType: string | null = null
  if (isSingularItem) {
    if (/transmissor/i.test(exDesc)) singularComponentType = 'transmissor'
    else if (/receptor/i.test(exDesc)) singularComponentType = 'receptor'
  }

  return {
    signalType,
    frequencyRanges,
    isSingularItem,
    singularComponentType,
    materialRequirements: [],
    purposeRequirements: [],
    formatPortability:
      lower.includes('portátil') || lower.includes('portateis') ? ['portátil'] : [],
  }
}

/**
 * Checklist Universal de Condições Restritivas do Ex:
 * Confronta CADA qualificador extraído do Ex com as especificações do produto.
 * Produz comparações no padrão "produto: X → Ex exige: Y → ATENDE/NÃO ATENDE/NÃO COMPROVADO".
 *
 * REGRAS VINCULANTES (Princípios Genéricos):
 * 1. Cada productValue do checklist DEVE ser copiado LITERALMENTE das specs do produto.
 * 2. Valor não presente nas specs = status "NÃO COMPROVADO" + acionar busca web para verificar.
 * 3. Verificação de consistência em código: se a descrição contém o termo "analog"/"analógico"
 *    (português/inglês, case-insensitive), o checklist NÃO PODE registrar valor "digital" contraditório,
 *    e vice-versa — quando detectar contradição, forçar "NÃO COMPROVADO" + busca web.
 */
function evaluateExChecklistAgainstProduct(params: {
  exDescription: string
  productText: string
  isKit: boolean
  detectedComponents: string[]
}): ExChecklistResult {
  const qualifiers = extractExQualifiers(params.exDescription)
  const productText = params.productText || ''
  const productLower = productText.toLowerCase()
  const comparisons: ExConditionComparison[] = []
  let passed = true
  let vetoReason = ''
  const missingInformation: string[] = []
  let needsWebSearch = false

  // 1. Condição de Composição: Ex descreve item singular vs produto é conjunto/sistema
  if (qualifiers.isSingularItem && params.isKit) {
    const status = 'NÃO ATENDE'
    passed = false
    vetoReason = `O Ex-Tarifário descreve item singular isolado (${qualifiers.singularComponentType || 'peça individual'}), enquanto o produto é um conjunto/sistema com múltiplos componentes (${params.detectedComponents.join(', ')}). RGI 3b impede a aplicação do Ex singular ao conjunto sem fundamento explícito.`
    comparisons.push({
      name: 'Composição do Equipamento',
      productValue: `Conjunto/Sistema com múltiplos elementos (${params.detectedComponents.join(', ') || 'Kit'})`,
      exRequirement: `Item singular individual (${qualifiers.singularComponentType || 'Componente único'})`,
      status,
      reason: 'Ex singular não se aplica a conjunto completo (RGI 3b/3c)',
    })
  } else if (qualifiers.isSingularItem) {
    comparisons.push({
      name: 'Composição do Equipamento',
      productValue: 'Item individual/singular',
      exRequirement: 'Item singular',
      status: 'ATENDE',
    })
  }

  // 2. Condição de Sinal: Digital vs Analógico
  if (qualifiers.signalType) {
    // Busca verbatim do termo na descrição/specs
    const analogSnippetMatch = productText.match(
      /\b(wireless transmission:\s*analog\s*\w*|analog(?:a|o|ic[ao]s?)?|anal[óo]gic[ao]s?|fm modulation|modula[cç][aã]o anal[óo]gica)\b/i,
    )
    const digitalSnippetMatch = productText.match(
      /\b(wireless transmission:\s*digital\s*\w*|digital(?:is|es)?|modula[cç][aã]o digital|transmiss[aã]o digital)\b/i,
    )

    const hasAnalogTerm = Boolean(analogSnippetMatch)
    const hasDigitalTerm = Boolean(digitalSnippetMatch)

    // Detecção de contradição direta em código:
    // Se a descrição contém "analog"/"analógico" e o Ex exige digital (ou vice-versa)
    if (qualifiers.signalType === 'digital') {
      if (hasAnalogTerm && !hasDigitalTerm) {
        // Copiar literal das specs
        const literalValue = analogSnippetMatch ? analogSnippetMatch[0] : 'Analog'
        passed = false
        vetoReason =
          vetoReason ||
          `Produto opera com sinal analógico ("${literalValue}"), incompatível com a exigência estrita de sinal DIGITAL do Ex-Tarifário.`
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: literalValue,
          exRequirement: 'Sinal Digital',
          status: 'NÃO ATENDE',
          reason: 'Incompatibilidade de sinal (analógico nas specs vs digital exigido pelo Ex)',
        })
      } else if (hasAnalogTerm && hasDigitalTerm) {
        // Contradição detectada nas specs (ex: transmissão analógica com DSP digital)
        // Regra vinculante: forçar "NÃO COMPROVADO" + busca web
        needsWebSearch = true
        missingInformation.push(
          'confirmação se a transmissão de sinal é estritamente digital ou analógica',
        )
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: `${analogSnippetMatch![0]} / ${digitalSnippetMatch![0]}`,
          exRequirement: 'Sinal Digital',
          status: 'NÃO COMPROVADO',
          reason:
            'Contradição detectada nas especificações (termos analógico e digital presentes). Necessária averiguação técnica.',
        })
      } else if (hasDigitalTerm) {
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: digitalSnippetMatch![0],
          exRequirement: 'Sinal Digital',
          status: 'ATENDE',
        })
      } else {
        // Valor não presente nas specs = status "NÃO COMPROVADO" + acionar busca web
        needsWebSearch = true
        missingInformation.push('tipo de sinal de transmissão (digital/analógico)')
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: 'Não mencionado nas especificações',
          exRequirement: 'Sinal Digital',
          status: 'NÃO COMPROVADO',
          reason:
            'Valor não presente nas especificações do produto. Requer validação complementar.',
        })
      }
    } else if (qualifiers.signalType === 'analog') {
      if (hasDigitalTerm && !hasAnalogTerm) {
        const literalValue = digitalSnippetMatch ? digitalSnippetMatch[0] : 'Digital'
        passed = false
        vetoReason =
          vetoReason ||
          `Produto opera com sinal digital ("${literalValue}"), incompatível com a exigência de sinal analógico do Ex-Tarifário.`
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: literalValue,
          exRequirement: 'Sinal Analógico',
          status: 'NÃO ATENDE',
          reason: 'Incompatibilidade de sinal (digital nas specs vs analógico exigido)',
        })
      } else if (hasAnalogTerm && hasDigitalTerm) {
        needsWebSearch = true
        missingInformation.push('confirmação de modulação analógica exclusiva')
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: `${analogSnippetMatch![0]} / ${digitalSnippetMatch![0]}`,
          exRequirement: 'Sinal Analógico',
          status: 'NÃO COMPROVADO',
          reason: 'Contradição detectada nas especificações. Necessária averiguação técnica.',
        })
      } else if (hasAnalogTerm) {
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: analogSnippetMatch![0],
          exRequirement: 'Sinal Analógico',
          status: 'ATENDE',
        })
      } else {
        needsWebSearch = true
        missingInformation.push('tipo de sinal analógico')
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: 'Não mencionado nas especificações',
          exRequirement: 'Sinal Analógico',
          status: 'NÃO COMPROVADO',
          reason: 'Valor não presente nas especificações.',
        })
      }
    }
  }

  // 3. Condição de Faixa de Frequência
  if (qualifiers.frequencyRanges.length > 0) {
    for (const range of qualifiers.frequencyRanges) {
      const numbers = range.match(/\d+(?:[.,]\d+)?/g)
      if (numbers && numbers.length >= 2) {
        const minEx = parseFloat(numbers[0].replace(',', '.'))
        const maxEx = parseFloat(numbers[1].replace(',', '.'))

        // Procurar menção literal no texto
        const productFreqMatches = productText.match(
          /(\d{2,4}(?:[.,]\d+)?)\s*(?:a|-|to)\s*(\d{2,4}(?:[.,]\d+)?)\s*(?:mhz|ghz|khz)/i,
        )
        if (productFreqMatches) {
          const literalFreqSnippet = productFreqMatches[0]
          const minProd = parseFloat(productFreqMatches[1].replace(',', '.'))
          const maxProd = parseFloat(productFreqMatches[2].replace(',', '.'))

          const isContained = minProd >= minEx && maxProd <= maxEx
          if (isContained) {
            comparisons.push({
              name: `Faixa de Frequência (${range})`,
              productValue: literalFreqSnippet,
              exRequirement: `Igual ou contida em ${minEx}-${maxEx}MHz`,
              status: 'ATENDE',
            })
          } else {
            passed = false
            vetoReason =
              vetoReason ||
              `Faixa do produto (${literalFreqSnippet}) fora dos limites exigidos pelo Ex (${minEx}-${maxEx}MHz).`
            comparisons.push({
              name: `Faixa de Frequência (${range})`,
              productValue: literalFreqSnippet,
              exRequirement: `Igual ou contida em ${minEx}-${maxEx}MHz`,
              status: 'NÃO ATENDE',
            })
          }
        } else {
          // Frequência não encontrada nas specs
          needsWebSearch = true
          missingInformation.push(`faixa de frequência (${range})`)
          comparisons.push({
            name: `Faixa de Frequência (${range})`,
            productValue: 'Não mencionada nas especificações',
            exRequirement: range,
            status: 'NÃO COMPROVADO',
            reason: 'Faixa de frequência não explicitada no texto do produto.',
          })
        }
      }
    }
  }

  // Invariante obrigatória do Checklist (Princípio Genérico):
  // status "NÃO VERIFICADO" ou qualquer status que não seja "APROVADO" implica passed: false.
  // Sincronizar o flag passed com o status em código para qualquer status que não seja comprovado/verificado.
  let checklistStatus: 'APROVADO' | 'VETADO' | 'NÃO VERIFICADO' = 'APROVADO'
  let requiresExpertReview = false

  if (comparisons.length === 0) {
    checklistStatus = 'NÃO VERIFICADO'
    requiresExpertReview = true
    needsWebSearch = true
    missingInformation.push(
      'qualificadores técnicos do Ex-Tarifário não puderam ser extraídos automaticamente',
    )
    comparisons.push({
      name: 'Verificação de Qualificadores do Ex-Tarifário',
      productValue: 'Especificações técnicas gerais do produto',
      exRequirement:
        'Condições do Ex-Tarifário (texto descritivo complexo ou sem qualificadores tabulados)',
      status: 'NÃO COMPROVADO',
      reason:
        'Extração automática vazia de qualificadores do Ex. Requer revisão especialista humana.',
    })
  } else if (!passed) {
    checklistStatus = 'VETADO'
  } else if (comparisons.some((c) => c.status === 'NÃO COMPROVADO')) {
    needsWebSearch = true
    checklistStatus = 'NÃO VERIFICADO'
    requiresExpertReview = true
  }

  // Sincronização estrita da invariante:
  // Se o status for NÃO VERIFICADO ou VETADO, passed DEVE ser false.
  const finalPassed = checklistStatus === 'APROVADO' && passed

  return {
    passed: finalPassed,
    status: checklistStatus,
    requiresExpertReview,
    comparisons,
    vetoReason: vetoReason || undefined,
    missingInformation,
    needsWebSearch,
  }
}

/**
 * Confronta a descrição hierárquica completa do candidato com a natureza do produto.
 * Princípio genérico: Veta qualquer candidato cuja descrição afirme que o produto é de uma natureza
 * ontológica que o produto não possui (ex: candidato descreve câmera para um controlador/remoto/periférico;
 * candidato descreve aparelho de áudio para cabo; candidato descreve monitor para lente).
 */
function checkNatureContradiction(params: {
  productText: string
  candidateDesc: string
  detectedComponents: string[]
}): { contradicted: boolean; reason?: string } {
  const prodTextLower = params.productText.toLowerCase()
  const candDescLower = params.candidateDesc.toLowerCase()

  // 1. Caso: Produto é periférico de controle / comando / remoto / joystick
  // 0. VETO TECNOLÓGICO: Captação digital vs película/cinematográfica (90.07)
  const techCheck = checkTechnologyIncompatibility(
    candDescLower.match(/\b\d{4,8}\b/)?.[0] || '',
    candDescLower,
    prodTextLower,
  )
  if (techCheck.incompatible) {
    return {
      contradicted: true,
      reason: techCheck.reason,
    }
  }

  const isControllerOrPeripheral =
    /\b(controlador|controller|controle remoto|remote control|joystick|console de controle|mesa de controle|painel de controle)\b/i.test(
      prodTextLower,
    )

  // Substantivo "câmera" ou "câmeras" como natureza autônoma (não apenas de interface)
  // Ex: 90071000 descreve "Câmeras cinematográficas..." ou "Câmeras de vídeo digital..."
  const candIsDirectlyCamera =
    /\b(c[aâ]meras?(?: de v[ií]deo| cinematogr[aá]ficas?| digitais?| fotogr[aá]ficas?)?)\b/i.test(
      candDescLower,
    ) &&
    !/\b(partes|acess[oó]rios|comandos?|control|painel|console)\b/i.test(candDescLower) &&
    (candDescLower.startsWith('câmera') ||
      candDescLower.startsWith('camera') ||
      candDescLower.includes('câmeras cinematográficas') ||
      candDescLower.includes('câmeras de televisão') ||
      candDescLower.includes('câmeras fotográficas'))

  if (isControllerOrPeripheral && candIsDirectlyCamera) {
    return {
      contradicted: true,
      reason: `Contradição de natureza ontológica: o produto é um dispositivo periférico/controlador remoto, mas o candidato NCM descreve diretamente o aparelho de captura ("${params.candidateDesc.slice(0, 100)}..."), violando o princípio da função essencial.`,
    }
  }

  // 1.B Caso: Controlador remoto periférico classificado como quadro/painel/console de distribuição elétrica industrial (8537)
  // ou projetor/câmera cinematográfica (9007) ou instrumentos ópticos de medição (9031)
  // ou aparelho de transmissão/telecomunicação em rede (8517) pelo mero meio de envio de comandos
  const isElectricalSwitchboardOrCinematographicOrMeasurement =
    /\b(quadros?, pain[eé]is, consoles, cabinas|distribui[cç][aã]o de energia|cinematogr[aá]fic[ao]s|aparelhos e instrumentos de medida|perfil[oó]metros|ópticos de medida)\b/i.test(
      candDescLower,
    )
  if (isControllerOrPeripheral && isElectricalSwitchboardOrCinematographicOrMeasurement) {
    return {
      contradicted: true,
      reason: `Contradição de natureza ontológica: o produto é um controlador remoto eletrônico/digital, incompatível com aparelhos de distribuição elétrica pesada (8537), cinematográficos (9007) ou medição óptica (9031).`,
    }
  }

  // 1.C Caso: Controlador remoto dedicado de câmeras ou máquinas classificado como telecomunicação (8517)
  // pelo mero meio de envio de comandos via IP/Ethernet
  const isTelecomEquipment =
    /\b(concentradores de linhas de assinantes|terminais de central|comuta[cç][aã]o telef[oô]nica|roteadores digitais de rede|telefonia celular)\b/i.test(
      candDescLower,
    )
  if (isControllerOrPeripheral && isTelecomEquipment) {
    return {
      contradicted: true,
      reason: `Contradição de função essencial: controlar remotamente uma máquina não é serviço de telecomunicação (85.17); comandos transmitidos por IP/cabo são mero meio físico de controle.`,
    }
  }
  // 2. Caso: Produto é transmissor/receptor/microfone de áudio, mas o candidato descreve diretamente câmera/óptica
  const isAudioDevice =
    /\b(microfone|microphone|transmissor de [aá]udio|receptor de [aá]udio|headset|lapela|lavalier)\b/i.test(
      prodTextLower,
    )
  if (isAudioDevice && candIsDirectlyCamera) {
    return {
      contradicted: true,
      reason: `Contradição de natureza: o produto é equipamento de áudio/acústico, mas o candidato descreve aparelho de filmagem/câmera.`,
    }
  }

  // 3. Caso: Aparelho eletroeletrônico classificado em máquinas mecânicas pesadas de elevação/construção
  const isElectronicDevice =
    /\b(eletr[oô]nico|digital|ip|visca|rs-422|rs422|ethernet|hdmi|usb|sem fio|wireless)\b/i.test(
      prodTextLower,
    )
  const candIsHeavyMachinery =
    /\b(guindastes?|pontes rolantes|gruas|talhas|empilhadeiras?|aparelhos de eleva[cç][aã]o ou de carga)\b/i.test(
      candDescLower,
    )
  if (isElectronicDevice && candIsHeavyMachinery) {
    return {
      contradicted: true,
      reason: `Contradição setorial: aparelho eletroeletrônico/digital classificado em máquinas pesadas de movimentação/elevação do Cap. 84.`,
    }
  }

  // 4. PENALIZAÇÃO DE INCOMPATIBILIDADE FUNCIONAL ESPECÍFICA (Princípio Genérico):
  // Subitens cuja função específica descrita no texto oficial é mutuamente excludente da função do produto.
  // Exemplo universal: Funções de RF/micro-ondas/satélite/telecomunicação para aparelhos de chaveamento/mistura/processamento de sinal em banda base (vídeo/áudio);
  // ou aparelhos para eletrocussão de insetos, eletrificadores de cerca, etc. para produtos de áudio e vídeo.
  const isBasebandSignalProcessingOrSwitching =
    /\b(switcher|misturador|mixer|mesa de corte|comuta[cç][aã]o|processador de v[ií]deo|video processor|grava[cç][aã]o de v[ií]deo|sdi|hdmi)\b/i.test(
      prodTextLower,
    )
  const candIsExclusivelyRfOrMicrowaveOrSpecializedIncompatible =
    /\b(micro-ondas|sinais de micro-ondas|telecomunica[cç][oõ]es via sat[eé]lite|v[aá]lvula twt|phase combiner|eletrocutar insetos|eletrificadores de cercas?|acoplamento exclusivamente ac[uú]stico)\b/i.test(
      candDescLower,
    )

  if (
    isBasebandSignalProcessingOrSwitching &&
    candIsExclusivelyRfOrMicrowaveOrSpecializedIncompatible
  ) {
    return {
      contradicted: true,
      reason: `Incompatibilidade funcional excludente: produto opera chaveamento/processamento/mistura de sinal em banda base ("${params.productText.slice(0, 80)}..."), mutuamente excludente de subitem com aplicação específica em RF/micro-ondas/satélite/outros fins restritos ("${params.candidateDesc.slice(0, 100)}...").`,
    }
  }

  return { contradicted: false }
}

/**
 * Verifica se a justificativa da auditoria fundamentou a escolha em vantagens tributárias (alíquota / II 0%),
 * o que é expressamente proibido pela regra vinculante.
 */
function checkTaxAdvantageCriterion(params: {
  auditCritique?: string
  correctionReason?: string
  initialCandidate?: any
  correctedCandidate?: any
}): { violatesTaxProhibition: boolean; reason?: string } {
  const combinedText =
    `${params.auditCritique || ''} ${params.correctionReason || ''}`.toLowerCase()

  // Termos explícitos de fundamentação tributária como motivo
  const taxAdvantageKeywords = [
    /\b(al[ií]quota (?:zero|menor|mais vantajosa|reduzida|benef[ií]cio))\b/i,
    /\b(ii\s*(?:de\s*)?0%|ii\s*=\s*0%|imposto de importa[cç][aã]o zero)\b/i,
    /\b(vantagem (?:fiscal|tribut[aá]ria))\b/i,
    /\b(redu[cç][aã]o forte de carga)\b/i,
    /\b(ex-tarif[aá]rio vantajoso|ex vantajoso)\b/i,
    /\b(menor carga tribut[aá]ria|economia de impostos)\b/i,
  ]

  const hasTaxMotivator = taxAdvantageKeywords.some((pattern) => pattern.test(combinedText))

  if (hasTaxMotivator) {
    return {
      violatesTaxProhibition: true,
      reason:
        'A auditoria utilizou alíquota ou vantagem tributária (II 0% / Ex vantajoso) como critério de escolha ou justificativa, o que é expressamente vedado pelas regras de enquadramento técnico.',
    }
  }

  return { violatesTaxProhibition: false }
}

/**
 * Seleciona a melhor alternativa de fallback entre candidatos, aplicando o princípio de:
 * "Preferir família de função genérica compatível (máquinas/aparelhos com função própria, partes e acessórios)
 * sobre a de função específica incompatível."
 */
function selectBestCompatibleFallback(params: {
  candidates: any[]
  rejectedNcms: string[]
  productText: string
  detectedComponents: string[]
}): any | null {
  const { candidates, rejectedNcms, productText, detectedComponents } = params
  const rejectedSet = new Set(rejectedNcms.map((n) => normalizeNcm(n)))

  // Filtrar apenas candidatos que não foram explicitamente rejeitados
  const eligibleCandidates = candidates.filter((c: any) => !rejectedSet.has(normalizeNcm(c.ncm)))

  if (eligibleCandidates.length === 0) return null

  // Pontuar candidatos por compatibilidade técnica
  const scored = eligibleCandidates.map((cand: any) => {
    let score = cand.combined_score ?? 0
    const ncmClean = normalizeNcm(cand.ncm)
    const desc = (
      cand.ncm_descricao_full ||
      cand.ncm_descricao ||
      cand.source_text ||
      ''
    ).toLowerCase()

    // 1. Elimina contradição de natureza e incompatibilidade funcional
    const check = checkNatureContradiction({
      productText,
      candidateDesc: desc,
      detectedComponents,
    })
    if (check.contradicted) {
      score -= 100 // Fortemente penalizado
    }

    // 1.B Avaliação de qualificadores quantitativos intrafamília
    const qualCheck = evaluateIntrafamilyQualifierScore(desc, cand.ex_descricao, productText)
    if (qualCheck.hasPattern) {
      score += qualCheck.scoreAdjustment
    }

    // 2. Bonifica famílias de função genérica compatível para aparelhos de controle/eletroeletrônicos    // Família 8543 (máquinas e aparelhos elétricos com função própria)
    if (ncmClean.startsWith('8543')) {
      score += 25
    }
    // Família 8529 (partes reconhecíveis como exclusiva ou principalmente destinadas aos aparelhos das posições 85.25 a 85.28)
    if (ncmClean.startsWith('8529')) {
      score += 20
    }
    // Família 8518 (aparelhos de áudio) se for produto de áudio
    if (ncmClean.startsWith('8518') && /\b(microfone|audio|som)\b/i.test(productText)) {
      score += 30
    }

    // Veto tecnológico eliminatório em fallback: 90.07 / película incompatível com captação eletrônica
    const techCheckFallback = checkTechnologyIncompatibility(ncmClean, desc, productText)
    if (techCheckFallback.incompatible) {
      score -= 300
    }

    // Penaliza capítulos sabidamente distantes da natureza eletroeletrônica quando o produto é eletrônico
    if (
      ncmClean.startsWith('8426') ||
      ncmClean.startsWith('8428') ||
      ncmClean.startsWith('9007') ||
      ncmClean.startsWith('8537') ||
      ncmClean.startsWith('9031')
    ) {
      score -= 50
    }

    return { candidate: cand, score }
  })

  scored.sort((a, b) => b.score - a.score)

  if (scored[0] && scored[0].score > -50) {
    return scored[0].candidate
  }

  return null
}

/**
 * Recuperação Semântica Orientada por Família de Posições (SEM listas fixas / hardcoded).
 * Mapeia semântica da consulta para posições candidatas no banco garantindo candidatos de setores adjacentes.
 */
async function retrieveSectorOrientedCandidates(params: {
  supabaseAdmin: any
  query: string
  queryEmbedding: number[] | null
  fullTechnicalProfile: string
  detectedComponents?: string[]
  targetMachines?: string[]
  topN: number
}): Promise<any[]> {
  const {
    supabaseAdmin,
    query,
    queryEmbedding,
    topN,
    detectedComponents = [],
    targetMachines = [],
  } = params

  const rpcParams: {
    query: string
    query_embedding?: string | null
    top_n: number
    match_threshold: number
  } = {
    query,
    top_n: Math.max(topN * 2, 35),
    match_threshold: 0.01,
  }

  if (queryEmbedding && queryEmbedding.length > 0) {
    rpcParams.query_embedding = `[${queryEmbedding.join(',')}]`
  }

  const { data: rawCandidates, error: rpcError } = await supabaseAdmin.rpc(
    'search_ncm_candidates',
    rpcParams,
  )

  if (rpcError) {
    console.error('Erro na RPC search_ncm_candidates:', rpcError)
    throw rpcError
  }

  let candidates = Array.isArray(rawCandidates) ? [...rawCandidates] : []

  // Se componentes foram detectados verbatim na análise de composição (ex: microfone, receptor, transmissor, console),
  // realizar busca direta no banco de posições fiscais que contemplem esses termos textualmente
  // para garantir que a família correspondente à assinatura/componente do produto entre priorizada
  if (detectedComponents.length > 0) {
    try {
      const distinctComps = Array.from(
        new Set(
          detectedComponents
            .map((comp) => comp.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase())
            .filter((c) => c.length >= 4 && !['sistema', 'conjunto', 'para', 'com'].includes(c)),
        ),
      ).slice(0, 3)

      // Paralelizar as buscas de componentes detectados verbatim
      const compPromises = distinctComps.map(async (cleanComp) => {
        try {
          const { data: compMatches } = await supabaseAdmin
            .from('imp_sim_tax_rates')
            .select(
              'id, ncm, ex, ncm_descricao, ncm_descricao_full, ex_descricao, ii_rate, ipi_rate, pis_rate, cofins_rate, has_ex_tarifario',
            )
            .ilike('ncm_descricao_full', `%${cleanComp}%`)
            .limit(8)
          return compMatches || []
        } catch (_e) {
          return []
        }
      })

      const compResults = await Promise.all(compPromises)
      for (const compMatches of compResults) {
        for (const m of compMatches) {
          const alreadyExists = candidates.some(
            (c: any) => normalizeNcm(c.ncm) === m.ncm && (c.ex || '') === (m.ex || ''),
          )
          if (!alreadyExists) {
            candidates.push({
              tax_rate_id: m.id,
              ncm: m.ncm,
              ex: m.ex || '',
              ncm_descricao: m.ncm_descricao || '',
              ncm_descricao_full: m.ncm_descricao_full || m.ncm_descricao || '',
              ex_descricao: m.ex_descricao || null,
              source_text: `NCM ${m.ncm} | ${m.ncm_descricao_full || m.ncm_descricao || ''}${m.ex_descricao ? ` | Ex ${m.ex} ${m.ex_descricao}` : ''}`,
              ii_rate: Number(m.ii_efetivo ?? m.ii_rate ?? 0),
              ipi_rate: Number(m.ipi_rate ?? 0),
              pis_rate: Number(m.pis_rate ?? 2.1),
              cofins_rate: Number(m.cofins_rate ?? 9.65),
              has_ex_tarifario: Boolean(m.has_ex_tarifario),
              vector_score: 0.65,
              text_score: 0.85,
              combined_score: 0.75,
              is_component_sector: true,
            })
          }
        }
      }
    } catch (compErr) {
      console.warn('Falha na busca direcionada por componente verbatim:', compErr)
    }
  }

  // RECUPERAÇÃO UNIVERSAL DE NCMs DE PARTES POR VÍNCULO INDIRETO:
  // Se máquinas de destino foram identificadas na Fase 0 / targetMachines (ou termos de acoplamento):
  // 1. Identificar posições dessas máquinas na base oficial
  // 2. Recuperar genericamente NCMs com assinatura "partes destinadas às posições X a Y"
  //    cujo intervalo abranja as posições das máquinas de destino
  if (targetMachines.length > 0) {
    try {
      const distinctTargets = Array.from(
        new Set(
          targetMachines
            .flatMap((t) => t.toLowerCase().split(/[\s-]+/))
            .filter(
              (w) =>
                (w.length >= 4 &&
                  !['para', 'com', 'destinado', 'apropriado', 'cameras', 'camera'].includes(w)) ||
                w.startsWith('camer') ||
                w.startsWith('câmer') ||
                w === 'ptz',
            ),
        ),
      ).slice(0, 4)

      // Identificar posições da máquina de destino no banco de forma paralela e rápida
      const targetHeadings = new Set<string>()
      const targetPromises = distinctTargets.map(async (targetWord) => {
        try {
          const { data: targetPositions } = await supabaseAdmin
            .from('imp_sim_tax_rates')
            .select('ncm')
            .ilike('ncm_descricao_full', `%${targetWord}%`)
            .limit(8)

          if (targetPositions && targetPositions.length > 0) {
            for (const tp of targetPositions) {
              const h = (tp.ncm || '').slice(0, 4)
              if (h && h.length === 4) targetHeadings.add(h)
            }
          }
        } catch (_err) {
          // não fatal
        }
      })

      // Query rápida de partes usando termos indexáveis (idx_imp_sim_tax_rates_ncm_desc_full_trgm)
      const partsCandidatesPromise = supabaseAdmin
        .from('imp_sim_tax_rates')
        .select(
          'id, ncm, ex, ncm_descricao, ncm_descricao_full, ex_descricao, ii_rate, ipi_rate, pis_rate, cofins_rate, has_ex_tarifario',
        )
        .ilike('ncm_descricao_full', '%partes%')
        .limit(30)

      const [, { data: partsCandidates, error: partsErr }] = await Promise.all([
        Promise.all(targetPromises),
        partsCandidatesPromise,
      ])

      if (partsErr) {
        console.warn('Falha na busca de candidatos de partes:', partsErr)
      } else if (partsCandidates && partsCandidates.length > 0) {
        for (const pc of partsCandidates) {
          const desc = pc.ncm_descricao_full || ''
          const partsInfo = isPartsNcmPattern(desc)
          if (!partsInfo.isParts) continue

          const matchedRanges: string[] = []
          for (const heading of targetHeadings) {
            if (isHeadingContainedInPartsRanges(heading, partsInfo.detectedRanges)) {
              matchedRanges.push(heading)
            }
          }

          if (matchedRanges.length > 0) {
            const alreadyExists = candidates.some(
              (c: any) => normalizeNcm(c.ncm) === pc.ncm && (c.ex || '') === (pc.ex || ''),
            )
            if (!alreadyExists) {
              candidates.push({
                tax_rate_id: pc.id,
                ncm: pc.ncm,
                ex: pc.ex || '',
                ncm_descricao: pc.ncm_descricao || '',
                ncm_descricao_full: pc.ncm_descricao_full || pc.ncm_descricao || '',
                ex_descricao: pc.ex_descricao || null,
                source_text: `NCM ${pc.ncm} | ${pc.ncm_descricao_full || pc.ncm_descricao || ''}${pc.ex_descricao ? ` | Ex ${pc.ex} ${pc.ex_descricao}` : ''}`,
                ii_rate: Number(pc.ii_efetivo ?? pc.ii_rate ?? 0),
                ipi_rate: Number(pc.ipi_rate ?? 0),
                pis_rate: Number(pc.pis_rate ?? 2.1),
                cofins_rate: Number(pc.cofins_rate ?? 9.65),
                has_ex_tarifario: Boolean(pc.has_ex_tarifario),
                vector_score: 0.75,
                text_score: 0.95,
                combined_score: 0.85,
                is_target_machine_parts: true,
                is_parts_indirect_linking: true,
                matched_parts_ranges: partsInfo.detectedRanges.map(
                  (r) => `${r.rawStart} a ${r.rawEnd}`,
                ),
              })
            }
          }
        }
      }
    } catch (targetErr) {
      console.warn(
        'Falha na busca determinística de NCMs de partes por vínculo indireto:',
        targetErr,
      )
    }
  }
  // PRESERVAÇÃO OBRIGATÓRIA DE NCMs DE PARTES E ACESSÓRIOS VINCULADOS:
  // Candidatos de partes com vínculo indireto casando com as máquinas de destino (is_target_machine_parts)
  // NUNCA podem ser descartados no agrupamento ou corte por topN, pois fundamentam a precedência da Nota 2(b).
  const targetPartsCandidates = candidates.filter(
    (c: any) => c.is_target_machine_parts || c.is_parts_indirect_linking,
  )

  // =========================================================================
  // CORREÇÃO (1) — EXPANSÃO DE FAMÍLIA HIERÁRQUICA (PRINCÍPIO GENÉRICO UNIVERSAL)
  // =========================================================================
  // Sempre que um NCM de 8 dígitos entrar como candidato na recuperação,
  // incluir OBRIGATORIAMENTE todas as subposições irmãs do mesmo ramo hierárquico
  // (mesmos 6 primeiros dígitos) presentes na base imp_sim_tax_rates, garantindo que
  // subposições com ex=NULL e descrições específicas não fiquem de fora pelo limit SQL.
  try {
    const candidatePrefixes6 = new Set<string>()
    for (const c of candidates) {
      const ncm8 = normalizeNcm(c.ncm)
      if (ncm8 && ncm8.length === 8) {
        candidatePrefixes6.add(ncm8.slice(0, 6))
      }
      if (candidatePrefixes6.size >= 6) break
    }

    if (candidatePrefixes6.size > 0) {
      // Executar expansões de prefixo em paralelo
      const expansionPromises = Array.from(candidatePrefixes6).map(async (prefix6) => {
        try {
          const { data: siblingRows, error: sibError } = await supabaseAdmin
            .from('imp_sim_tax_rates')
            .select(
              'id, ncm, ex, ncm_descricao, ncm_descricao_full, ex_descricao, ii_rate, ipi_rate, pis_rate, cofins_rate, has_ex_tarifario',
            )
            .like('ncm', `${prefix6}%`)
            .order('ncm', { ascending: true })
            .order('ex', { ascending: true, nullsFirst: true })
            .limit(20)

          if (!sibError && siblingRows && siblingRows.length > 0) {
            return { prefix6, siblingRows }
          }
        } catch (_err) {
          // não fatal
        }
        return null
      })

      const expansionResults = await Promise.all(expansionPromises)
      for (const res of expansionResults) {
        if (!res) continue
        for (const s of res.siblingRows) {
          const sNcm = normalizeNcm(s.ncm)
          const sEx = (s.ex || '').toString().trim()
          const exists = candidates.some(
            (c: any) => normalizeNcm(c.ncm) === sNcm && (c.ex || '').toString().trim() === sEx,
          )
          if (!exists) {
            candidates.push({
              tax_rate_id: s.id,
              ncm: s.ncm,
              ex: s.ex || '',
              ncm_descricao: s.ncm_descricao || '',
              ncm_descricao_full: s.ncm_descricao_full || s.ncm_descricao || '',
              ex_descricao: s.ex_descricao || null,
              source_text: `NCM ${s.ncm} | ${s.ncm_descricao_full || s.ncm_descricao || ''}${s.ex_descricao ? ` | Ex ${s.ex} ${s.ex_descricao}` : ''}`,
              ii_rate: Number(s.ii_efetivo ?? s.ii_rate ?? 0),
              ipi_rate: Number(s.ipi_rate ?? 0),
              pis_rate: Number(s.pis_rate ?? 2.1),
              cofins_rate: Number(s.cofins_rate ?? 9.65),
              has_ex_tarifario: Boolean(s.has_ex_tarifario),
              vector_score: 0.5,
              text_score: 0.5,
              combined_score: 0.5,
              is_family_expansion: true,
              expansion_parent_6: res.prefix6,
            })
          }
        }
      }
    }
  } catch (expErr) {
    console.warn('Falha na expansão de família hierárquica (não fatal):', expErr)
  }

  // Agrupamento semântico por FAMÍLIA DE POSIÇÕES (primeiros 4 dígitos da NCM, ex: 8517, 8518, 8525, 8543)
  // Garantir diversidade semântica: equilibrar candidatos entre a família principal e setores adjacentes
  const families = new Map<string, any[]>()
  for (const c of candidates) {
    const ncmClean = normalizeNcm(c.ncm)
    const familyKey = ncmClean.slice(0, 4)
    if (!families.has(familyKey)) {
      families.set(familyKey, [])
    }
    families.get(familyKey)!.push(c)
  }

  // Ordenar candidatos mantendo diversidade: intercalar candidatos das diferentes famílias encontradas
  // dando prioridade para posições que possuem score alto e candidatos de componentes
  const diversifiedCandidates: any[] = []
  const maxPerFamily = Math.max(4, Math.ceil(topN / Math.max(1, families.size)))

  // Primeiro passar os itens com maior pontuação de cada família
  for (const [_family, famCandidates] of families.entries()) {
    famCandidates.sort((a, b) => (b.combined_score ?? 0) - (a.combined_score ?? 0))
    diversifiedCandidates.push(...famCandidates.slice(0, maxPerFamily))
  }

  // Preencher com o restante até topN ordenado por score
  candidates.sort((a, b) => (b.combined_score ?? 0) - (a.combined_score ?? 0))
  for (const cand of candidates) {
    if (
      !diversifiedCandidates.some(
        (c) => normalizeNcm(c.ncm) === normalizeNcm(cand.ncm) && (c.ex || '') === (cand.ex || ''),
      )
    ) {
      diversifiedCandidates.push(cand)
    }
    if (diversifiedCandidates.length >= topN + 15) break
  }

  // Garantir que todos os candidatos de partes com vínculo indireto estejam na lista final selecionada
  for (const tpc of targetPartsCandidates) {
    if (
      !diversifiedCandidates.some(
        (c) => normalizeNcm(c.ncm) === normalizeNcm(tpc.ncm) && (c.ex || '') === (tpc.ex || ''),
      )
    ) {
      diversifiedCandidates.unshift(tpc)
    }
  }

  // Preservar também candidatos com qualificadores quantitativos satisfeitos pelo produto
  const candidatesWithSatisfiedQualifiers = candidates.filter((c: any) => {
    const desc = c.ncm_descricao_full || c.ncm_descricao || ''
    const q = evaluateIntrafamilyQualifierScore(desc, c.ex_descricao, params.fullTechnicalProfile)
    return q.hasPattern && q.satisfied
  })

  for (const sqc of candidatesWithSatisfiedQualifiers) {
    if (
      !diversifiedCandidates.some(
        (c) => normalizeNcm(c.ncm) === normalizeNcm(sqc.ncm) && (c.ex || '') === (sqc.ex || ''),
      )
    ) {
      diversifiedCandidates.unshift(sqc)
    }
  }

  const selectedCandidates = diversifiedCandidates.slice(
    0,
    Math.max(topN, targetPartsCandidates.length + candidatesWithSatisfiedQualifiers.length + 8),
  )

  return selectedCandidates
}

/**
 * Constrói uma assinatura enxuta do produto: Marca + Modelo + Frase central da função.
 * Isola a identidade e função essencial sem ruído de portas, pinos, conectores e acessórios secundários.
 */
function buildLeanProductSignature(params: {
  brand?: string
  model?: string
  description?: string
}): string {
  const brand = (params.brand || '').trim()
  const model = (params.model || '').trim()
  const rawDesc = (params.description || '').trim()

  // Extração de termos de busca derivada da identidade do produto (substantivos do aparelho,
  // termos de função e máquina de destino) com stopwords genéricas — não os 2 primeiros tokens da descrição de marketing
  const genericStopwords = new Set([
    'o',
    'a',
    'os',
    'as',
    'um',
    'uma',
    'uns',
    'umas',
    'de',
    'do',
    'da',
    'dos',
    'das',
    'em',
    'no',
    'na',
    'nos',
    'nas',
    'por',
    'pelo',
    'pela',
    'pelos',
    'pelas',
    'com',
    'sem',
    'para',
    'destinado',
    'destinada',
    'destinados',
    'destinadas',
    'e',
    'ou',
    'que',
    'se',
    'the',
    'a',
    'an',
    'and',
    'or',
    'of',
    'in',
    'on',
    'at',
    'by',
    'for',
    'with',
    'without',
    'pro',
    'professional',
    'ultra',
    'high',
    'new',
    'novo',
    'nova',
    'original',
    'versao',
    'version',
  ])

  // Isolar substantivos e termos de função / máquina de destino
  // Remove termos puramente de interface e ruído de cabeamento secundário
  const cleanedDesc = rawDesc
    .replace(/\b(bnc|xlr|hdmi|pin|pins|poe|dc in|rs-422|rs232|rj45|db9|tally|gpio)\b[^\s,.]*/gi, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const tokens = cleanedDesc.split(/\s+/).filter((t) => {
    const low = t.toLowerCase()
    return low.length >= 3 && !genericStopwords.has(low) && !/^\d+$/.test(low)
  })

  // Priorizar termos técnicos (aparelho, função, destino)
  const coreTerms = tokens.slice(0, 10).join(' ')

  const parts: string[] = []
  if (brand && !coreTerms.toLowerCase().includes(brand.toLowerCase())) {
    parts.push(brand)
  }
  if (model && !coreTerms.toLowerCase().includes(model.toLowerCase())) {
    parts.push(model)
  }
  if (coreTerms) {
    parts.push(coreTerms)
  }

  const signature = parts.join(' ').trim()
  return signature || rawDesc
}

function normalizeNcm(val: any): string {
  if (!val) return ''
  return String(val).replace(/\D/g, '')
}

/**
 * Avalia se as informações internas fornecidas são suficientes para classificação aduaneira precisa.
 * Gatilho condicional da regra do projeto.
 */
function evaluateInformationSufficiency(params: {
  productDescription: string
  brand: string
  model: string
  additionalSpecs: string
  compositionAnalysis: {
    isKit: boolean
    detectedComponents: string[]
    compositionIdentified?: boolean
    targetMachines: string[]
  }
}): { isSufficient: boolean; reason: string } {
  const desc = params.productDescription.trim()
  const combined = `${desc} ${params.brand} ${params.model} ${params.additionalSpecs}`.trim()

  // 1. Descrição muito curta para construir a identidade básica
  if (desc.length < 25 || combined.length < 35) {
    return {
      isSufficient: false,
      reason:
        'Descrição insuficiente para estabelecer a identidade, função essencial e máquina de destino na Fase 0.',
    }
  }

  // 2. Se o produto apresenta indicadores de conjunto/sistema mas seus componentes essenciais não puderam ser identificados
  if (
    params.compositionAnalysis.isKit &&
    (!params.compositionAnalysis.compositionIdentified ||
      params.compositionAnalysis.detectedComponents.length < 2)
  ) {
    return {
      isSufficient: false,
      reason:
        'Produto reconhecido como sistema/conjunto, mas a composição interna não está totalmente detalhada para fundamentação RGI 3b.',
    }
  }

  // 3. Avaliação da clareza da identidade e função essencial (princípio genérico universal)
  // O texto interno deve conter elementos que permitam extrair o que o produto é (substantivo técnico)
  // e o que ele faz (função operacional ou técnica). Se for apenas código comercial ou jargão de marketing sem detalhamento funcional:
  const words = combined.split(/\s+/).filter((w) => w.length > 2)
  const hasSubstantiveTechnicalDetail = words.length >= 8

  if (!hasSubstantiveTechnicalDetail) {
    return {
      isSufficient: false,
      reason:
        'Informações internas resumidas a fragmentos comerciais sem detalhamento técnico substantivo da função.',
    }
  }

  return {
    isSufficient: true,
    reason: 'Informações internas suficientes para construir o perfil técnico completo na Fase 0.',
  }
}

/**
 * Busca web complementar para especificações técnicas e datasheets
 */
async function searchWebTechnicalSpecs(query: string): Promise<WebSource[]> {
  const sources: WebSource[] = []

  // Tentativa 1: Firecrawl se tiver chave configurada
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY') || ''
  if (firecrawlKey) {
    try {
      const res = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 3,
        }),
      })

      if (res.ok) {
        const json = await res.json()
        const items = json?.data || []
        for (const it of items) {
          if (it.url) {
            sources.push({
              title: it.title || it.url,
              url: it.url,
              snippet: it.description || it.markdown?.slice(0, 300) || '',
            })
          }
        }
        if (sources.length > 0) return sources
      }
    } catch (e) {
      console.warn('Firecrawl search failed:', e)
    }
  }

  // Tentativa 2: DuckDuckGo HTML Lite
  try {
    const encoded = encodeURIComponent(query)
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    if (res.ok) {
      const html = await res.text()
      const resultBlocks = html.split('class="result__body"')
      let count = 0
      for (let i = 1; i < resultBlocks.length && count < 3; i++) {
        const block = resultBlocks[i]
        const urlMatch = block.match(/href="([^"]+)"/)
        const snippetMatch = block.match(/class="result__snippet"[^>]*>(.*?)<\/a>/)
        const titleMatch = block.match(/class="result__title"[^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>/)

        if (urlMatch && (snippetMatch || titleMatch)) {
          let rawUrl = urlMatch[1]
          if (rawUrl.includes('uddg=')) {
            const uddg = rawUrl.split('uddg=')[1]?.split('&')[0]
            if (uddg) rawUrl = decodeURIComponent(uddg)
          }

          const cleanTitle = (titleMatch ? titleMatch[1] : rawUrl).replace(/<[^>]+>/g, '').trim()
          const cleanSnippet = (snippetMatch ? snippetMatch[1] : '').replace(/<[^>]+>/g, '').trim()

          if (rawUrl.startsWith('http')) {
            sources.push({
              title: cleanTitle || 'Documentação Técnica',
              url: rawUrl,
              snippet: cleanSnippet,
            })
            count++
          }
        }
      }
    }
  } catch (ddgErr) {
    console.warn('DuckDuckGo search error:', ddgErr)
  }

  return sources
}

/**
 * Consulta a view pública public.imp_sim_tax_rates_effective
 */
async function resolveEffectiveTaxRate(
  supabaseAdmin: any,
  ncm: string,
  ex: string,
): Promise<any | null> {
  const normNcm = normalizeNcm(ncm)
  if (!normNcm) return null

  let query = supabaseAdmin.from('imp_sim_tax_rates_effective').select('*').eq('ncm', normNcm)

  if (ex && ex.trim() !== '') {
    query = query.eq('ex', ex.trim())
  } else {
    query = query.or('ex.is.null,ex.eq.')
  }

  const { data, error } = await query.limit(1).maybeSingle()
  if (error || !data) return null
  return data
}

/**
 * Invoca um modelo de IA com timeout e tratamento unificado
 */
async function invokeLLMWithTimeout(
  provider: LLMProviderConfig,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const pCheck = isSupportedAIProvider(provider)
    if (!pCheck.supported) {
      throw new Error(
        `Provedor não suportado na inferência (${provider.provider_name}): ${pCheck.reason}`,
      )
    }

    const provType = (provider.provider_type || '').toLowerCase().trim()
    const provName = (provider.provider_name || '').toLowerCase().trim()

    // DeepSeek
    if (provType === 'deepseek' || provName.includes('deepseek')) {
      const endpoint = provider.custom_endpoint || 'https://api.deepseek.com/chat/completions'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: provider.model_id || 'deepseek-chat',
          temperature: 0.1,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`DeepSeek API (${res.status}): ${await res.text()}`)
      const data = await res.json()
      return data.choices?.[0]?.message?.content || ''
    }

    // Gemini (OpenAI compatível endpoint ou endpoint v1beta)
    if (provType === 'gemini' || provName.includes('gemini')) {
      const endpoint =
        provider.custom_endpoint ||
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: provider.model_id || 'gemini-2.0-flash',
          temperature: 0.1,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`Gemini API (${res.status}): ${await res.text()}`)
      const data = await res.json()
      return data.choices?.[0]?.message?.content || ''
    }

    // OpenAI ou custom com endpoint OpenAI-compatível
    const endpoint = provider.custom_endpoint || 'https://api.openai.com/v1/chat/completions'
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.model_id || 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    })

    if (!res.ok) throw new Error(`OpenAI-compatible API (${res.status}): ${await res.text()}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Converte resposta textual do LLM em objeto JSON estruturado
 */
function parseLLMJsonResponse(rawText: string): any {
  if (!rawText) return null
  const clean = rawText.trim()

  try {
    return JSON.parse(clean)
  } catch (_e) {
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(clean.substring(start, end + 1))
      } catch (_e2) {
        return null
      }
    }
    return null
  }
}

/**
 * Gera embedding único usando OpenAI text-embedding-3-small
 */
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    }),
  })

  if (!res.ok) {
    throw new Error(`OpenAI Embedding error: ${await res.text()}`)
  }

  const json = await res.json()
  return json.data[0].embedding
}
