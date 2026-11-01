import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Conversão de peso do catálogo do site: 1 lb = 0.45359237 kg
const LB_TO_KG = 0.45359237

interface SubitemProvavel {
  descricao: string
  quantidade?: number | null
  unidade?: string | null
  indicio_declaracao_aduaneira?: boolean | null
  justificativa_declaracao?: string | null
}

interface ItemTRExtraido {
  numero_item?: string | null
  titulo_item?: string | null
  descricao_completa: string
  finalidade?: string | null
  quantidade?: number | null
  unidade_fornecimento?: string | null
  codigo_catmat?: string | null
  catmat_descricao?: string | null
  referencia_marca_modelo?: string | null
  especificacoes_tecnicas_minimas: string[]
  subitens_provaveis: SubitemProvavel[]
}

interface CandidatoSubitem {
  id: string
  product_id?: string
  description: string
  sku?: string
  quantity: number
  unit_gross_weight_kg: number | null
  unit_cost: number | null
  declared: boolean
  ncm: string | null
  sort_order?: number
}

interface CandidatoProduto {
  origem: 'tr_identificado' | 'banco_modulo' | 'banco_site' | 'banco_ambos'
  fonte_rotulo: string
  id?: string
  source_site_product_id?: string | null
  nome: string
  descricao: string
  sku: string | null
  catmat?: string | null
  ncm: string | null
  peso_bruto_kg: number | null
  preco_custo: number | null
  moeda_custo: string | null
  fonte_custo?: 'preco_padrao' | 'cotacao_fornecedor' | 'custo_cadastrado' | 'site_cost' | null
  fornecedor_nome?: string | null
  data_cotacao?: string | null
  subitens: CandidatoSubitem[]
  aderencia_score: number
  aderencia_justificativa: string
  ncm_sugerido_ia?: {
    ncm: string
    descricao?: string
    confianca?: 'alta' | 'media' | 'baixa'
    justificativa?: string
  } | null
}

interface SubitemMatchResultado {
  subitem_extraido: SubitemProvavel
  candidato_tr: CandidatoProduto
  candidatos_banco: CandidatoProduto[]
  todos_candidatos: CandidatoProduto[]
}

interface ItemTRMatchResultado {
  item_tr: ItemTRExtraido
  candidato_tr_principal: CandidatoProduto
  candidatos_banco_principal: CandidatoProduto[]
  todos_candidatos_principal: CandidatoProduto[]
  subitens_resultados: SubitemMatchResultado[]
  tem_correlacao_cadastrada?: boolean
  ncm_sugerido_ia?: {
    ncm: string
    descricao?: string
    confianca?: 'alta' | 'media' | 'baixa'
    justificativa?: string
  } | null
}

