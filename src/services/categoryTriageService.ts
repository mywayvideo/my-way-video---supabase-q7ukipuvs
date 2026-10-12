import { supabase } from '@/lib/supabase/client'

export interface CategoryItem {
  id: string
  name: string
  description?: string | null
  acceptable_ncms?: string[] | null
  is_active?: boolean | null
  created_at?: string
  product_count?: number
  legacy_pending_count?: number
}

export interface CategoryProductItem {
  id: string
  name: string
  sku: string | null
  ncm: string | null
  category: string | null
  category_id: string | null
  manufacturer_id: string | null
  image_url: string | null
  price_usd: number | null
  price_brl: number | null
  stock: number | null
  created_at: string
  updated_at: string
  last_reviewed_at: string
  manufacturer?: {
    id: string
    name: string
  } | null
}

export interface SuggestionConfidence {
  level: 'high' | 'medium'
  categoryName: string
  categoryId?: string
  reason: string
}

/**
 * Normaliza NCM para dígitos puros para comparação de prefixo
 */
export function normalizeNcmDigits(ncm?: string | null): string {
  if (!ncm) return ''
  return ncm.replace(/\D/g, '')
}

/**
 * Valida se um valor de NCM/prefixo é 4, 6 ou 8 dígitos
 */
export function isValidNcmPrefix(value: string): boolean {
  const digits = normalizeNcmDigits(value)
  return digits.length === 4 || digits.length === 6 || digits.length === 8
}

/**
 * Formata um prefixo ou código NCM para exibição
 * 4 dígitos -> 9002
 * 6 dígitos -> 9002.11
 * 8 dígitos -> 9002.11.90
 */
export function formatNcmPrefixDisplay(val: string): string {
  const digits = normalizeNcmDigits(val)
  if (digits.length === 4) return digits
  if (digits.length === 6) return `${digits.slice(0, 4)}.${digits.slice(4, 6)}`
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
  }
  return val
}

/**
 * Retorna hint descritiva para a entrada de prefixo NCM:
 * Ex: "8543.70 cobre subitens como 8543.70.35 e 8543.70.99 (prefixo de 6 dígitos)"
 */