function normalize(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function cleanSku(s?: string | null): string {
  return (s || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

function cleanDigits(s?: string | null): string {
  return (s || '').replace(/\D/g, '')
}

/**
 * Atributos técnicos estruturados extraídos de texto de edital/TR ou cadastro de produto
 */
interface AtributosTecnicos {
  // Matriz / Roteador / Switcher
  capacidadeMatriz?: {
    entradas: number
    saidas: number
    texto: string // ex "40x40"
  } | null
  // Padrões de sinal
  padroesSdi: {
    sdi12g: boolean // 12G-SDI / 12G SDI / 12G
    sdi6g: boolean // 6G-SDI
    sdi3g: boolean // 3G-SDI
    sdiHd: boolean // HD-SDI
    sdiGeral: boolean // SDI genérico
  }
  // Resolução
  resolucoes: {
    res4k: boolean // 4K / UHD / Ultra HD / 2160p / DCI 4K
    res1080p: boolean // Full HD / 1080p / FHD
    res8k: boolean // 8K / 4320p
  }
  // Tipo funcional (família de comutação e roteamento)
  tipoEquipamento: {
    matrizRoteador: boolean // matriz, roteador, router, videohub, routing switcher, distribuidor/seletor de vídeo
    switcherMesa: boolean // mesa de corte, switcher, video mixer, atem
    conversor: boolean // conversor, updowncross, converter
    monitor: boolean // monitor, display
    camera: boolean // camera, filmadora, camcorder
    fonte: boolean // fonte, power supply
  }
}

/**
 * Tabela de números por extenso em português para normalização de capacidade.
 */
const NUMEROS_EXTENSO_PT: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  quatrocentos: 400,
  quinhentos: 500,
}

/**
 * Normaliza números por extenso como "quarenta e quatro" ou "40 (quarenta)" em texto.
 */
function normalizarNumerosExtenso(texto: string): string {
  let s = texto
  // Remove numerais por extenso entre parênteses logo após dígitos: "40 (quarenta)" -> "40"
  s = s.replace(/\b(\d+)\s*\([^)]+\)/g, '$1')

  // Substitui dezenas compostas ("quarenta e dois" -> 42)
  s = s.replace(
    /\b(vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa)\s+e\s+(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)\b/g,
    (_, dez, uni) => {
      const v = (NUMEROS_EXTENSO_PT[dez] || 0) + (NUMEROS_EXTENSO_PT[uni] || 0)
      return String(v)
    },
  )

  // Substitui centenas compostas ("duzentos e vinte e quatro" -> 224, "cento e vinte e oito" -> 128)
  s = s.replace(
    /\b(cento|duzentos|trezentos|quatrocentos|quinhentos)\s+e\s+(\d+)\b/g,
    (_, cen, resto) => {
      const v = (NUMEROS_EXTENSO_PT[cen] || 0) + parseInt(resto, 10)
      return String(v)
    },
  )

  // Substitui números simples por extenso
  for (const [palavra, val] of Object.entries(NUMEROS_EXTENSO_PT)) {
    const reg = new RegExp(`\\b${palavra}\\b`, 'g')
    s = s.replace(reg, String(val))
  }

  return s
}

/**
 * Normaliza todas as variantes de "N entradas e M saídas" (e "N por M", "N x M", etc.)
 * para o token canônico "NxM" (ex.: "40x40").
 */
export function normalizarTextoCapacidade(texto: string): string {
  if (!texto) return ''
  let s = normalize(texto)
  s = normalizarNumerosExtenso(s)

  // Variantes completas:
  // "40 entradas e 40 saídas", "40 entradas / 40 saídas", "40 entradas por 40 saídas"
  // "40 entradas, 40 saídas", "40 entradas x 40 saídas", "40 inputs and 40 outputs"
  s = s.replace(
    /\b(\d{1,3})\s*(?:entradas?|inputs?|in)\s*(?:e|\/|por|x|,|and|\+)?\s*(\d{1,3})\s*(?:sa[ií]das?|outputs?|out)\b/g,
    ' $1x$2 ',
  )

  // Inverso: "40 saídas e 40 entradas"
  s = s.replace(
    /\b(\d{1,3})\s*(?:sa[ií]das?|outputs?|out)\s*(?:e|\/|por|x|,|and|\+)?\s*(\d{1,3})\s*(?:entradas?|inputs?|in)\b/g,
    ' $2x$1 ',
  )

  // "matriz 40 por 40", "roteador 40 por 40"
  s = s.replace(/\b(\d{1,3})\s*por\s*(\d{1,3})\b/g, ' $1x$2 ')

  // "40 x 40", "40 X 40" -> "40x40"
  s = s.replace(/\b(\d{1,3})\s*x\s*(\d{1,3})\b/gi, ' $1x$2 ')

  return s
}

/**
 * Extrai capacidade NxM ou NxN de entradas e saídas (ex.: 40x40, 10x10, 20x20, 80x80, 4x2, "40 entradas e 40 saídas")
 */
export function extrairCapacidadeEntradasSaidas(
  texto: string,
): { entradas: number; saidas: number; texto: string } | null {
  const norm = normalizarTextoCapacidade(texto)

  // 1. Padrão NxM (ex.: 40x40, 10x10, 80x80, 4x2, 224x224)
  const mNxM = norm.match(/\b(\d{1,3})\s*x\s*(\d{1,3})\b/)
  if (mNxM) {
    const inVal = parseInt(mNxM[1], 10)
    const outVal = parseInt(mNxM[2], 10)
    if (!isNaN(inVal) && !isNaN(outVal) && inVal > 0 && outVal > 0) {
      return { entradas: inVal, saidas: outVal, texto: `${inVal}x${outVal}` }
    }
  }

  // 2. Padrão separado: entradas e saídas em trechos diferentes do texto
  const mEntradas = norm.match(/(\d{1,3})\s*(?:entradas?|inputs?|in\b)/)
  const mSaidas = norm.match(/(\d{1,3})\s*(?:sa[ií]das?|outputs?|out\b)/)
  if (mEntradas && mSaidas) {
    const inVal = parseInt(mEntradas[1], 10)
    const outVal = parseInt(mSaidas[1], 10)
    if (!isNaN(inVal) && !isNaN(outVal) && inVal > 0 && outVal > 0) {
      return { entradas: inVal, saidas: outVal, texto: `${inVal}x${outVal}` }
    }
  }

  return null
}

/**
 * Extrai atributos técnicos estruturados de um texto livre
 */
function extrairAtributosTecnicos(texto: string): AtributosTecnicos {
  const norm = normalize(texto)

  // Capacidade de matriz / roteador
  const capacidadeMatriz = extrairCapacidadeEntradasSaidas(texto)

  // Padrões de sinal SDI
  const has12g = /\b12g\b|12g-sdi|12g\s*sdi/.test(norm)
  const has6g = /\b6g\b|6g-sdi|6g\s*sdi/.test(norm)
  const has3g = /\b3g\b|3g-sdi|3g\s*sdi/.test(norm)
  const hasHd = /\bhd-sdi\b|\bhd\s*sdi\b/.test(norm)
  const hasSdiGeral = /\bsdi\b/.test(norm)

  // Resolução
  // 12G-SDI é intrinsecamente 4K/UHD (Ultra HD até 2160p60)
  const has4kExplicit = /\b4k\b|\buhd\b|ultra\s*hd|2160p|dci\s*4k/.test(norm)
  const has4k = has4kExplicit || has12g || has6g // 12G-SDI implica suporte a 4K
  const has1080p = /\b1080p\b|\b1080i\b|full\s*hd|\bfhd\b/.test(norm) || has3g
  const has8k = /\b8k\b|4320p/.test(norm)

  // Tipo / Família funcional
  const matrizRoteador =
    /\bmatriz\b|\broteador\b|\brouter\b|\brouting\b|\bvideohub\b|comuta[cç][aã]o|seletor(?:\s*\/|\s+e\s*|\s+de\s*)distribuidor|distribuidor(?:\s*\/|\s+e\s*|\s+de\s*)seletor|crosspoint/i.test(
      norm,
    )
  const switcherMesa = /\bswitcher\b|mesa\s*de\s*corte|video\s*mixer|\batem\b|\btricaster\b/i.test(
    norm,
  )
  const conversor = /\bconversor\b|\bconverter\b|updowncross/i.test(norm)
  const monitor = /\bmonitor\b|\bdisplay\b|\btela\b/.test(norm)
  const camera = /\bc[aâ]mera\b|\bfilmadora\b|\bcamcorder\b|\bptz\b/.test(norm)
  const fonte = /\bpower\s*supply\b|\bfonte\b|alimenta[cç][aã]o/.test(norm)

  return {
    capacidadeMatriz,
    padroesSdi: {
      sdi12g: has12g,
      sdi6g: has6g,
      sdi3g: has3g,
      sdiHd: hasHd,
      sdiGeral: hasSdiGeral || has12g || has6g || has3g || hasHd,
    },
    resolucoes: {
      res4k: has4k,
      res1080p: has1080p,
      res8k: has8k,
    },
    tipoEquipamento: {
      matrizRoteador,
      switcherMesa,
      conversor,
      monitor,
      camera,
      fonte,
    },
  }
}

/**
 * Mapa expandido de sinônimos técnicos e normalização de conceitos para Pro AV / Broadcast.
 * Vocabulários diferentes com mesmo significado técnico são mapeados para formas canônicas.
 */
function aplicarSinonimosTecnicos(texto: string): string {
  let s = normalize(texto)

  // 1. Equipamento de comutação / distribuição de vídeo
  // "matriz de vídeo", "roteador de vídeo", "video router", "routing switcher", "seletor e distribuidor de vídeo"
  s = s.replace(
    /seletor\s*(?:\/|\s+e\s+|\s+de\s*)\s*distribuidor(?:\s+de\s+video)?/g,
    ' matriz de video router ',
  )
  s = s.replace(
    /distribuidor\s*(?:\/|\s+e\s+|\s+de\s*)\s*seletor(?:\s+de\s+video)?/g,
    ' matriz de video router ',
  )
  s = s.replace(
    /matriz\s*(?:\/|\s+e\s*|\s+de\s*comutacao\s*de\s*|\s+de\s*)roteador/g,
    ' matriz router ',
  )
  s = s.replace(/roteador\s*(?:\/|\s+e\s*|\s+de\s*)matriz/g, ' matriz router ')
  s = s.replace(/routing\s+switcher/g, ' matriz router ')
  s = s.replace(/video\s+router/g, ' matriz router ')
  s = s.replace(/roteador\s+de\s+video/g, ' matriz router ')
  s = s.replace(/matriz\s+de\s+video/g, ' matriz router ')

  // 2. SDI / 12G / 4K
  // "12G-SDI" ↔ "12g sdi" ↔ "4k sdi"
  s = s.replace(/12g[- ]sdi/g, ' 12g sdi 4k ')
  s = s.replace(/4k[- ]sdi/g, ' 12g sdi 4k ')
  s = s.replace(/6g[- ]sdi/g, ' 6g sdi 4k ')
  s = s.replace(/3g[- ]sdi/g, ' 3g sdi 1080p ')
  s = s.replace(/hd[- ]sdi/g, ' hd sdi ')

  // 3. Resoluções equivalentes
  s = s.replace(/\bultra\s*hd\b/g, ' 4k ')
  s = s.replace(/\buhd\b/g, ' 4k ')
  s = s.replace(/\b2160p\b/g, ' 4k ')
  s = s.replace(/\bdci\s*4k\b/g, ' 4k ')
  s = s.replace(/\bfull\s*hd\b/g, ' 1080p ')
  s = s.replace(/\bfhd\b/g, ' 1080p ')

  // 4. Entradas / Saídas padronizadas
  s = s.replace(
    /(\d{1,3})\s*(?:entradas?|inputs?)\s*(?:e\s*)?(\d{1,3})\s*(?:sa[ií]das?|outputs?)/g,
    ' $1x$2 ',
  )
  s = s.replace(/(\d{1,3})\s*x\s*(\d{1,3})/g, ' $1x$2 ')

  return s
}

/**
 * Heurística rápida de NCM por palavras-chave técnicas de broadcast e AV.
 * Sempre usado como fallback determinístico e enriquecido pela IA quando OpenAI estiver disponível.
 */
function sugerirNcmHeuristico(
  descricao: string,
): { ncm: string; descricao: string; confianca: 'alta' | 'media' | 'baixa' } | null {
  const norm = normalize(descricao)
  if (
    norm.includes('matriz') ||
    norm.includes('videohub') ||
    norm.includes('roteador de video') ||
    norm.includes('routing switcher')
  ) {
    return {
      ncm: '85437039',
      descricao: 'Aparelhos elétricos com função própria - distribuidores e comutadores de vídeo',
      confianca: 'alta',
    }
  }
  if (
    norm.includes('fonte') ||
    norm.includes('power supply') ||
    norm.includes('adaptador ac') ||
    norm.includes('alimentacao')
  ) {
    return {
      ncm: '85044030',
      descricao: 'Fontes de alimentação chaveadas / conversores estáticos',
      confianca: 'alta',
    }
  }
  if (
    norm.includes('conversor') ||
    norm.includes('updowncross') ||
    norm.includes('sdi para hdmi') ||
    norm.includes('hdmi para sdi')
  ) {
    return {
      ncm: '85437099',
      descricao: 'Outras máquinas e aparelhos elétricos com função própria',
      confianca: 'media',
    }
  }
  if (
    norm.includes('switcher') ||
    norm.includes('mesa de corte') ||
    norm.includes('atem') ||
    norm.includes('misturador de video')
  ) {
    return {
      ncm: '85437099',
      descricao: 'Mesas comutadoras / misturadoras de vídeo broadcast',
      confianca: 'media',
    }
  }
  if (
    norm.includes('camera') ||
    norm.includes('filmadora') ||
    norm.includes('camcorder') ||
    norm.includes('ptz')
  ) {
    return {
      ncm: '85258921',
      descricao: 'Câmeras de televisão / captura de vídeo broadcast',
      confianca: 'alta',
    }
  }
  if (
    norm.includes('lente') ||
    norm.includes('teleobjetiva') ||
    norm.includes('objetiva') ||
    norm.includes('zoom')
  ) {
    return { ncm: '90021110', descricao: 'Objetivas para câmeras / projetores', confianca: 'alta' }
  }
  if (norm.includes('monitor') || norm.includes('display') || norm.includes('tela')) {
    return {
      ncm: '85285200',
      descricao: 'Monitores capazes de conexão com equipamentos de informática / vídeo',
      confianca: 'media',
    }
  }
  if (
    norm.includes('cabo') ||
    norm.includes('sdi 12g') ||
    norm.includes('bnc') ||
    norm.includes('patch cord')
  ) {
    return {
      ncm: '85444200',
      descricao: 'Condutores elétricos providos de peças de conexão',
      confianca: 'media',
    }
  }
  if (
    norm.includes('suporte') ||
    norm.includes('rack') ||
    norm.includes('adaptador rack') ||
    norm.includes('mounting')
  ) {
    return {
      ncm: '73269090',
      descricao: 'Outras obras de ferro ou aço para fixação / montagem em rack',
      confianca: 'baixa',
    }
  }
  if (norm.includes('software') || norm.includes('licenca') || norm.includes('firmware')) {
    return {
      ncm: '85234990',
      descricao: 'Suportes para gravação de som ou para gravações semelhantes / licença',
      confianca: 'baixa',
    }
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('PROJECT_URL') || ''
    const supabaseKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY') || ''

    const body = await req.json().catch(() => ({}))
    const { texto_tr, items_text, mode } = body

    // -------------------------------------------------------------------------
    // MODO "search_purpose": Pesquisa de produtos compatíveis com a finalidade do TR
    // -------------------------------------------------------------------------
    if (mode === 'search_purpose') {
      const { finalidade, trecho_tr } = body
      const finalidadeTexto = (finalidade || '').trim()
      const trechoTexto = (trecho_tr || '').trim()

      let produtosEncontrados: any[] = []

      if (openaiApiKey && (finalidadeTexto || trechoTexto)) {
        try {
          const promptBusca = `Você é um analista especialista em Termos de Referência de licitações públicas e equipamentos de áudio/vídeo/broadcast e TI.
O item do TR não teve marca/modelo identificada no catálogo prévio. O item é caracterizado pela seguinte FINALIDADE/OBJETIVO:
FINALIDADE: "${finalidadeTexto}"
TRECHO TR: "${trechoTexto.slice(0, 2000)}"

Indique de 2 a 4 produtos comerciais reais e consagrados do mercado profissional (ex: Blackmagic, Sony, Datavideo, AJA, etc.) que atendam à finalidade sem superdimensionamento.
Retorne EXCLUSIVAMENTE em JSON:
{
  "produtos": [
    {
      "nome": "Nome comercial completo",
      "marca": "Marca",
      "modelo": "Modelo/SKU",
      "descricao": "Resumo de compatibilidade com a finalidade",
      "ncm": "85258929",
      "peso_bruto_kg": 1.5,
      "preco_estimado_usd": 995,
      "justificativa": "Compatível com a finalidade exigida"
    }
  ]
}`
          const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openaiApiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'user', content: promptBusca }],
              temperature: 0.2,
              response_format: { type: 'json_object' },
            }),
          })
          if (aiRes.ok) {
            const aiData = await aiRes.json()
            const parsed = JSON.parse(aiData.choices?.[0]?.message?.content || '{}')
            if (Array.isArray(parsed.produtos)) {
              produtosEncontrados = parsed.produtos.map((p: any) => ({
                origem: 'tr_identificado',
                fonte_rotulo: `Pesquisa por Finalidade (${p.marca || 'Mercado'})`,
                nome: p.nome || `${p.marca || ''} ${p.modelo || ''}`.trim(),
                descricao: p.descricao || finalidadeTexto,
                sku: p.modelo || null,
                ncm: p.ncm ? String(p.ncm).replace(/\D/g, '').slice(0, 8) : null,
                peso_bruto_kg: typeof p.peso_bruto_kg === 'number' ? p.peso_bruto_kg : null,
                preco_custo: typeof p.preco_estimado_usd === 'number' ? p.preco_estimado_usd : null,
                moeda_custo: 'USD',
                fonte_custo: 'pesquisa_internet',
                aderencia_score: 1.0,
                aderencia_justificativa: p.justificativa || 'Compatível com a finalidade do TR',
                subitens: [],
              }))
            }
          }
        } catch (e) {
          console.warn('Erro ao pesquisar produtos por finalidade:', e)
        }
      }

      if (produtosEncontrados.length === 0) {
        produtosEncontrados.push({
          origem: 'tr_identificado',
          fonte_rotulo: 'Compatível com a Finalidade',
          nome: finalidadeTexto ? `Equipamento para ${finalidadeTexto.slice(0, 80)}` : 'Produto compatível com finalidade',
          descricao: finalidadeTexto || trechoTexto || 'Produto compatível com a finalidade descrita no TR',
          sku: null,
          ncm: null,
          peso_bruto_kg: null,
          preco_custo: null,
          moeda_custo: 'USD',
          fonte_custo: 'pesquisa_internet',
          aderencia_score: 1.0,
          aderencia_justificativa: 'Indicado com base na finalidade técnica',
          subitens: [],
        })
      }

      return new Response(
        JSON.stringify({
          success: true,
          finalidade: finalidadeTexto,
          produtos: produtosEncontrados,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // -------------------------------------------------------------------------
    // MODO "review": Revisão da IA sobre produto indicado manualmente vs TR
    // -------------------------------------------------------------------------
    if (mode === 'review') {
      const { item_tr_texto, item_tr_titulo, item_tr_specs, produto_indicado } = body

      const textoTRCompleto = [
        item_tr_titulo || '',
        item_tr_texto || '',
        Array.isArray(item_tr_specs) ? item_tr_specs.join('\n') : '',
      ]
        .filter(Boolean)
        .join('\n')
        .trim()

      const descricaoProduto = (
        produto_indicado?.description ||
        produto_indicado?.descricao ||
        ''
      ).trim()
      const skuProduto = (produto_indicado?.sku || '').trim()
      const ncmProduto = (produto_indicado?.ncm || '').trim()

      if (!textoTRCompleto || textoTRCompleto.length < 5) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Texto do Termo de Referência (TR) ausente para revisão.',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      if (!descricaoProduto && !skuProduto) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Descrição ou SKU do produto indicado é obrigatório para revisão.',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      // Executa revisão com OpenAI (ou fallback determinístico se offline/sem chave)
      const reviewResult = await revisarProdutoContraTR({
        openaiApiKey,
        textoTR: textoTRCompleto,
        specsMinimas: Array.isArray(item_tr_specs) ? item_tr_specs : [],
        produto: {
          description: descricaoProduto,
          sku: skuProduto,
          ncm: ncmProduto,
        },
      })

      const tempoExecucaoMs = Date.now() - startTime
      return new Response(
        JSON.stringify({
          success: true,
          tempo_execucao_ms: tempoExecucaoMs,
          review: reviewResult,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const textoEntrada: string = (texto_tr || items_text || '').trim()

    if (!textoEntrada || textoEntrada.length < 5) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Texto do Termo de Referência (TR) é obrigatório e deve conter descrição do produto.',
          sem_match: true,
          itens: [],
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 1. EXTRAÇÃO ESTRUTURADA VIA IA (OpenAI gpt-4o-mini com fallback determinístico)
    let itensExtraidos: ItemTRExtraido[] = []

    if (openaiApiKey) {
      try {
        const promptExtracao = `Você é um analista especialista em Termos de Referência (TR) de licitações públicas brasileiras (Lei 14.133/2021) e equipamentos profissionais de audiovisual/broadcast e TI.
Analise com máxima atenção o texto fornecido pelo usuário. O texto pode conter UM ou MÚLTIPLOS itens de TR colados juntos.

Para CADA item identificado no texto, extraia com precisão cirúrgica:
1. "numero_item": número do item no edital (ex.: "1", "1.1", "ITEM 1.1", ou null se não houver).
2. "titulo_item": título ou cabeçalho do item (ex.: "MATRIZ/ROTEADOR DE VÍDEO SDI 12G – 10 x 10").
3. "descricao_completa": síntese precisa da descrição técnica principal do equipamento ou serviço.
4. "finalidade": FINALIDADE / OBJETIVO / APLICAÇÃO de uso descrita no TR (ex.: "Comutação e roteamento matricial de sinais 12G-SDI em estúdio 4K", "Distribuição e amplificação de áudio balanceado em auditório", etc.). Sintetize a finalidade para qual o item se destina.
5. "quantidade": quantidade numérica total exigida no item (ex.: 4). Se o texto tiver extenso como "4 (quatro)", retorne 4. Se não estiver claro, retorne 1.
5. "unidade_fornecimento": unidade de fornecimento citada (ex.: "Unidade", "Peça", "Kit", "Conjunto"). Padrão "Unidade".
6. "codigo_catmat": código numérico do CATMAT/SIASG se citado (ex.: "150139"), ou null.
7. "catmat_descricao": descrição associada ao CATMAT (ex.: "Seletor / Distribuidor Vídeo"), ou null.
8. "referencia_marca_modelo": marca e/ou modelo citados como REFERÊNCIA.
   IMPORTANTE: Trate expressões como "ou similar ou de melhor qualidade", "ou equivalente", "ou de qualidade superior" APENAS como indicação de que se trata de uma marca/modelo de REFERÊNCIA. Extraia a marca e o modelo limpos (ex.: "Blackmagic Design – Blackmagic Videohub 10x10 12G").
9. "especificacoes_tecnicas_minimas": lista de strings com as especificações técnicas obrigatórias mais relevantes extraídas do texto (ex.: ["10 entradas 12G-SDI", "10 saídas 12G-SDI", "Painel frontal com botões e LCD", "Controle Ethernet", "Zero-latency"]).
10. "subitens_provaveis": lista de subitens, acessórios, fontes de alimentação, suportes para rack, cabos, softwares ou licenças citados explicitamente nas "Condições de fornecimento", "Acessórios inclusos" ou nas especificações técnicas.
    Para cada subitem extraia:
    - "descricao": nome/descrição clara do subitem (ex.: "Fonte de alimentação AC redundante 12V", "Suporte para fixação em rack 19 polegadas", "Software de controle e configuração").
    - "quantidade": quantidade numérica associada ao produto principal ou nula se indefinida.
    - "unidade": unidade de medida (ex.: "UN", "Kit", "Licença").
    - "indicio_declaracao_aduaneira": true se houver indício claro no texto de que o acessório é um bem físico autônomo importado separadamente que requer declaração aduaneira própria; false se for mero acessório embutido/gratuito na caixa; null se o texto não der base suficiente para inferir.
    - "justificativa_declaracao": breve justificativa da inferência de declaração aduaneira ou null.

REGRAS RÍGIDAS:
- NUNCA invente itens ou subitens que não tenham fundamento no texto.
- Se o texto contiver múltiplos itens (ex.: ITEM 1.1 e ITEM 1.2), retorne um elemento no array "itens" para CADA um.
- Responda EXCLUSIVAMENTE em JSON puro, sem comentários ou markdown fora do JSON:
{
  "itens": [
    {
      "numero_item": "1.1",
      "titulo_item": "MATRIZ/ROTEADOR DE VÍDEO SDI 12G – 10 x 10",
      "descricao_completa": "Matriz / roteador de vídeo SDI 12G 10x10 zero-latency",
      "finalidade": "Comutação e roteamento matricial de sinais SDI 12G em ambiente de produção broadcast 4K",
      "quantidade": 4,
      "unidade_fornecimento": "Unidade",
      "codigo_catmat": "150139",
      "catmat_descricao": "Seletor / Distribuidor Vídeo",
      "referencia_marca_modelo": "Blackmagic Design – Blackmagic Videohub 10x10 12G",
      "especificacoes_tecnicas_minimas": [
        "10 entradas 12G-SDI",
        "10 saídas 12G-SDI",
        "Zero-latency routing"
      ],
      "subitens_provaveis": [
        {
          "descricao": "Fonte de alimentação e cabo de força",
          "quantidade": 1,
          "unidade": "UN",
          "indicio_declaracao_aduaneira": null,
          "justificativa_declaracao": null
        }
      ]
    }
  ]
}

TEXTO DO TERMO DE REFERÊNCIA:
"""
${textoEntrada.slice(0, 40000)}
"""`

        const abortCtrl = new AbortController()
        const timeoutId = setTimeout(() => abortCtrl.abort(), 25000)

        const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: promptExtracao }],
            temperature: 0.1,
            response_format: { type: 'json_object' },
          }),
          signal: abortCtrl.signal,
        })
        clearTimeout(timeoutId)

        if (!openAiRes.ok) {
          throw new Error(`OpenAI HTTP ${openAiRes.status}: ${await openAiRes.text()}`)
        }

        const openAiData = await openAiRes.json()
        const content = openAiData.choices?.[0]?.message?.content || '{}'
        const parsed = JSON.parse(content)
        if (Array.isArray(parsed.itens) && parsed.itens.length > 0) {
          itensExtraidos = parsed.itens.map((it: any, idx: number) => ({
            numero_item: it.numero_item ? String(it.numero_item).trim() : `Item ${idx + 1}`,
            titulo_item: it.titulo_item ? String(it.titulo_item).trim() : null,
            descricao_completa: it.descricao_completa || it.titulo_item || `Item ${idx + 1}`,
            finalidade: it.finalidade ? String(it.finalidade).trim() : (it.titulo_item || it.descricao_completa || null),
            quantidade: typeof it.quantidade === 'number' && it.quantidade > 0 ? it.quantidade : 1,
            unidade_fornecimento: it.unidade_fornecimento || 'Unidade',
            codigo_catmat: it.codigo_catmat ? String(it.codigo_catmat).trim() : null,
            catmat_descricao: it.catmat_descricao ? String(it.catmat_descricao).trim() : null,
            referencia_marca_modelo: it.referencia_marca_modelo
              ? String(it.referencia_marca_modelo).trim()
              : null,
            especificacoes_tecnicas_minimas: Array.isArray(it.especificacoes_tecnicas_minimas)
              ? it.especificacoes_tecnicas_minimas.map(String)
              : [],
            subitens_provaveis: Array.isArray(it.subitens_provaveis)
              ? it.subitens_provaveis
                  .map((s: any) => ({
                    descricao: String(s.descricao || '').trim(),
                    quantidade: typeof s.quantidade === 'number' ? s.quantidade : null,
                    unidade: s.unidade ? String(s.unidade).trim() : null,
                    indicio_declaracao_aduaneira:
                      typeof s.indicio_declaracao_aduaneira === 'boolean'
                        ? s.indicio_declaracao_aduaneira
                        : null,
                    justificativa_declaracao: s.justificativa_declaracao
                      ? String(s.justificativa_declaracao).trim()
                      : null,
                  }))
                  .filter((s: SubitemProvavel) => s.descricao.length > 0)
              : [],
          }))
        }
      } catch (errAi) {
        console.warn(
          'Falha na extração de itens por IA (aplicando fallback determinístico):',
          errAi,
        )
      }
    }

    // Fallback determinístico caso o LLM não retorne nada ou não haja chave
    if (itensExtraidos.length === 0) {
      // Tenta regex por número de item
      const itemBlocks = textoEntrada
        .split(/(?=(?:^|\n)\s*(?:ITEM|LOTE)\s+\d+)/i)
        .filter((b) => b.trim().length > 10)
      if (itemBlocks.length > 1) {
        for (let i = 0; i < itemBlocks.length; i++) {
          const block = itemBlocks[i].trim()
          itensExtraidos.push(extrairItemDeterminístico(block, i + 1))
        }
      } else {
        itensExtraidos.push(extrairItemDeterminístico(textoEntrada, 1))
      }
    }

    if (itensExtraidos.length === 0) {
      const heur = sugerirNcmHeuristico(textoEntrada)
      return new Response(
        JSON.stringify({
          success: false,
          sem_match: true,
          mensagem:
            'Não foi possível extrair produtos ou itens estruturados a partir do texto informado.',
          ncm_sugerido_manual: heur,
          itens: [],
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 2. BUSCA DE PRODUTOS NO CATÁLOGO DO BANCO (imp_sim_products, products, supplier_quotes, subitems)
    // Coleta termos de busca para cada item e seus subitens
    const todasQueries: string[] = []
    for (const it of itensExtraidos) {
      if (it.referencia_marca_modelo) todasQueries.push(it.referencia_marca_modelo)
      if (it.codigo_catmat) todasQueries.push(it.codigo_catmat)
      if (it.titulo_item) todasQueries.push(it.titulo_item)
      if (it.descricao_completa) todasQueries.push(it.descricao_completa)
      for (const spec of it.especificacoes_tecnicas_minimas || []) {
        if (spec) todasQueries.push(spec)
      }
      for (const sub of it.subitens_provaveis) {
        if (sub.descricao) todasQueries.push(sub.descricao)
      }
    }

    // Carrega sinônimos de editais cadastrados
    const { data: sinonimosData } = await supabase
      .from('imp_sim_edital_sinonimos')
      .select('termo_edital, familia_tecnica, keywords')
    const sinonimos = sinonimosData || []

    // Coleta palavras-chave relevantes dos textos
    const keywordsSet = new Set<string>()
    for (const q of todasQueries) {
      const palavras = normalize(q)
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(
          (w) =>
            w.length >= 3 &&
            ![
              'item',
              'unidade',
              'para',
              'com',
              'sem',
              'dos',
              'das',
              'uma',
              'quatro',
              'qualidade',
              'melhor',
              'similar',
            ].includes(w),
        )
      for (const p of palavras) {
        keywordsSet.add(p)
      }
    }

    // Busca ampla no banco de imp_sim_products e products
    // Para performance e relevância, buscamos os termos principais (marca/modelo, CATMAT e palavras-chave fortes)
    // Coleta termos de busca para queries de banco:
    // Inclui marca/modelo, CATMAT, termos de capacidade (ex. 40x40, 20x20, 10x10), padrões (12g, 6g, 3g, sdi, 4k, router, matriz, switcher)
    const p0CatmatPrelimMod: string[] = []
    const p0CatmatPrelimSite: string[] = []

    for (const it of itensExtraidos) {
      if (it.codigo_catmat) {
        p0CatmatPrelimMod.push(`catmat.eq.${it.codigo_catmat}`)
        p0CatmatPrelimMod.push(`description.ilike.%${it.codigo_catmat}%`)
        p0CatmatPrelimSite.push(`description.ilike.%${it.codigo_catmat}%`)
      }
    }

    // -------------------------------------------------------------------------
    // CONSTRUÇÃO E PRIORIZAÇÃO CIRÚRGICA DOS FILTROS DE BUSCA NO BANCO
    // Ordem de prioridade estrita:
    // P1. CATMAT (coluna catmat e texto)
    // P2. Referência Marca/Modelo citados no TR
    // P3. Capacidade estruturada (extraída da IA, "N entradas e N saídas", NxM) -> name, sku, description
    // P4. Termos técnicos fortes de broadcast/pro av (12g, sdi, matriz, router, switcher, 4k, uhd, videohub, etc.)
    // P5. Demais palavras-chave após filtragem rigorosa de stopwords/termos genéricos de edital
    // -------------------------------------------------------------------------

    // Stopwords expandidas de termos genéricos comuns em editais/TRs que não devem ocupar filtros:
    const STOPWORDS_EDITAL = new Set<string>([
      'item',
      'lote',
      'unidade',
      'unidades',
      'para',
      'com',
      'sem',
      'dos',
      'das',
      'uma',
      'umas',
      'uns',
      'quatro',
      'cinco',
      'qualidade',
      'melhor',
      'similar',
      'equivalente',
      'possuir',
      'possua',
      'permitir',
      'permita',
      'permitindo',
      'equipamento',
      'equipamentos',
      'devera',
      'deverao',
      'deve',
      'devem',
      'alimentacao',
      'configuracao',
      'configuracoes',
      'fornecimento',
      'fornecer',
      'atender',
      'atendimento',
      'especificacao',
      'especificacoes',
      'minima',
      'minimas',
      'minimo',
      'minimos',
      'garantia',
      'meses',
      'conforme',
      'padrao',
      'padroes',
      'suporte',
      'operacao',
      'operar',
      'capacidade',
      'incluso',
      'inclusa',
      'inclusos',
      'inclusas',
      'acessorios',
      'geral',
      'total',
      'sistema',
      'sistemas',
    ])

    // Termos técnicos fortes prioritários (broadcast / Pro AV)
    const TERMOS_TECNICOS_FORTES = new Set<string>([
      '12g',
      '6g',
      '3g',
      'sdi',
      'matriz',
      'roteador',
      'router',
      'switcher',
      'videohub',
      'atem',
      '4k',
      'uhd',
      '2160p',
      '1080p',
      'crosspoint',
      'routing',
      'bmd',
      'blackmagic',
    ])

    const p1CatmatMod: string[] = []
    const p1CatmatSite: string[] = []

    const p2MarcaModeloMod: string[] = []
    const p2MarcaModeloSite: string[] = []

    const p3CapacidadeMod: string[] = []
    const p3CapacidadeSite: string[] = []

    const p4TermosFortesMod: string[] = []
    const p4TermosFortesSite: string[] = []

    const p5OutrosMod: string[] = []
    const p5OutrosSite: string[] = []

    // P1. CATMAT
    for (const it of itensExtraidos) {
      if (it.codigo_catmat) {
        const cat = cleanDigits(it.codigo_catmat)
        if (cat) {
          p1CatmatMod.push(`catmat.eq.${cat}`)
          p1CatmatMod.push(`description.ilike.%${cat}%`)
          p1CatmatSite.push(`description.ilike.%${cat}%`)
        }
      }
    }

    // P2. Referência Marca / Modelo do TR
    for (const it of itensExtraidos) {
      if (it.referencia_marca_modelo) {
        const refNorm = normalize(it.referencia_marca_modelo).replace(/[^a-z0-9\s]/g, ' ')
        const refTokens = refNorm
          .split(/\s+/)
          .filter((t) => t.length >= 3 && !STOPWORDS_EDITAL.has(t))
        for (const tk of refTokens) {
          p2MarcaModeloMod.push(`name.ilike.%${tk}%`)
          p2MarcaModeloMod.push(`sku.ilike.%${tk}%`)
          p2MarcaModeloSite.push(`name.ilike.%${tk}%`)
          p2MarcaModeloSite.push(`sku.ilike.%${tk}%`)
        }
      }
    }

    // P3. Capacidade extraída (estruturada da IA e normalização regex)
    const capacidadesDetectadas = new Set<string>()

    // Da IA e das especificações estruturadas:
    for (const it of itensExtraidos) {
      const textoCompletoItem = `${it.titulo_item || ''} ${it.descricao_completa || ''} ${it.especificacoes_tecnicas_minimas.join(' ')}`
      const cap = extrairCapacidadeEntradasSaidas(textoCompletoItem)
      if (cap) {
        capacidadesDetectadas.add(cap.texto) // ex: "40x40"
      }
    }

    // De todas as queries e especificações:
    for (const q of todasQueries) {
      const capNorm = normalizarTextoCapacidade(q)
      const capMatches = capNorm.match(/\b\d{1,3}x\d{1,3}\b/g)
      if (capMatches) {
        for (const c of capMatches) {
          capacidadesDetectadas.add(c.toLowerCase())
        }
      }
    }

    for (const cap of capacidadesDetectadas) {
      // Exemplo: 40x40
      p3CapacidadeMod.push(`name.ilike.%${cap}%`)
      p3CapacidadeMod.push(`sku.ilike.%${cap}%`)
      p3CapacidadeMod.push(`description.ilike.%${cap}%`)
      p3CapacidadeSite.push(`name.ilike.%${cap}%`)
      p3CapacidadeSite.push(`sku.ilike.%${cap}%`)
      p3CapacidadeSite.push(`description.ilike.%${cap}%`)

      // Variação compacta no SKU (ex: "4040" para VHUBSMAS12G04040 ou "04040")
      const [inPart, outPart] = cap.split('x')
      if (inPart && outPart) {
        const compactCap = `${inPart}${outPart}`
        p3CapacidadeMod.push(`sku.ilike.%${compactCap}%`)
        p3CapacidadeSite.push(`sku.ilike.%${compactCap}%`)
      }
    }

    // P4 e P5. Palavras-chave dos textos (separando fortes de gerais)
    for (const q of todasQueries) {
      const textoNormalizado = normalizarTextoCapacidade(q)
      const palavras = textoNormalizado
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !STOPWORDS_EDITAL.has(w))

      for (const p of palavras) {
        if (TERMOS_TECNICOS_FORTES.has(p)) {
          p4TermosFortesMod.push(`name.ilike.%${p}%`)
          p4TermosFortesMod.push(`sku.ilike.%${p}%`)
          p4TermosFortesSite.push(`name.ilike.%${p}%`)
          p4TermosFortesSite.push(`sku.ilike.%${p}%`)
        } else if (p.length >= 3) {
          p5OutrosMod.push(`name.ilike.%${p}%`)
          p5OutrosMod.push(`sku.ilike.%${p}%`)
          p5OutrosSite.push(`name.ilike.%${p}%`)
          p5OutrosSite.push(`sku.ilike.%${p}%`)
        }
      }
    }

    // Monta a lista consolidada deduplicada respeitando estritamente a prioridade P1 -> P2 -> P3 -> P4 -> P5
    function deduplicarFiltros(filtros: string[]): string[] {
      const vistos = new Set<string>()
      const res: string[] = []
      for (const f of filtros) {
        if (!vistos.has(f)) {
          vistos.add(f)
          res.push(f)
        }
      }
      return res
    }

    const todosFiltrosModOrdenados = deduplicarFiltros([
      ...p0CatmatPrelimMod,
      ...p1CatmatMod,
      ...p2MarcaModeloMod,
      ...p3CapacidadeMod,
      ...p4TermosFortesMod,
      ...p5OutrosMod,
    ])

    const todosFiltrosSiteOrdenados = deduplicarFiltros([
      ...p0CatmatPrelimSite,
      ...p1CatmatSite,
      ...p2MarcaModeloSite,
      ...p3CapacidadeSite,
      ...p4TermosFortesSite,
      ...p5OutrosSite,
    ])

    // Ampliação da janela de filtros para garantir que termos técnicos fortes não sejam cortados
    // (Aumentada de 30 para até 120 filtros)
    const LIMITE_FILTROS_OR = 120

    const orFiltersMod = todosFiltrosModOrdenados.slice(0, LIMITE_FILTROS_OR)
    const orFiltersSite = todosFiltrosSiteOrdenados.slice(0, LIMITE_FILTROS_OR)

    let modProductsRows: any[] = []
    let siteProductsRows: any[] = []

    if (orFiltersMod.length > 0 || orFiltersSite.length > 0) {
      const orClauseMod = orFiltersMod.join(',')
      const orClauseSite = orFiltersSite.join(',')
      const [modRes, siteRes] = await Promise.all([
        orClauseMod
          ? supabase
              .from('imp_sim_products')
              .select(`
                id,
                name,
                description,
                sku,
                catmat,
                ncm,
                weight,
                value,
                price_nationalized_cost,
                price_nationalized_currency,
                source_site_product_id,
                imp_sim_product_prices (
                  fob_value,
                  currency,
                  quote_date,
                  is_default,
                  valid_until,
                  imp_sim_suppliers (
                    name
                  )
                )
              `)
              .or(orClauseMod)
              .limit(100)
          : Promise.resolve({ data: [] as any[] }),
        orClauseSite
          ? supabase
              .from('products')
              .select(`
                id,
                name,
                description,
                sku,
                ncm,
                weight,
                price_cost,
                price_usd,
                image_url,
                technical_info
              `)
              .or(orClauseSite)
              .limit(100)
          : Promise.resolve({ data: [] as any[] }),
      ])

      modProductsRows = modRes.data || []
      siteProductsRows = siteRes.data || []
    }

    // Buscar cotações recentes de fornecedores para os produtos do módulo encontrados
    const modProductIds = modProductsRows.map((r) => r.id)
    const supplierQuotesMap = new Map<
      string,
      Array<{
        price: number
        currency: string
        quote_date: string | null
        supplier_name: string | null
      }>
    >()

    if (modProductIds.length > 0) {
      try {
        const { data: sqItems } = await supabase
          .from('imp_sim_supplier_quote_items')
          .select(`
            product_id,
            price,
            imp_sim_supplier_quotes (
              quote_date,
              currency,
              imp_sim_suppliers (
                name
              )
            )
          `)
          .in('product_id', modProductIds)

        if (sqItems) {
          for (const item of sqItems as any[]) {
            const pid = item.product_id
            const list = supplierQuotesMap.get(pid) || []
            const quote = item.imp_sim_supplier_quotes
            const pVal = Number(item.price ?? 0)
            if (pVal > 0) {
              list.push({
                price: pVal,
                currency: (quote?.currency || 'USD').toUpperCase(),
                quote_date: quote?.quote_date || null,
                supplier_name: quote?.imp_sim_suppliers?.name || null,
              })
              supplierQuotesMap.set(pid, list)
            }
          }
        }
      } catch (errSq) {
        console.warn('Erro ao carregar imp_sim_supplier_quote_items:', errSq)
      }
    }

    // Carregar subitens cadastrados para todos os produtos do módulo encontrados
    const subitemsMap = new Map<string, CandidatoSubitem[]>()
    if (modProductIds.length > 0) {
      try {
        const { data: subs } = await supabase
          .from('imp_sim_product_subitems')
          .select('*')
          .in('product_id', modProductIds)
          .order('sort_order', { ascending: true })

        if (subs) {
          for (const s of subs as any[]) {
            const list = subitemsMap.get(s.product_id) || []
            list.push({
              id: s.id,
              product_id: s.product_id,
              description: s.description,
              sku: s.sku || undefined,
              quantity: Number(s.quantity ?? 1),
              unit_gross_weight_kg:
                s.unit_gross_weight_kg != null ? Number(s.unit_gross_weight_kg) : null,
              unit_cost:
                s.unit_cost != null && Number(s.unit_cost) > 0 ? Number(s.unit_cost) : null,
              declared: Boolean(s.declared),
              ncm: s.ncm || null,
              sort_order: s.sort_order ?? 0,
            })
            subitemsMap.set(s.product_id, list)
          }
        }
      } catch (errSubs) {
        console.warn('Erro ao carregar imp_sim_product_subitems:', errSubs)
      }
    }

    // Monta o catálogo unificado com regras de preço e peso
    const catalogoUnificado: CandidatoProduto[] = consolidarCatalogo({
      modProducts: modProductsRows,
      siteProducts: siteProductsRows,
      supplierQuotesMap,
      subitemsMap,
    })

    // 3. CLASSIFICAÇÃO / SUGESTÃO DE NCM POR IA PARA O ITEM DO TR
    // Para cada item extraído, geramos sugestão de NCM (usando OpenAI se disponível, senão heurística)
    const sugestoesNcmMap = new Map<
      number,
      {
        ncm: string
        descricao?: string
        confianca: 'alta' | 'media' | 'baixa'
        justificativa?: string
      }
    >()

    if (openaiApiKey && itensExtraidos.length > 0) {
      try {
        const promptNcm = `Você é um perito aduaneiro e classificador fiscal especialista na Nomenclatura Comum do Mercosul (NCM) e TEC (Tarifa Externa Comum), especializado em equipamentos de áudio, vídeo profissional (Broadcast/Pro AV), informática e telecomunicações.
Classifique o NCM oficial mais apropriado (8 dígitos) para cada um dos itens abaixo:

${JSON.stringify(
  itensExtraidos.map((it, idx) => ({
    indice: idx,
    titulo: it.titulo_item,
    descricao: it.descricao_completa,
    marca_modelo: it.referencia_marca_modelo,
    catmat: it.codigo_catmat,
  })),
  null,
  2,
)}

Responda EXCLUSIVAMENTE em JSON puro:
{
  "sugestoes": [
    {
      "indice": 0,
      "ncm": "85437039",
      "descricao": "Distribuidores e comutadores de vídeo",
      "confianca": "alta",
      "justificativa": "Matriz/roteador de vídeo SDI comutador enquadra-se no NCM 8543.70.39"
    }
  ]
}`

        const abortNcmCtrl = new AbortController()
        const timeoutNcmId = setTimeout(() => abortNcmCtrl.abort(), 20000)

        const openAiNcmRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: promptNcm }],
            temperature: 0.0,
            response_format: { type: 'json_object' },
          }),
          signal: abortNcmCtrl.signal,
        })
        clearTimeout(timeoutNcmId)

        if (!openAiNcmRes.ok) {
          throw new Error(`OpenAI NCM HTTP ${openAiNcmRes.status}: ${await openAiNcmRes.text()}`)
        }

        const compNcmData = await openAiNcmRes.json()
        const contentNcm = compNcmData.choices?.[0]?.message?.content || '{}'
        const parsedNcm = JSON.parse(contentNcm)
        if (Array.isArray(parsedNcm.sugestoes)) {
          for (const s of parsedNcm.sugestoes) {
            const idx = Number(s.indice)
            const cleanNcm = cleanDigits(s.ncm)
            if (cleanNcm.length >= 8) {
              sugestoesNcmMap.set(idx, {
                ncm: cleanNcm,
                descricao: s.descricao || undefined,
                confianca: (s.confianca || 'media') as 'alta' | 'media' | 'baixa',
                justificativa: s.justificativa || undefined,
              })
            }
          }
        }
      } catch (errNcm) {
        console.warn('Falha na sugestão de NCM por IA:', errNcm)
      }
    }

    // Preenche com heurística determinística se a IA não retornou para algum item
    itensExtraidos.forEach((it, idx) => {
      if (!sugestoesNcmMap.has(idx)) {
        const h = sugerirNcmHeuristico(
          `${it.titulo_item || ''} ${it.descricao_completa} ${it.referencia_marca_modelo || ''}`,
        )
        if (h) {
          sugestoesNcmMap.set(idx, {
            ...h,
            justificativa: 'Classificação preliminar inferida por palavras-chave técnicas',
          })
        }
      }
    })

    // 4. RANKING E SELEÇÃO DE CANDIDATOS PARA CADA ITEM DO TR E SEUS SUBITENS
    // Regra do usuário (decisão de produto, permanente):
    // Exibir SOMENTE candidatos com aderência 100% ou ≥90%.
    // Produtos com aderência abaixo do piso NÃO podem aparecer no modal, nem como opções.
    // Sem match qualificado (≥90%), mostrar apenas o próprio TR e a entrada manual.
    // E SEMPRE incluir o produto identificado pelo TR como opção selecionável.
    const itensResultados: ItemTRMatchResultado[] = []

    for (let itemIdx = 0; itemIdx < itensExtraidos.length; itemIdx++) {
      const itemTr = itensExtraidos[itemIdx]
      const ncmSugeridoItem = sugestoesNcmMap.get(itemIdx) || null

      // Candidato do próprio TR (REGRA CRÍTICA: SEMPRE incluído como opção selecionável)
      const candidatoTrPrincipal: CandidatoProduto = {
        origem: 'tr_identificado',
        fonte_rotulo: 'Identificado no TR (novo/avulso)',
        id: undefined,
        source_site_product_id: null,
        nome: itemTr.titulo_item
          ? `${itemTr.titulo_item}${itemTr.referencia_marca_modelo ? ` (${itemTr.referencia_marca_modelo})` : ''}`
          : itemTr.descricao_completa.slice(0, 120),
        descricao: itemTr.descricao_completa,
        sku: itemTr.referencia_marca_modelo
          ? extrairModeloCurto(itemTr.referencia_marca_modelo)
          : null,
        catmat: itemTr.codigo_catmat || null,
        ncm: null, // Em branco conforme regra do usuário: "sem inventar valores"
        peso_bruto_kg: null, // Em branco
        preco_custo: null, // Em branco
        moeda_custo: null,
        fonte_custo: null,
        fornecedor_nome: null,
        data_cotacao: null,
        subitens: [],
        aderencia_score: 1.0, // É a fonte da verdade do texto
        aderencia_justificativa: 'Extraído diretamente do texto do Termo de Referência',
        ncm_sugerido_ia: ncmSugeridoItem,
      }

      // Busca e ranking no catálogo para o produto principal
      const candidatosBancoPrincipal = rankearCandidatos({
        termoBusca: `${itemTr.titulo_item || ''} ${itemTr.referencia_marca_modelo || ''} ${itemTr.descricao_completa}`,
        referenciaMarcaModelo: itemTr.referencia_marca_modelo || '',
        catmat: itemTr.codigo_catmat || '',
        specs: itemTr.especificacoes_tecnicas_minimas,
        catalogo: catalogoUnificado,
        sinonimos,
      })

      // Regra: piso de aderência ≥ 90% (0.90) para candidatos do banco
      const candidatosBancoPrincipalFiltrados = candidatosBancoPrincipal.filter(
        (c) => (c.aderencia_score >= 0.9 && c.aderencia_score <= 1.0) || c.aderencia_score >= 90,
      )

      const todosCandidatosPrincipal: CandidatoProduto[] = [
        candidatoTrPrincipal,
        ...candidatosBancoPrincipalFiltrados,
      ]

      // Subitens prováveis identificados no TR
      const subitensResultados: SubitemMatchResultado[] = []

      for (const sub of itemTr.subitens_provaveis) {
        const ncmHeurSub = sugerirNcmHeuristico(sub.descricao)

        const candidatoTrSub: CandidatoProduto = {
          origem: 'tr_identificado',
          fonte_rotulo: 'Identificado no TR (subitem)',
          id: undefined,
          nome: sub.descricao,
          descricao: sub.descricao,
          sku: null,
          catmat: null,
          ncm: null,
          peso_bruto_kg: null,
          preco_custo: null,
          moeda_custo: null,
          fonte_custo: null,
          subitens: [],
          aderencia_score: 1.0,
          aderencia_justificativa: 'Subitem/acessório citado no Termo de Referência',
          ncm_sugerido_ia: ncmHeurSub
            ? { ...ncmHeurSub, justificativa: 'Sugerido por palavras-chave do subitem' }
            : null,
        }

        const candidatosBancoSub = rankearCandidatos({
          termoBusca: sub.descricao,
          referenciaMarcaModelo: '',
          catmat: '',
          specs: [],
          catalogo: catalogoUnificado,
          sinonimos,
          scoreMinimo: 0.9,
        })

        const candidatosBancoSubFiltrados = candidatosBancoSub.filter(
          (c) => (c.aderencia_score >= 0.9 && c.aderencia_score <= 1.0) || c.aderencia_score >= 90,
        )

        subitensResultados.push({
          subitem_extraido: sub,
          candidato_tr: candidatoTrSub,
          candidatos_banco: candidatosBancoSubFiltrados,
          todos_candidatos: [candidatoTrSub, ...candidatosBancoSubFiltrados],
        })
      }

      itensResultados.push({
        item_tr: itemTr,
        candidato_tr_principal: candidatoTrPrincipal,
        candidatos_banco_principal: candidatosBancoPrincipalFiltrados,
        todos_candidatos_principal: todosCandidatosPrincipal,
        subitens_resultados: subitensResultados,
        tem_correlacao_cadastrada: candidatosBancoPrincipalFiltrados.length > 0,
        ncm_sugerido_ia: ncmSugeridoItem,
      })
    }

    const tempoExecucaoMs = Date.now() - startTime

    return new Response(
      JSON.stringify({
        success: true,
        sem_match: false,
        total_itens_extraidos: itensResultados.length,
        tempo_execucao_ms: tempoExecucaoMs,
        itens: itensResultados,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    console.error('Erro geral não tratado na edge function match-tr-item:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || 'Erro interno ao processar o Termo de Referência.',
        sem_match: true,
        itens: [],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

/**
 * Fallback determinístico de extração quando LLM não estiver disponível
 */
function extrairItemDeterminístico(texto: string, indicePadrao: number): ItemTRExtraido {
  let numeroItem = `Item ${indicePadrao}`
  const mNum = texto.match(/(?:ITEM|LOTE)\s*([0-9.]+)/i)
  if (mNum && mNum[1]) numeroItem = mNum[1]

  let tituloItem: string | null = null
  const mTit = texto.match(/(?:ITEM|LOTE)\s*[0-9.]+\s*[-–:]\s*([^\n\r/]{5,100})/i)
  if (mTit && mTit[1]) tituloItem = mTit[1].trim()

  let catmat: string | null = null
  let catmatDesc: string | null = null
  const mCat = texto.match(
    /(?:CATMAT|C[oó]digo\s*CATMAT)\s*[:\-–]?\s*(\d{4,8})(?:\s*[-–:]\s*([^\n\r/]{3,80}))?/i,
  )
  if (mCat) {
    catmat = mCat[1]
    if (mCat[2]) catmatDesc = mCat[2].trim()
  }

  let qtd = 1
  const mQtd = texto.match(/(?:quantidade|quant\.?|qtd\.?)\s*[:\-–]?\s*(\d+)/i)
  if (mQtd && mQtd[1]) {
    const q = parseInt(mQtd[1], 10)
    if (!isNaN(q) && q > 0) qtd = q
  }

  let unidade = 'Unidade'
  const mUn = texto.match(/(?:unidade\s*de\s*fornecimento|unidade)\s*[:\-–]?\s*([A-Za-zçãéíóú]+)/i)
  if (mUn && mUn[1]) unidade = mUn[1].trim()

  let refMarca: string | null = null
  const mRef = texto.match(
    /(?:refer[êe]ncia\s*(?:de\s*)?(?:marca\/modelo|marca|modelo)|marca\/modelo|marca\s*de\s*refer[êe]ncia)\s*[:\-–]\s*([^\n\r/]{3,120})/i,
  )
  if (mRef && mRef[1]) {
    refMarca = mRef[1]
      .replace(/\s*,?\s*(?:ou\s+similar|ou\s+de\s+melhor\s+qualidade|ou\s+equivalente).*$/i, '')
      .trim()
  }

  const subitens: SubitemProvavel[] = []
  if (/fonte|adaptador|alimenta[çc][ãa]o/i.test(texto)) {
    subitens.push({
      descricao: 'Fonte de alimentação AC e acessórios de energia',
      quantidade: 1,
      unidade: 'UN',
      indicio_declaracao_aduaneira: null,
    })
  }
  if (/suporte|rack/i.test(texto)) {
    subitens.push({
      descricao: 'Kit para montagem em rack 19 polegadas',
      quantidade: 1,
      unidade: 'UN',
      indicio_declaracao_aduaneira: null,
    })
  }

  return {
    numero_item: numeroItem,
    titulo_item: tituloItem || `Item ${indicePadrao}`,
    descricao_completa: texto.slice(0, 500).trim(),
    finalidade: tituloItem || texto.slice(0, 150).trim(),
    quantidade: qtd,
    unidade_fornecimento: unidade,
    codigo_catmat: catmat,
    catmat_descricao: catmatDesc,
    referencia_marca_modelo: refMarca,
    especificacoes_tecnicas_minimas: [],
    subitens_provaveis: subitens,
  }
}

function extrairModeloCurto(marcaModelo: string): string {
  const limpo = marcaModelo
    .replace(/Blackmagic Design|Sony|Panasonic|Canon|AJA|Datavideo|NewTek/gi, '')
    .trim()
  return limpo.replace(/^[-–\s]+/, '').trim() || marcaModelo
}

/**
 * Consolida produtos de imp_sim_products e products sem inventar valores.
 * Campos numéricos ausentes = null (nunca zero nem chute).
 */
function consolidarCatalogo({
  modProducts,
  siteProducts,
  supplierQuotesMap,
  subitemsMap,
}: {
  modProducts: any[]
  siteProducts: any[]
  supplierQuotesMap: Map<string, any[]>
  subitemsMap: Map<string, CandidatoSubitem[]>
}): CandidatoProduto[] {
  const mapaSite = new Map<string, any>()
  for (const s of siteProducts) {
    mapaSite.set(s.id, s)
  }

  const siteIdsUsados = new Set<string>()
  const consolidados: CandidatoProduto[] = []

  // 1. Processar produtos do módulo
  for (const mod of modProducts) {
    const siteLinked = mod.source_site_product_id
      ? mapaSite.get(mod.source_site_product_id)
      : undefined
    if (siteLinked) {
      siteIdsUsados.add(siteLinked.id)
    }

    // Identificar melhor preço de custo real cadastrado (sem inventar)
    let precoCusto: number | null = null
    let moedaCusto: string | null = null
    let fonteCusto:
      | 'preco_padrao'
      | 'cotacao_fornecedor'
      | 'custo_cadastrado'
      | 'site_cost'
      | null = null
    let fornecedorNome: string | null = null
    let dataCotacao: string | null = null

    // A) Orçamento de fornecedor recente em imp_sim_supplier_quote_items
    const sqList = supplierQuotesMap.get(mod.id) || []
    if (sqList.length > 0) {
      const sortedSq = [...sqList].sort((a, b) => {
        const dA = a.quote_date ? new Date(a.quote_date).getTime() : 0
        const dB = b.quote_date ? new Date(b.quote_date).getTime() : 0
        return dB - dA
      })
      const bestSq = sortedSq[0]
      if (bestSq && bestSq.price > 0) {
        precoCusto = bestSq.price
        moedaCusto = bestSq.currency
        fonteCusto = 'cotacao_fornecedor'
        fornecedorNome = bestSq.supplier_name
        dataCotacao = bestSq.quote_date
      }
    }

    // B) imp_sim_product_prices
    if (precoCusto == null) {
      const pPrices: any[] = mod.imp_sim_product_prices || []
      const defaultP = pPrices.find((p) => p.is_default && Number(p.fob_value) > 0)
      const anyP = pPrices.find((p) => Number(p.fob_value) > 0)
      const chosen = defaultP || anyP
      if (chosen) {
        precoCusto = Number(chosen.fob_value)
        moedaCusto = (chosen.currency || 'USD').toUpperCase()
        fonteCusto = 'preco_padrao'
        fornecedorNome = chosen.imp_sim_suppliers?.name || null
        dataCotacao = chosen.quote_date || null
      }
    }

    // C) price_nationalized_cost
    if (
      precoCusto == null &&
      mod.price_nationalized_cost != null &&
      Number(mod.price_nationalized_cost) > 0
    ) {
      precoCusto = Number(mod.price_nationalized_cost)
      moedaCusto = mod.price_nationalized_currency || 'BRL'
      fonteCusto = 'custo_cadastrado'
    }

    // D) value do produto
    if (precoCusto == null && mod.value != null && Number(mod.value) > 0) {
      precoCusto = Number(mod.value)
      moedaCusto = 'USD'
      fonteCusto = 'custo_cadastrado'
    }

    // E) Fallback para price_cost do site se vinculado
    if (
      precoCusto == null &&
      siteLinked &&
      siteLinked.price_cost != null &&
      Number(siteLinked.price_cost) > 0
    ) {
      precoCusto = Number(siteLinked.price_cost)
      moedaCusto = 'USD'
      fonteCusto = 'site_cost'
    }

    // Peso em kg
    let pesoKg: number | null = null
    if (siteLinked && siteLinked.weight != null && Number(siteLinked.weight) > 0) {
      pesoKg = Math.round(Number(siteLinked.weight) * LB_TO_KG * 1000) / 1000
    } else if (mod.weight != null && Number(mod.weight) > 0) {
      pesoKg = Number(mod.weight)
    }

    const ncmFinal = mod.ncm || (siteLinked ? siteLinked.ncm : null) || null
    const skuFinal = (siteLinked ? siteLinked.sku : null) || mod.sku || null

    const catmatFinal = mod.catmat || (siteLinked ? siteLinked.catmat || null : null) || null
    const descCombinada = [
      mod.description || '',
      siteLinked?.description || '',
      siteLinked?.technical_info || '',
    ]
      .filter(Boolean)
      .join('\n')

    consolidados.push({
      origem: siteLinked ? 'banco_ambos' : 'banco_modulo',
      fonte_rotulo: siteLinked ? 'Módulo de Simulação & Site' : 'Módulo de Simulação',
      id: mod.id,
      source_site_product_id: mod.source_site_product_id || (siteLinked ? siteLinked.id : null),
      nome: mod.name,
      descricao: descCombinada || mod.description || '',
      sku: skuFinal,
      catmat: catmatFinal,
      ncm: ncmFinal,
      peso_bruto_kg: pesoKg,
      preco_custo: precoCusto,
      moeda_custo: moedaCusto,
      fonte_custo: fonteCusto,
      fornecedor_nome: fornecedorNome,
      data_cotacao: dataCotacao,
      subitens: subitemsMap.get(mod.id) || [],
      aderencia_score: 0,
      aderencia_justificativa: '',
    })
  }

  // 2. Processar produtos do site não vinculados a módulo
  for (const site of siteProducts) {
    if (siteIdsUsados.has(site.id)) continue

    let precoCusto: number | null = null
    let moedaCusto: string | null = null
    let fonteCusto: 'site_cost' | null = null

    if (site.price_cost != null && Number(site.price_cost) > 0) {
      precoCusto = Number(site.price_cost)
      moedaCusto = 'USD'
      fonteCusto = 'site_cost'
    }

    let pesoKg: number | null = null
    if (site.weight != null && Number(site.weight) > 0) {
      pesoKg = Math.round(Number(site.weight) * LB_TO_KG * 1000) / 1000
    }

    const descSiteCompleta = [site.description || '', site.technical_info || '']
      .filter(Boolean)
      .join('\n')

    consolidados.push({
      origem: 'banco_site',
      fonte_rotulo: 'Catálogo do Site (My Way)',
      id: site.id,
      source_site_product_id: site.id,
      nome: site.name,
      descricao: descSiteCompleta,
      sku: site.sku || null,
      catmat: null,
      ncm: site.ncm || null,
      peso_bruto_kg: pesoKg,
      preco_custo: precoCusto,
      moeda_custo: moedaCusto,
      fonte_custo: fonteCusto,
      fornecedor_nome: null,
      data_cotacao: null,
      subitens: [],
      aderencia_score: 0,
      aderencia_justificativa: '',
    })
  }

  return consolidados
}

/**
 * Rankeia produtos do catálogo por aderência técnica, marca, modelo e sinônimos.
 * Regra do usuário: NÃO limitar a quantidade de matches. Todos que servirem são retornados.
 */
function rankearCandidatos({
  termoBusca,
  referenciaMarcaModelo,
  catmat,
  specs,
  catalogo,
  sinonimos,
  scoreMinimo = 0.9,
}: {
  termoBusca: string
  referenciaMarcaModelo: string
  catmat: string
  specs: string[]
  catalogo: CandidatoProduto[]
  sinonimos: Array<{ termo_edital: string; familia_tecnica: string; keywords: string[] }>
  scoreMinimo?: number
}): CandidatoProduto[] {
  const normBusca = normalize(termoBusca)
  const normRef = normalize(referenciaMarcaModelo)
  const canonRefSku = cleanSku(referenciaMarcaModelo)

  // Texto de busca com sinônimos técnicos canônicos aplicados
  const buscaComSinonimos = aplicarSinonimosTecnicos(
    `${termoBusca} ${referenciaMarcaModelo} ${specs.join(' ')}`,
  )

  // Extrair atributos técnicos estruturados da demanda do TR
  const attrsTr = extrairAtributosTecnicos(
    `${termoBusca} ${referenciaMarcaModelo} ${specs.join(' ')}`,
  )

  // Tokenização normalizada de busca
  const tokensBuscaComSinonimos = buscaComSinonimos
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 3 &&
        ![
          'item',
          'unidade',
          'para',
          'com',
          'sem',
          'dos',
          'das',
          'uma',
          'quatro',
          'qualidade',
          'melhor',
          'similar',
        ].includes(w),
    )

  // Identificar famílias técnicas via tabela de sinônimos do banco
  const familiasIdentificadas = new Set<string>()
  for (const sin of sinonimos) {
    const sTermo = normalize(sin.termo_edital)
    if (sTermo && normBusca.includes(sTermo)) {
      familiasIdentificadas.add(normalize(sin.familia_tecnica))
    }
    for (const kw of sin.keywords || []) {
      const kwNorm = normalize(kw)
      if (kwNorm.length >= 3 && normBusca.includes(kwNorm)) {
        familiasIdentificadas.add(normalize(sin.familia_tecnica))
      }
    }
  }

  const resultadosComScore: Array<{
    produto: CandidatoProduto
    score: number
    justificativa: string
  }> = []

  const cleanCatmatTr = cleanDigits(catmat)

  for (const prod of catalogo) {
    const prodNameNorm = normalize(prod.nome)
    const prodDescNorm = normalize(prod.descricao)
    const prodSkuNorm = prod.sku ? normalize(prod.sku) : ''
    const prodCanonSku = prod.sku ? cleanSku(prod.sku) : ''

    // Texto consolidado do produto com sinônimos aplicados
    const prodTextoConsolidado = `${prod.nome} ${prod.descricao} ${prod.sku || ''}`
    const prodTextoComSinonimos = aplicarSinonimosTecnicos(prodTextoConsolidado)

    // Atributos técnicos do produto no cadastro
    const attrsProd = extrairAtributosTecnicos(prodTextoConsolidado)

    let score = 0
    const justificativas: string[] = []

    // ---------------------------------------------------------------------------------
    // PILAR 1: SKU / MODELO TEXTUAL EXPLÍCITO (quando houver referência no TR)
    // ---------------------------------------------------------------------------------
    if (
      canonRefSku &&
      prodCanonSku &&
      (prodCanonSku.includes(canonRefSku) || canonRefSku.includes(prodCanonSku))
    ) {
      score += 0.55
      justificativas.push(`Código de modelo correspondente (${prod.sku})`)
    }

    if (normRef && normRef.length >= 4) {
      if (prodNameNorm.includes(normRef) || normRef.includes(prodNameNorm)) {
        score += 0.45
        justificativas.push('Marca e modelo idênticos à referência')
      } else {
        const tokensRef = normRef.split(/\s+/).filter((t) => t.length >= 4)
        const matchTokens = tokensRef.filter((t) => prodNameNorm.includes(t))
        if (tokensRef.length > 0 && matchTokens.length >= 2) {
          const ratio = matchTokens.length / tokensRef.length
          score += 0.35 * ratio
          justificativas.push(`Compatibilidade de modelo (${matchTokens.join(', ')})`)
        }
      }
    }

    // ---------------------------------------------------------------------------------
    // PILAR 2: CHAVE DIRETA DE MATCH POR CATMAT
    // Se o produto cadastrado tiver o mesmo CATMAT do TR (coluna catmat ou no texto)
    // ---------------------------------------------------------------------------------
    let matchCatmatDireto = false
    if (cleanCatmatTr && cleanCatmatTr.length >= 4) {
      const prodCatmatLimpo = cleanDigits(prod.catmat)
      if (prodCatmatLimpo === cleanCatmatTr) {
        matchCatmatDireto = true
      } else if (
        prodDescNorm.includes(cleanCatmatTr) ||
        prodNameNorm.includes(cleanCatmatTr) ||
        (prod.sku && prod.sku.includes(cleanCatmatTr))
      ) {
        matchCatmatDireto = true
      }
    }

    if (matchCatmatDireto) {
      // Reforço substancial: CATMAT é a chave oficial de compras públicas
      score += 0.4
      justificativas.push(`CATMAT ${cleanCatmatTr} correspondente no cadastro`)
    }

    // ---------------------------------------------------------------------------------
    // PILAR 3: COMPARAÇÃO ESTRUTURADA DE ATRIBUTOS TÉCNICOS
    // (capacidade NxM, padrão SDI 12G/6G/3G/HD, resolução 4K/UHD/1080p, família)
    // REGRA DE NEGÓCIO CRÍTICA DO USUÁRIO (LICITAÇÃO / PREGÃO):
    // A capacidade do candidato deve bater EXATAMENTE com a exigida no TR.
    // NUNCA sugerir produto de capacidade SUPERIOR (no pregão o preço decide; equipamento
    // maior inviabiliza a competitividade financeira). Ex: para TR 40x40, Matriz 224x224 (NEXX)
    // ou 80x80 NUNCA deve ser sugerida nem cruzar o piso de 90%.
    // Capacidade inferior continua igualmente barrada.
    // ---------------------------------------------------------------------------------
    let capacidadeCompativel = false
    let capacidadeIncompativel = false
    let capacidadeSuperior = false
    let capacidadeInferior = false

    if (attrsTr.capacidadeMatriz) {
      if (attrsProd.capacidadeMatriz) {
        if (
          attrsProd.capacidadeMatriz.entradas === attrsTr.capacidadeMatriz.entradas &&
          attrsProd.capacidadeMatriz.saidas === attrsTr.capacidadeMatriz.saidas
        ) {
          capacidadeCompativel = true
          score += 0.35
          justificativas.push(`Capacidade idêntica (${attrsProd.capacidadeMatriz.texto})`)
        } else if (
          attrsProd.capacidadeMatriz.entradas > attrsTr.capacidadeMatriz.entradas ||
          attrsProd.capacidadeMatriz.saidas > attrsTr.capacidadeMatriz.saidas
        ) {
          // CAPACIDADE SUPERIOR: BARRADA terminantemente para pregão
          capacidadeIncompativel = true
          capacidadeSuperior = true
          score -= 0.6
          justificativas.push(
            `Capacidade superior (${attrsProd.capacidadeMatriz.texto} > ${attrsTr.capacidadeMatriz.texto}): barrada para competitividade em pregão`,
          )
        } else {
          // CAPACIDADE INFERIOR: BARRADA
          capacidadeIncompativel = true
          capacidadeInferior = true
          score -= 0.6
          justificativas.push(
            `Capacidade inferior (${attrsProd.capacidadeMatriz.texto} < ${attrsTr.capacidadeMatriz.texto}): não atende o piso mínimo`,
          )
        }
      } else {
        // TR pediu capacidade explícita e o produto não tem menção direta em attrsProd.capacidadeMatriz.
        // Checar se o SKU contém a capacidade exata (ex: VHUBSMAS12G04040 contém 4040 ou 04040).
        const capStr = attrsTr.capacidadeMatriz.texto.replace('x', '')
        const inStr = String(attrsTr.capacidadeMatriz.entradas)
        const outStr = String(attrsTr.capacidadeMatriz.saidas)

        // Também verificar se o SKU ou descrição tem menção a capacidade superior (ex: 224x224, 80x80, 224x)
        const capProdOutra = extrairCapacidadeEntradasSaidas(prodTextoConsolidado)
        if (capProdOutra) {
          if (
            capProdOutra.entradas === attrsTr.capacidadeMatriz.entradas &&
            capProdOutra.saidas === attrsTr.capacidadeMatriz.saidas
          ) {
            capacidadeCompativel = true
            score += 0.35
            justificativas.push(`Capacidade idêntica identificada (${capProdOutra.texto})`)
          } else if (
            capProdOutra.entradas > attrsTr.capacidadeMatriz.entradas ||
            capProdOutra.saidas > attrsTr.capacidadeMatriz.saidas
          ) {
            capacidadeIncompativel = true
            capacidadeSuperior = true
            score -= 0.6
            justificativas.push(
              `Capacidade superior (${capProdOutra.texto} > ${attrsTr.capacidadeMatriz.texto}): barrada para competitividade em pregão`,
            )
          } else {
            capacidadeIncompativel = true
            capacidadeInferior = true
            score -= 0.6
            justificativas.push(
              `Capacidade inferior (${capProdOutra.texto} < ${attrsTr.capacidadeMatriz.texto})`,
            )
          }
        } else if (
          prodCanonSku.includes(capStr) ||
          prodCanonSku.includes(`0${inStr}0${outStr}`) ||
          prodCanonSku.includes(`${inStr}${outStr}`)
        ) {
          capacidadeCompativel = true
          score += 0.3
          justificativas.push(
            `Capacidade identificada no código (${attrsTr.capacidadeMatriz.texto})`,
          )
        }
      }
    }

    // Compatibilidade de padrão de sinal (12G-SDI / 6G-SDI / 3G-SDI / HD-SDI)
    let sinalCompativel = false
    if (attrsTr.padroesSdi.sdi12g) {
      if (attrsProd.padroesSdi.sdi12g) {
        sinalCompativel = true
        score += 0.25
        justificativas.push('Padrão 12G-SDI plenamente atendido')
      } else if (attrsProd.padroesSdi.sdi6g || attrsProd.padroesSdi.sdi3g) {
        // Padrão inferior ao exigido
        score -= 0.3
        justificativas.push('Padrão de sinal inferior ao 12G-SDI exigido')
      }
    } else if (attrsTr.padroesSdi.sdi6g) {
      if (attrsProd.padroesSdi.sdi6g || attrsProd.padroesSdi.sdi12g) {
        sinalCompativel = true
        score += 0.2
        justificativas.push('Padrão 6G/12G-SDI compatível')
      }
    } else if (attrsTr.padroesSdi.sdi3g) {
      if (attrsProd.padroesSdi.sdi3g || attrsProd.padroesSdi.sdi6g || attrsProd.padroesSdi.sdi12g) {
        sinalCompativel = true
        score += 0.2
        justificativas.push('Padrão 3G-SDI compatível')
      }
    } else if (attrsTr.padroesSdi.sdiGeral) {
      if (attrsProd.padroesSdi.sdiGeral) {
        sinalCompativel = true
        score += 0.15
        justificativas.push('Interface SDI compatível')
      }
    }

    // Compatibilidade de Resolução (4K / UHD / 2160p)
    let resolucaoCompativel = false
    if (attrsTr.resolucoes.res4k) {
      if (attrsProd.resolucoes.res4k) {
        resolucaoCompativel = true
        score += 0.2
        justificativas.push('Suporte à resolução 4K/Ultra HD')
      } else {
        // Se pediu 4K e o produto é comprovadamente só 1080p
        if (
          attrsProd.padroesSdi.sdi3g &&
          !attrsProd.padroesSdi.sdi12g &&
          !attrsProd.padroesSdi.sdi6g
        ) {
          score -= 0.25
          justificativas.push('Resolução incompatível (exigido 4K/UHD, produto 1080p)')
        }
      }
    }

    // Compatibilidade funcional da família (matriz/roteador vs switcher vs outros)
    let tipoCompativel = false
    if (attrsTr.tipoEquipamento.matrizRoteador) {
      if (attrsProd.tipoEquipamento.matrizRoteador) {
        tipoCompativel = true
        score += 0.25
        justificativas.push('Tipo funcional correspondente (matriz/roteador de vídeo)')
      } else if (attrsProd.tipoEquipamento.camera || attrsProd.tipoEquipamento.monitor) {
        // Equipamento de categoria totalmente diferente
        score -= 0.5
        justificativas.push('Tipo de equipamento incompatível')
      }
    }

    // Família técnica via sinônimos do banco
    for (const fam of familiasIdentificadas) {
      if (prodTextoComSinonimos.includes(fam)) {
        score += 0.15
        justificativas.push(`Categoria técnica compatível (${fam})`)
        break
      }
    }

    // ---------------------------------------------------------------------------------
    // PILAR 4: ADERÊNCIA A ESPECIFICAÇÕES TÉCNICAS MÍNIMAS (com sinônimos aplicados)
    // ---------------------------------------------------------------------------------
    let specsAtendidas = 0
    for (const spec of specs) {
      const specCanon = aplicarSinonimosTecnicos(spec)
      const tokensSpec = specCanon
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 4)
      if (tokensSpec.length > 0 && tokensSpec.some((t) => prodTextoComSinonimos.includes(t))) {
        specsAtendidas++
      }
    }
    if (specs.length > 0 && specsAtendidas > 0) {
      const ratio = specsAtendidas / specs.length
      score += 0.2 * ratio
      justificativas.push(`Atende a ${specsAtendidas} especificação(ões) técnica(s)`)
    }

    // ---------------------------------------------------------------------------------
    // PILAR 5: MATCH TEXTUAL COM SINÔNIMOS TÉCNICOS
    // ---------------------------------------------------------------------------------
    if (tokensBuscaComSinonimos.length > 0) {
      const matchedTokens = tokensBuscaComSinonimos.filter((tk) =>
        prodTextoComSinonimos.includes(tk),
      )
      if (matchedTokens.length > 0) {
        const ratio = matchedTokens.length / tokensBuscaComSinonimos.length
        score += 0.15 * Math.min(ratio, 1.0)
      }
    }

    // Bônus sinérgico: quando todos os atributos técnicos principais (capacidade + sinal + resolução + tipo)
    // batem exatamente, o produto deve cruzar com segurança o piso de 90%, mesmo sem modelo textual!
    if (
      attrsTr.capacidadeMatriz &&
      capacidadeCompativel &&
      attrsTr.padroesSdi.sdi12g &&
      sinalCompativel &&
      attrsTr.tipoEquipamento.matrizRoteador &&
      tipoCompativel &&
      !capacidadeIncompativel
    ) {
      score = Math.max(score, 0.94)
      justificativas.push(
        `Alinhamento técnico integral dos atributos essenciais (${attrsTr.capacidadeMatriz.texto} 12G-SDI 4K)`,
      )
    }

    // Se o CATMAT bater com os atributos do equipamento, reforço garantido acima do piso
    if (matchCatmatDireto && tipoCompativel && !capacidadeIncompativel) {
      score = Math.max(score, 0.92)
    }

    // Se a capacidade for comprovadamente incompatível (ex.: 80x80 ou 224x224 quando pediu 40x40),
    // o produto NUNCA pode ultrapassar 50% e NUNCA cruza o piso de 90%.
    // Capacidade superior é terminantemente barrada em pregão por inviabilizar o preço da proposta.
    if (capacidadeSuperior) {
      score = Math.min(score, 0.4)
    } else if (capacidadeInferior || capacidadeIncompativel) {
      score = Math.min(score, 0.5)
    }

    const finalScore = Math.max(0, Math.min(Math.round(score * 100) / 100, 1.0))

    if (finalScore >= scoreMinimo) {
      resultadosComScore.push({
        produto: {
          ...prod,
          aderencia_score: finalScore,
          aderencia_justificativa:
            justificativas.join('; ') || 'Correspondência técnica com as especificações do TR',
        },
        score: finalScore,
        justificativa: justificativas.join('; '),
      })
    }
  }

  // Ordenar decrescente por score de aderência
  return resultadosComScore.sort((a, b) => b.score - a.score).map((r) => r.produto)
}

/**
 * Interface do item de divergência/aderência da revisão da IA
 */
interface DivergenciaItemReview {
  requisito: string
  tipo: 'diverge' | 'nao_comprovado'
  detalhe: string
}

interface ReviewResultData {
  aderencia_score: number // escala 0-1 (ex: 0.95 ou 0.70)
  aderencia_percentual: number // escala 0-100 (ex: 95 ou 70)
  atende_piso: boolean // score >= 0.90 (>=90%)
  resumo_parecer: string
  divergencias: DivergenciaItemReview[]
  pontos_atendidos?: string[]
}

/**
 * Executa a revisão técnica da IA comparando o produto indicado manualmente
 * contra o texto e especificações do TR.
 * Distinção OBRIGATÓRIA:
 * - "diverge": o produto indica expressamente que NÃO atende ao requisito (ex.: 1080p quando TR pediu 4K; 20x20 quando pediu 40x40)
 * - "nao_comprovado": o requisito não está explicitamente descrito no produto informado
 * A IA NÃO PODE inventar conformidade.
 */
async function revisarProdutoContraTR({
  openaiApiKey,
  textoTR,
  specsMinimas,
  produto,
}: {
  openaiApiKey: string
  textoTR: string
  specsMinimas: string[]
  produto: {
    description: string
    sku?: string
    ncm?: string
  }
}): Promise<ReviewResultData> {
  if (openaiApiKey) {
    try {
      const promptReview = `Você é um perito técnico e auditor de licitações públicas (Lei 14.133/2021) especialista em análise de conformidade de propostas de produtos audiovisuais/broadcast e informática.

Sua tarefa é REVISAR o produto indicado manualmente pelo usuário contra o Termo de Referência (TR).

TERMO DE REFERÊNCIA (TR):
"""
${textoTR.slice(0, 15000)}
"""

ESPECIFICAÇÕES MÍNIMAS DO TR (se extraídas):
${specsMinimas.length > 0 ? specsMinimas.map((s, i) => `${i + 1}. ${s}`).join('\n') : '(ver texto integral do TR)'}

PRODUTO INDICADO PELO USUÁRIO:
- Descrição: "${produto.description}"
- SKU / Modelo: "${produto.sku || '(não informado)'}"
- NCM: "${produto.ncm || '(não informado)'}"

INSTRUÇÕES RIGOROSAS DE AUDITORIA:
1. Compare ponto a ponto o produto indicado contra os requisitos e especificações mínimas do TR.
2. Percentual de aderência (0 a 100):
   - 100%: atende plenamente e expressamente todos os requisitos essenciais do TR.
   - 90% a 99%: aderência substancial confirmada, eventuais omissões são apenas detalhes secundários que não desclassificam.
   - Abaixo de 90%: há divergência explícita OU ausência crítica de comprovação de requisitos essenciais de modo que não é seguro garantir conformidade.
3. LISTA DE DIVERGÊNCIAS (item a item):
   Para CADA ponto que não estiver 100% comprovado como atendido, classifique com RIGOR no campo "tipo":
   - "diverge": quando o produto indica que NÃO atende ao requisito (ex.: equipamento com capacidade diferente, formato incompatível, tecnologia inferior, ausência manifesta).
   - "nao_comprovado": quando o requisito NÃO está descrito ou comprovado no cadastro/descrição do produto informado (a IA NÃO pode inventar conformidade).
4. A IA NÃO PODE INVENTAR CONFORMIDADE: se um dado técnico essencial não constar na descrição/SKU do produto, deve ser classificado como "nao_comprovado".
5. Resuma em 1 ou 2 frases o parecer técnico da IA.

Responda EXCLUSIVAMENTE em JSON puro, sem formatação markdown fora do JSON:
{
  "aderencia_percentual": 95,
  "resumo_parecer": "O equipamento indicado atende às principais exigências técnicas do TR...",
  "divergencias": [
    {
      "requisito": "Display LCD frontal para monitoramento",
      "tipo": "nao_comprovado",
      "detalhe": "A descrição informada não menciona a presença de display LCD frontal integrado."
    },
    {
      "requisito": "Resolução 4K DCI a 60 fps",
      "tipo": "diverge",
      "detalhe": "O modelo indicado opera no máximo em 1080p, divergindo do padrão 4K exigido no TR."
    }
  ],
  "pontos_atendidos": [
    "Capacidade 40x40 atendida",
    "Padrão 12G-SDI atendido"
  ]
}`

      const abortCtrl = new AbortController()
      const timeoutId = setTimeout(() => abortCtrl.abort(), 25000)

      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: promptReview }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
        signal: abortCtrl.signal,
      })
      clearTimeout(timeoutId)

      if (openAiRes.ok) {
        const data = await openAiRes.json()
        const content = data.choices?.[0]?.message?.content || '{}'
        const parsed = JSON.parse(content)

        let pct = Number(parsed.aderencia_percentual ?? 0)
        if (isNaN(pct) || pct < 0) pct = 0
        if (pct > 100) pct = 100

        const divergenciasRaw = Array.isArray(parsed.divergencias) ? parsed.divergencias : []
        const divergencias: DivergenciaItemReview[] = divergenciasRaw.map((d: any) => ({
          requisito: String(d.requisito || '').trim() || 'Especificação do TR',
          tipo: d.tipo === 'diverge' ? 'diverge' : 'nao_comprovado',
          detalhe: String(d.detalhe || '').trim(),
        }))

        const pontosAtendidos: string[] = Array.isArray(parsed.pontos_atendidos)
          ? parsed.pontos_atendidos.map(String).filter((s) => s.trim().length > 0)
          : []

        return {
          aderencia_score: Math.round((pct / 100) * 100) / 100,
          aderencia_percentual: Math.round(pct),
          atende_piso: pct >= 90,
          resumo_parecer:
            String(parsed.resumo_parecer || '').trim() ||
            (pct >= 90
              ? 'Produto indicado com aderência técnica confirmada em relação ao TR.'
              : 'Produto indicado com divergências ou especificações não comprovadas pelo cadastro.'),
          divergencias,
          pontos_atendidos: pontosAtendidos,
        }
      }
    } catch (errAi) {
      console.warn('Falha na chamada OpenAI de revisão de produto contra TR:', errAi)
    }
  }

  // Fallback determinístico caso OpenAI não esteja disponível ou ocorra falha de rede
  return revisarProdutoDeterminístico({ textoTR, specsMinimas, produto })
}