export function getNcmPrefixHint(input: string): string {
  const digits = normalizeNcmDigits(input)
  if (!digits) return 'Insira 4, 6 ou 8 dígitos (ex: 9002, 8543.70 ou 8543.70.35)'
  if (digits.length === 4) {
    return `Prefixo de 4 dígitos: cobre toda a posição ${digits} (ex: ${digits}.xx.xx)`
  }
  if (digits.length === 6) {
    return `Prefixo de 6 dígitos: cobre a subposição ${digits.slice(0, 4)}.${digits.slice(4, 6)} (ex: ${digits.slice(0, 4)}.${digits.slice(4, 6)}.xx)`
  }
  if (digits.length === 8) {
    return `Código completo de 8 dígitos: casa exatamente com ${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
  }
  return `Tamanho atual: ${digits.length} dígitos. Permitido apenas 4, 6 ou 8 dígitos.`
}

/**
 * Verifica se o NCM do produto casa com a lista de NCMs aceitáveis da categoria.
 * Retorna true se bater com QUALQUER prefixo.
 * Se o produto NÃO tem NCM, não é considerado "fora do padrão" (neutro).
 * Se a categoria não tem acceptable_ncms definidos ou lista vazia, retorna true (neutro).
 */
export function isNcmMatchingCategory(
  productNcm: string | null | undefined,
  acceptableNcms: string[] | null | undefined,
): boolean {
  if (!productNcm) return true // Sem NCM -> neutro
  if (!acceptableNcms || acceptableNcms.length === 0) return true // Categoria sem restrição -> neutro

  const productDigits = normalizeNcmDigits(productNcm)
  if (!productDigits) return true

  return acceptableNcms.some((prefix) => {
    const prefixDigits = normalizeNcmDigits(prefix)
    if (!prefixDigits) return false
    return productDigits.startsWith(prefixDigits)
  })
}

/**
 * Determina se o badge "NCM fora do padrão" deve ser exibido.
 * Retorna true SE E SOMENTE SE o produto TEM NCM, a categoria tem NCMs aceitáveis,
 * e o NCM do produto NÃO casa com nenhum prefixo.
 */
export function isNcmOutOfCategoryStandard(
  productNcm: string | null | undefined,
  acceptableNcms: string[] | null | undefined,
): boolean {
  if (!productNcm) return false
  if (!acceptableNcms || acceptableNcms.length === 0) return false
  return !isNcmMatchingCategory(productNcm, acceptableNcms)
}

/**
 * DICIONÁRIO CAMADA 1: Rótulos legados exatos -> Nome Canônico da Categoria
 * (Normalizado em minúsculas sem pontuação extra)
 */
export const LEGACY_EXACT_MAP: Record<string, string> = {
  // Lenses
  lenses: 'Lenses',
  'lentes prime': 'Lenses',
  'lentes zoom standard': 'Lenses',
  'lentes zoom wide': 'Lenses',
  'lentes ultra-wide prime': 'Lenses',
  'lentes macro': 'Lenses',
  'lentes zoom aps-c': 'Lenses',
  'lentes wide prime': 'Lenses',
  'lentes prime aps-c': 'Lenses',
  'lentes zoom ultra-wide': 'Lenses',
  'lentes teleobjetiva prime': 'Lenses',
  'lentes teleobjetiva zoom': 'Lenses',
  'lentes wide aps-c': 'Lenses',
  'lentes super teleobjetiva zoom': 'Lenses',
  'lentes zoom all-in-one': 'Lenses',
  'lentes ultra-wide': 'Lenses',
  'lentes macro aps-c': 'Lenses',
  'lentes zoom compacta': 'Lenses',
  teleconverters: 'Lenses',
  'lenses & accessories': 'Lenses',

  // Cameras
  cameras: 'Cameras',
  'câmeras mirrorles': 'Cameras',
  'mirrorless camera': 'Cameras',
  'mirrorless cameras': 'Cameras',
  'ptz camera': 'Cameras',
  'dslr camera': 'Cameras',
  'video cameras': 'Cameras',
  'video cameras > dslr camera': 'Cameras',
  'video cameras > digital cine camera': 'Cameras',

  // Converters
  converter: 'Converters',
  conversores: 'Converters',
  'ip converter': 'Converters',
  'gate scanner cintel': 'Converters',
  'scanner de filme 4k/8k': 'Converters',

  // Accessories
  accessory: 'Accessories',
  acessório: 'Accessories',
  'camera accessories': 'Accessories',
  'broadcast accessories': 'Accessories',
  'video cameras > camera accessories': 'Accessories',
  cable: 'Accessories',
  cabo: 'Accessories',
  adapter: 'Accessories',
  power: 'Accessories',
  'video cameras > camera accessories > batteries and power': 'Accessories',
  'leitor audio/keykode cintel': 'Accessories',
  'kit limpeza filme cintel': 'Accessories',

  // Batteries
  battery: 'Batteries',

  // Audio
  'audio console': 'Audio',
  'audio interface': 'Audio',
  'audio mixing and management': 'Audio',
  'monitor de áudio': 'Audio',

  // Networking & Storage
  'cloud storage': 'Networking & Storage',
  'armazenamento em rede': 'Networking & Storage',
  storage: 'Networking & Storage',
  router: 'Networking & Storage',
  'switch de rede': 'Networking & Storage',

  // Media
  'media > memory cards > sxs memory card': 'Media',
  'media &gt; memory cards &gt; sxs memory card': 'Media',
  'media > memory cards > cfexpress a': 'Media',
  'media > memory cards > cfexpress b': 'Media',
  'media > memory cards > sdhc / sdxc': 'Media',
  'media > memory cards > sdxc': 'Media',
  'media > memory cards > xqd memory card': 'Media',
  'media > axs memory': 'Media',

  // Monitors
  'monitor 4k': 'Monitors',
  'monitores duplos': 'Monitors',
  'monitores com scopes': 'Monitors',
  'multivisor 4k': 'Monitors',
  'multivisor hd': 'Monitors',

  // Streaming / Switchers
  switcher: 'Streaming',
  switchers: 'Streaming',
  keyer: 'Streaming',
  'control panel': 'Streaming',
  controller: 'Streaming',

  // Desktop Video
  'capture card': 'Desktop Video',
  interface: 'Desktop Video',

  // Recorders
  recorder: 'Recorders',
  gravador: 'Recorders',
  'gravador 4k': 'Recorders',
  'monitor/gravador': 'Recorders',
  'monitor/gravador hdr': 'Recorders',

  // Software
  software: 'Software',
}

/**
 * Calcula a sugestão automática em 2 camadas:
 * Camada 1 (Alta Confiança): Dicionário exato de rótulos legados
 * Camada 2 (Média Confiança): Palavras-chave no nome/descrição + NCM típico
 */
export function getProductCategorySuggestion(
  product: {
    name?: string | null
    description?: string | null
    category?: string | null
    ncm?: string | null
  },
  categoriesByName: Map<string, CategoryItem>,
): SuggestionConfidence | null {
  const legacyRaw = (product.category || '').trim()
  const legacyLower = legacyRaw.toLowerCase()

  // 1. Regras explícitas Cintel
  const prodNameLower = (product.name || '').toLowerCase()
  if (prodNameLower.includes('cintel')) {
    if (prodNameLower.includes('scanner') || prodNameLower.includes('gate')) {
      const cat = categoriesByName.get('Converters')
      return {
        level: 'high',
        categoryName: 'Converters',
        categoryId: cat?.id,
        reason: 'Produto Cintel (Scanner/Gate) direcionado para Converters conforme especificação',
      }
    }
    if (
      prodNameLower.includes('audio and keykode') ||
      prodNameLower.includes('roller kit') ||
      prodNameLower.includes('cleaning')
    ) {
      const cat = categoriesByName.get('Accessories')
      return {
        level: 'high',
        categoryName: 'Accessories',
        categoryId: cat?.id,
        reason:
          'Produto Cintel (Leitor/Kit Limpeza) direcionado para Accessories conforme especificação',
      }
    }
  }

  // 2. Camada 1: Dicionário de rótulo exato (Alta Confiança)
  if (legacyLower && LEGACY_EXACT_MAP[legacyLower]) {
    const targetName = LEGACY_EXACT_MAP[legacyLower]
    const cat = categoriesByName.get(targetName)
    return {
      level: 'high',
      categoryName: targetName,
      categoryId: cat?.id,
      reason: `Rótulo legado exato "${legacyRaw}" mapeado para ${targetName}`,
    }
  }

  // 3. Camada 2: Palavras-chave no nome/descrição + NCM típico (Média Confiança)
  const fullText = `${product.name || ''} ${product.description || ''}`.toLowerCase()
  const ncmDigits = normalizeNcmDigits(product.ncm)

  // Prioridade 1 Camada 2: Audio
  if (
    ncmDigits.startsWith('8518') ||
    ncmDigits.startsWith('8519') ||
    fullText.includes('microphone') ||
    fullText.includes('microfone') ||
    fullText.includes('headphone') ||
    fullText.includes('fones de ouvido') ||
    fullText.includes('audio mixer') ||
    fullText.includes('console de audio')
  ) {
    const cat = categoriesByName.get('Audio')
    return {
      level: 'medium',
      categoryName: 'Audio',
      categoryId: cat?.id,
      reason: 'Termos de áudio / NCM 8518/8519 identificados',
    }
  }

  // Networking & Storage
  if (
    fullText.includes('cloud store') ||
    fullText.includes('cloud storage') ||
    fullText.includes('nas storage') ||
    fullText.includes('ethernet switch') ||
    fullText.includes('10gbe') ||
    fullText.includes('switch de rede') ||
    fullText.includes('network router') ||
    (ncmDigits.startsWith('847170') && (fullText.includes('storage') || fullText.includes('drive')))
  ) {
    const cat = categoriesByName.get('Networking & Storage')
    return {
      level: 'medium',
      categoryName: 'Networking & Storage',
      categoryId: cat?.id,
      reason: 'Termos de rede/storage / NCM 8471.70 identificados',
    }
  }

  // Lenses
  if (
    ncmDigits.startsWith('9002') ||
    fullText.includes('lens') ||
    fullText.includes('lente') ||
    fullText.includes('teleconverter')
  ) {
    const cat = categoriesByName.get('Lenses')
    return {
      level: 'medium',
      categoryName: 'Lenses',
      categoryId: cat?.id,
      reason: 'NCM 9002 ou termos de lentes/óptica',
    }
  }

  // Monitors
  if (
    ncmDigits.startsWith('8528') ||
    fullText.includes('monitor') ||
    fullText.includes('display') ||
    fullText.includes('smartview') ||
    fullText.includes('multiview')
  ) {
    const cat = categoriesByName.get('Monitors')
    return {
      level: 'medium',
      categoryName: 'Monitors',
      categoryId: cat?.id,
      reason: 'NCM 8528 ou termos de monitor/display',
    }
  }

  // Cameras
  if (
    ncmDigits.startsWith('8525') ||
    fullText.includes('camera') ||
    fullText.includes('câmera') ||
    fullText.includes('camcorder') ||
    fullText.includes('cinema camera')
  ) {
    const cat = categoriesByName.get('Cameras')
    return {
      level: 'medium',
      categoryName: 'Cameras',
      categoryId: cat?.id,
      reason: 'NCM 8525 ou termos de câmera/filmagem',
    }
  }

  // Converters
  if (
    fullText.includes('converter') ||
    fullText.includes('conversor') ||
    fullText.includes('mini converter') ||
    fullText.includes('micro converter') ||
    fullText.includes('updowncross') ||
    fullText.includes('sdi to hdmi') ||
    fullText.includes('hdmi to sdi')
  ) {
    const cat = categoriesByName.get('Converters')
    return {
      level: 'medium',
      categoryName: 'Converters',
      categoryId: cat?.id,
      reason: 'Termos de conversão de sinal de vídeo',
    }
  }

  // Streaming / Switchers
  if (
    fullText.includes('switcher') ||
    fullText.includes('atem') ||
    fullText.includes('streaming') ||
    fullText.includes('web presenter') ||
    fullText.includes('live stream')
  ) {
    const cat = categoriesByName.get('Streaming')
    return {
      level: 'medium',
      categoryName: 'Streaming',
      categoryId: cat?.id,
      reason: 'Termos de switcher / streaming ATEM',
    }
  }

  // Desktop Video
  if (
    fullText.includes('decklink') ||
    fullText.includes('ultrastudio') ||
    fullText.includes('capture') ||
    fullText.includes('placa de captura')
  ) {
    const cat = categoriesByName.get('Desktop Video')
    return {
      level: 'medium',
      categoryName: 'Desktop Video',
      categoryId: cat?.id,
      reason: 'Termos de placas de captura Desktop Video (DeckLink/UltraStudio)',
    }
  }

  // Media
  if (
    ncmDigits.startsWith('8523') ||
    fullText.includes('memory card') ||
    fullText.includes('cartão de memória') ||
    fullText.includes('cfexpress') ||
    fullText.includes('sd card') ||
    fullText.includes('sxs card')
  ) {
    const cat = categoriesByName.get('Media')
    return {
      level: 'medium',
      categoryName: 'Media',
      categoryId: cat?.id,
      reason: 'NCM 8523 ou termos de mídia/cartões de memória',
    }
  }

  // Batteries
  if (
    ncmDigits.startsWith('8507') ||
    fullText.includes('bateria') ||
    fullText.includes('battery pack') ||
    fullText.includes('v-mount') ||
    fullText.includes('gold mount')
  ) {
    const cat = categoriesByName.get('Batteries')
    return {
      level: 'medium',
      categoryName: 'Batteries',
      categoryId: cat?.id,
      reason: 'NCM 8507 ou termos de bateria/alimentação',
    }
  }

  // Recorders
  if (
    ncmDigits.startsWith('8521') ||
    fullText.includes('hyperdeck') ||
    fullText.includes('gravador') ||
    fullText.includes('video recorder')
  ) {
    const cat = categoriesByName.get('Recorders')
    return {
      level: 'medium',
      categoryName: 'Recorders',
      categoryId: cat?.id,
      reason: 'NCM 8521 ou termos de gravador/HyperDeck',
    }
  }

  // Software
  if (
    fullText.includes('davinci resolve') ||
    fullText.includes('studio license') ||
    fullText.includes('software activation') ||
    fullText.includes('licença de software')
  ) {
    const cat = categoriesByName.get('Software')
    return {
      level: 'medium',
      categoryName: 'Software',
      categoryId: cat?.id,
      reason: 'Termos de licença/software',
    }
  }

  // Teleprompters
  if (fullText.includes('teleprompter') || fullText.includes('prompter')) {
    const cat = categoriesByName.get('Teleprompters')
    return {
      level: 'medium',
      categoryName: 'Teleprompters',
      categoryId: cat?.id,
      reason: 'Termos de teleprompter',
    }
  }

  // Tripods & Rigs
  if (
    ncmDigits.startsWith('9620') ||
    fullText.includes('tripod') ||
    fullText.includes('tripé') ||
    fullText.includes('monopod') ||
    fullText.includes('rig') ||
    fullText.includes('dolly')
  ) {
    const cat = categoriesByName.get('Tripods & Rigs')
    return {
      level: 'medium',
      categoryName: 'Tripods & Rigs',
      categoryId: cat?.id,
      reason: 'NCM 9620 ou termos de tripé/rig',
    }
  }

  // Accessories (Fallback genérico com termos)
  if (
    fullText.includes('cable') ||
    fullText.includes('cabo') ||
    fullText.includes('case') ||
    fullText.includes('mount') ||
    fullText.includes('power supply') ||
    fullText.includes('adapter') ||
    fullText.includes('adaptador')
  ) {
    const cat = categoriesByName.get('Accessories')
    return {
      level: 'medium',
      categoryName: 'Accessories',
      categoryId: cat?.id,
      reason: 'Termos de cabo/suporte/adaptador/acessório',
    }
  }

  return null
}