/**
 * Fallback determinístico que analisa tokens, capacidades e padrões de sinal
 */
function revisarProdutoDeterminístico({
  textoTR,
  specsMinimas,
  produto,
}: {
  textoTR: string
  specsMinimas: string[]
  produto: {
    description: string
    sku?: string
    ncm?: string
  }
}): ReviewResultData {
  const prodTexto = `${produto.description} ${produto.sku || ''}`
  const attrsTr = extrairAtributosTecnicos(textoTR)
  const attrsProd = extrairAtributosTecnicos(prodTexto)

  const divergencias: DivergenciaItemReview[] = []
  const pontosAtendidos: string[] = []

  let totalPontos = 0
  let pontosGanhos = 0

  // 1. Capacidade
  if (attrsTr.capacidadeMatriz) {
    totalPontos += 35
    if (attrsProd.capacidadeMatriz) {
      if (
        attrsProd.capacidadeMatriz.entradas === attrsTr.capacidadeMatriz.entradas &&
        attrsProd.capacidadeMatriz.saidas === attrsTr.capacidadeMatriz.saidas
      ) {
        pontosGanhos += 35
        pontosAtendidos.push(`Capacidade ${attrsTr.capacidadeMatriz.texto} atendida`)
      } else {
        divergencias.push({
          requisito: `Capacidade ${attrsTr.capacidadeMatriz.texto}`,
          tipo: 'diverge',
          detalhe: `Capacidade indicada (${attrsProd.capacidadeMatriz.texto}) diverge da exigida (${attrsTr.capacidadeMatriz.texto}).`,
        })
      }
    } else {
      divergencias.push({
        requisito: `Capacidade ${attrsTr.capacidadeMatriz.texto}`,
        tipo: 'nao_comprovado',
        detalhe: `A capacidade ${attrsTr.capacidadeMatriz.texto} não está comprovada na descrição informada.`,
      })
    }
  }

  // 2. Padrão 12G / SDI
  if (attrsTr.padroesSdi.sdi12g) {
    totalPontos += 25
    if (attrsProd.padroesSdi.sdi12g) {
      pontosGanhos += 25
      pontosAtendidos.push('Padrão 12G-SDI atendido')
    } else if (attrsProd.padroesSdi.sdi3g || attrsProd.padroesSdi.sdi6g) {
      divergencias.push({
        requisito: 'Padrão 12G-SDI',
        tipo: 'diverge',
        detalhe: 'Equipamento opera em padrão inferior (3G/6G-SDI), divergindo do 12G exigido.',
      })
    } else {
      divergencias.push({
        requisito: 'Padrão 12G-SDI',
        tipo: 'nao_comprovado',
        detalhe: 'Suporte a 12G-SDI não comprovado no texto do produto.',
      })
    }
  }

  // 3. Resolução 4K
  if (attrsTr.resolucoes.res4k) {
    totalPontos += 20
    if (attrsProd.resolucoes.res4k) {
      pontosGanhos += 20
      pontosAtendidos.push('Resolução 4K/Ultra HD atendida')
    } else {
      divergencias.push({
        requisito: 'Resolução 4K / Ultra HD',
        tipo: 'nao_comprovado',
        detalhe: 'Compatibilidade com 4K não comprovada pelo cadastro do produto.',
      })
    }
  }

  // 4. Especificações mínimas do TR
  for (const spec of specsMinimas.slice(0, 5)) {
    totalPontos += 10
    const specNorm = normalize(spec)
    const tokens = specNorm
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !['para', 'com', 'sem', 'deve', 'possuir'].includes(w))
    const prodNorm = normalize(prodTexto)
    const matchCount = tokens.filter((t) => prodNorm.includes(t)).length
    if (tokens.length > 0 && matchCount >= Math.ceil(tokens.length * 0.6)) {
      pontosGanhos += 10
      pontosAtendidos.push(spec)
    } else {
      divergencias.push({
        requisito: spec,
        tipo: 'nao_comprovado',
        detalhe: `Requisito não localizado expressamente na descrição informada.`,
      })
    }
  }

  if (totalPontos === 0) {
    totalPontos = 100
    pontosGanhos = 90
  }

  const pct = Math.max(0, Math.min(100, Math.round((pontosGanhos / totalPontos) * 100)))

  return {
    aderencia_score: pct / 100,
    aderencia_percentual: pct,
    atende_piso: pct >= 90,
    resumo_parecer:
      pct >= 90
        ? 'Produto atende às especificações essenciais analisadas.'
        : 'Identificadas divergências ou ausência de comprovação de requisitos técnicos mínimos.',
    divergencias,
    pontos_atendidos: pontosAtendidos,
  }
}
