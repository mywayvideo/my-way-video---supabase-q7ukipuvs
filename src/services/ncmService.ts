/**
 * Autocomplete de NCM — camada de serviço (v2, otimizada).
 *
 * Fluxo de busca:
 * 1. RPC única `search_ncm_autocomplete` no servidor (prefixo do código + descrição,
 *    com ranking, unaccent e LIMIT no servidor) — cacheada em memória por sessão;
 * 2. Fallback TEMPORÁRIO (uma única query PostgREST simples por prefixo de código) caso a RPC
 *    ainda não tenha sido aplicada no banco (o usuário roda a migration manualmente no painel).
 *    NÃO existe mais fallback à RPC pesada search_ncm_candidates (embeddings) no autocomplete.
 *
 * A validação de NCM digitado manualmente continua via `validateNcmExists` (com cache),
 * usada pelo NcmAutocompleteField e pelo submit do useProductForm.
 */
import { supabase } from '@/lib/supabase/client'

export interface NcmCandidate {
  tax_rate_id: string
  ncm: string
  ex: string
  ncm_descricao: string
  ncm_descricao_full?: string
  ex_descricao: string | null
  source_text: string
  ii_rate: number
  ipi_rate: number
  pis_rate: number
  cofins_rate: number
  has_ex_tarifario: boolean
  vector_score: number
  text_score: number
  combined_score: number
}
export interface SearchNcmParams {
  query: string
  queryEmbedding?: number[] | string | null
  topN?: number
  matchThreshold?: number
  generateEmbeddingIfMissing?: boolean
}

export interface NcmClassificationLogPayload {
  input_description: string
  agent_suggestion?: Record<string, unknown> | null
  final_choice_ncm?: string | null
  final_choice_ex?: string | null
  confirmed_by?: string | null
  status?: 'pendente' | 'aceito' | 'rejeitado' | 'manual'
  product_id?: string | null
  imp_sim_product_id?: string | null
  audit_links?: unknown[]
  knowledge_base_version?: string
  execution_time_ms?: number | null
}

export interface UpdateNcmLogDecisionParams {
  auditId: string
  finalChoiceNcm: string
  finalChoiceEx?: string
  confirmedBy?: string | null
  status?: 'aceito' | 'rejeitado' | 'manual'
}

/**
 * Gera o embedding de uma consulta de texto via edge function `index-ncm-embeddings` (modo action: 'embed')
 * para nunca expor a chave OPENAI_API_KEY no cliente.
 */
export async function generateQueryEmbedding(text: string): Promise<number[] | null> {
  const clean = text.trim()
  if (!clean) return null

  try {
    const { data, error } = await supabase.functions.invoke('index-ncm-embeddings', {
      body: {
        action: 'embed',
        text: clean,
      },
    })

    if (error || !data || !Array.isArray(data.embedding)) {
      console.warn('Não foi possível gerar embedding da query via edge function:', error || data)
      return null
    }

    return data.embedding as number[]
  } catch (err) {
    console.warn('Erro ao chamar edge function de embedding:', err)
    return null
  }
}

/**
 * Busca candidatos NCM na base imp_sim_tax_rates via RPC search_ncm_candidates.
 * Suporta busca híbrida completa (com query_embedding) ou fallback textual automático.
 * A busca abrange TODA a tabela imp_sim_tax_rates (capítulos 84, 85, 90 etc.), sem restrição de capítulo.
 *
 * NOTE: usada pelo fluxo de classificação IA (NcmSuggestDialog/classify-ncm),
 * NÃO pelo autocomplete do formulário de produto.
 */
export async function searchNcmCandidates(params: SearchNcmParams): Promise<NcmCandidate[]> {
  const query = params.query?.trim() || ''
  if (!query) return []

  let vectorParam: string | null = null

  if (params.queryEmbedding) {
    if (typeof params.queryEmbedding === 'string') {
      vectorParam = params.queryEmbedding
    } else if (Array.isArray(params.queryEmbedding)) {
      vectorParam = `[${params.queryEmbedding.join(',')}]`
    }
  } else if (params.generateEmbeddingIfMissing) {
    const generated = await generateQueryEmbedding(query)
    if (generated && generated.length > 0) {
      vectorParam = `[${generated.join(',')}]`
    }
  }

  const rpcArgs: {
    query: string
    query_embedding?: string
    top_n?: number
    match_threshold?: number
  } = {
    query,
    top_n: params.topN ?? 15,
    match_threshold: params.matchThreshold ?? 0.05,
  }

  if (vectorParam) {
    rpcArgs.query_embedding = vectorParam
  }

  const { data, error } = await supabase.rpc('search_ncm_candidates', rpcArgs)

  if (error) {
    console.error('Erro na RPC search_ncm_candidates:', error)
    throw error
  }

  return (data || []) as NcmCandidate[]
}

/**
 * Registra uma sugestão ou decisão no log de auditoria de classificação NCM (imp_sim_ncm_classification_log).
 */
export async function logNcmClassification(payload: NcmClassificationLogPayload) {
  const { data, error } = await supabase
    .from('imp_sim_ncm_classification_log')
    .insert({
      input_description: payload.input_description,
      agent_suggestion: (payload.agent_suggestion ?? {}) as any,
      final_choice_ncm: payload.final_choice_ncm ?? null,
      final_choice_ex: payload.final_choice_ex ?? '',
      confirmed_by: payload.confirmed_by ?? null,
      status: payload.status ?? 'pendente',
      product_id: payload.product_id ?? null,
      imp_sim_product_id: payload.imp_sim_product_id ?? null,
      audit_links: (payload.audit_links ?? []) as any,
      knowledge_base_version: payload.knowledge_base_version ?? '1.0',
      execution_time_ms: payload.execution_time_ms ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('Erro ao gravar imp_sim_ncm_classification_log:', error)
    throw error
  }

  return data
}

/**
 * Atualiza o registro de log de auditoria com a decisão final do usuário (botão 'Aplicar')
 */
export async function updateNcmClassificationDecision(params: UpdateNcmLogDecisionParams) {
  if (!params.auditId) {
    console.warn('updateNcmClassificationDecision: auditId não fornecido.')
    return null
  }

  const { data, error } = await supabase
    .from('imp_sim_ncm_classification_log')
    .update({
      final_choice_ncm: params.finalChoiceNcm,
      final_choice_ex: params.finalChoiceEx || '',
      confirmed_by: params.confirmedBy ?? null,
      status: params.status || 'aceito',
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.auditId)
    .select()
    .maybeSingle()

  if (error) {
    console.error('Erro ao atualizar decisão no imp_sim_ncm_classification_log:', error)
    // Não lançamos erro fatal para não travar a aplicação da decisão na UI
    return null
  }

  return data
}

export interface CurrentNcmTaxInfo {
  ii: number | null
  ipi: number | null
  pis?: number | null
  cofins?: number | null
  total_tax: number | null
  has_ex_tarifario?: boolean
  description?: string | null
}

export interface CurrentNcmAssessment {
  current_ncm: string
  current_ex?: string
  verdict: 'MANTER' | 'CONFERIR' | 'REVISAR'
  matches_recommendation: boolean
  is_in_alternatives: boolean
  current_tax?: CurrentNcmTaxInfo | null
  recommended_tax?: CurrentNcmTaxInfo | null
  tax_diff?: {
    ii_diff: number | null
    ipi_diff: number | null
    total_tax_diff: number | null
    cheaper: 'current' | 'recommended' | 'equal' | 'incomparable'
  } | null
  applicable_rgi?: string | null
  justification: string
  reasons?: string[]
}

export interface ClassifyNcmParams {
  productDescription: string
  brand?: string
  model?: string
  additionalSpecs?: string
  topN?: number
  saveLog?: boolean
  productId?: string
  impSimProductId?: string
  currentNcm?: string
  currentEx?: string
}

export interface ClassifyNcmResponse {
  success: boolean
  audit_id: string | null
  version?: string
  analyst_model?: string
  auditor_model?: string
  current_ncm_assessment?: CurrentNcmAssessment | null
  product_understanding?: {
    identity: string
    product_nature?:
      | 'aparelho com função própria completa'
      | 'acessório dependente (sem função autônoma, requer produto principal para operar)'
      | 'peça de reposição (substituição de componente)'
      | string
    essential_function: string
    technical_features?: string[]
    target_machines?: string[]
    canonical_statement: string
    coherent_with_description?: boolean
  }
  recommendation: {
    ncm: string
    ex: string
    description?: string
    ii: number
    ipi: number
    pis: number
    cofins: number
    total_tax: number
    has_ex_tarifario: boolean
    justification: string
    legal_basis?: any
    ex_details?: {
      descricao?: string | null
      resolucao?: string | null
      data_fim?: string | null
    } | null
  }
  alternatives: Array<{
    ncm: string
    ex: string
    description?: string
    ii: number
    ipi: number
    pis: number
    cofins: number
    total_tax: number
    has_ex_tarifario: boolean
    reason?: string
    legal_basis?: any
  }>
  confidence: 'alta' | 'media' | 'baixa'
  sufficient_info: boolean
  web_sources: Array<{ title: string; url: string; snippet?: string }>
  model_used: string
  candidates_count: number
  execution_time_ms: number
  audit_verdict?: {
    action: 'APROVA' | 'VETA'
    essential_function: string
    corrected_ncm?: string
    corrected_ex?: string
    correction_reason?: string
    audit_critique: string
    override_applied?: boolean
    override_reason?: string
    product_understanding?: any
  }
  checklist_log?: {
    passed: boolean
    status?: 'APROVADO' | 'VETADO' | 'NÃO VERIFICADO'
    requiresExpertReview?: boolean
    comparisons: Array<{
      name: string
      productValue: string
      exRequirement: string
      status: 'ATENDE' | 'NÃO ATENDE' | 'NÃO COMPROVADO'
      reason?: string
    }>
    vetoReason?: string
    missingInformation: string[]
    needsWebSearch: boolean
  }
  timestamp: string
}

/**
 * Invoca o endpoint HTTP inteligente `classify-ncm` da Fase 2.
 * Executa o fluxo completo de 7 fases: busca híbrida sobre todos os capítulos (84/85/90/94),
 * gatilho condicional de busca web, raciocínio aduaneiro NESH via LLMs (ai_providers)
 * e resolução final com alíquotas efetivas de imp_sim_tax_rates_effective.
 */
export async function classifyNcm(params: ClassifyNcmParams): Promise<ClassifyNcmResponse> {
  const { data, error } = await supabase.functions.invoke('classify-ncm', {
    body: {
      product_description: params.productDescription,
      brand: params.brand,
      model: params.model,
      additional_specs: params.additionalSpecs,
      top_n: params.topN ?? 15,
      save_log: params.saveLog !== false,
      product_id: params.productId,
      imp_sim_product_id: params.impSimProductId,
      current_ncm: params.currentNcm || undefined,
      current_ex: params.currentEx || undefined,
    },
  })

  if (error) {
    console.error('Erro na chamada da edge function classify-ncm:', error)
    throw error
  }

  return data as ClassifyNcmResponse
}

export interface NcmAutocompleteOption {
  ncm: string // 8 dígitos puros: "90071000"
  ncm_formatted: string // "9007.10.00"
  ncm_descricao_full: string
  ii_rate?: number | null
  ipi_rate?: number | null
  pis_rate?: number | null
  cofins_rate?: number | null
}

/** Formata código NCM para exibição legível 0000.00.00 */
export function formatNcmCode(code?: string | null): string {
  if (!code) return ''
  const digits = String(code).replace(/\D/g, '')
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
  }
  return code
}

/**
 * Remove acentos de uma string para permitir comparações case/accent-insensitive
 */
export function normalizeTextSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/* ------------------------------------------------------------------ */
/* Autocomplete otimizado: RPC única + cache em memória + fallback     */
/* ------------------------------------------------------------------ */

/** Cache de resultados de busca do autocomplete em memória (por sessão) */
const ncmAutocompleteCache = new Map<string, NcmAutocompleteOption[]>()
const AUTOCOMPLETE_CACHE_MAX = 80

/** Cache da existência da RPC search_ncm_autocomplete (evita tentativa repetida após 404/PGRST202) */
let rpcAvailability: boolean | null = null

/** Limpa o cache do autocomplete (útil para testes e para refresh manual) */
export function clearNcmAutocompleteCache() {
  ncmAutocompleteCache.clear()
  rpcAvailability = null
}

function setCacheEntry(key: string, value: NcmAutocompleteOption[]) {
  if (ncmAutocompleteCache.size >= AUTOCOMPLETE_CACHE_MAX) {
    // Evict o mais antigo (primeira chave inserida)
    const firstKey = ncmAutocompleteCache.keys().next().value
    if (firstKey !== undefined) {
      ncmAutocompleteCache.delete(firstKey)
    }
  }
  ncmAutocompleteCache.set(key, value)
}

function toAutocompleteOption(row: any): NcmAutocompleteOption {
  const clean = String(row?.ncm ?? '').replace(/\D/g, '')
  return {
    ncm: clean,
    ncm_formatted: formatNcmCode(clean),
    ncm_descricao_full: row?.ncm_descricao_full || '',
    ii_rate: row?.ii_rate !== null && row?.ii_rate !== undefined ? Number(row.ii_rate) : null,
    ipi_rate: row?.ipi_rate !== null && row?.ipi_rate !== undefined ? Number(row.ipi_rate) : null,
    pis_rate: row?.pis_rate !== null && row?.pis_rate !== undefined ? Number(row.pis_rate) : null,
    cofins_rate:
      row?.cofins_rate !== null && row?.cofins_rate !== undefined ? Number(row.cofins_rate) : null,
  }
}

/**
 * Fallback TEMPORÁRIO enquanto a RPC search_ncm_autocomplete não é aplicada no banco:
 * UMA query simples por prefixo de código (ou ILIKE na descrição), sem embeddings e sem
 * chamadas pesadas. Mantém o autocomplete funcionando até o usuário rodar a migration.
 */
async function searchNcmAutocompleteFallback(
  query: string,
  limit: number,
): Promise<NcmAutocompleteOption[]> {
  const digits = query.replace(/\D/g, '')
  let builder = (supabase.from('imp_sim_tax_rates') as any).select(
    'ncm, ncm_descricao_full, ii_rate, ipi_rate, pis_rate, cofins_rate',
  )

  if (digits.length >= 2) {
    builder = builder.ilike('ncm', `${digits}%`)
  } else {
    const firstToken = normalizeTextSearch(query)
      .split(/\s+/)
      .filter((t) => t.length >= 2)[0]
    if (!firstToken) return []
    builder = builder.ilike('ncm_descricao_full', `%${firstToken}%`)
  }

  const { data, error } = await builder.order('ncm', { ascending: true }).limit(limit)

  if (error) {
    console.warn('Erro no fallback de autocomplete NCM:', error)
    return []
  }

  return (Array.isArray(data) ? data : []).slice(0, limit).map(toAutocompleteOption)
}

/**
 * Busca opções de NCM na base imp_sim_tax_rates para o autocomplete — chamada ÚNICA.
 * Usa a RPC `search_ncm_autocomplete` (ranking, unaccent e LIMIT no servidor) com cache
 * em memória da sessão. Se a RPC ainda não existir no banco (migration não aplicada),
 * degrada graciosamente para uma query PostgREST simples (sem embeddings).
 */
export async function searchNcmAutocomplete(
  query: string,
  limit = 15,
): Promise<NcmAutocompleteOption[]> {
  const trimmed = (query || '').trim()
  if (!trimmed) return []

  const digitsOnly = trimmed.replace(/\D/g, '')
  const hasText = normalizeTextSearch(trimmed).length >= 2
  if (digitsOnly.length < 2 && !hasText) return []

  const cacheKey = `${trimmed.toLowerCase()}::${limit}`
  const cached = ncmAutocompleteCache.get(cacheKey)
  if (cached) {
    return cached
  }

  let results: NcmAutocompleteOption[] = []

  if (rpcAvailability !== false) {
    try {
      // RPC gerada pela migration (ainda não catalogada em types.ts) — chamada com cast
      const { data, error } = await (supabase.rpc as any)('search_ncm_autocomplete', {
        query: trimmed,
        limit,
      })

      if (error) {
        // PGRST202 = função não encontrada no schema cache (migration ainda não aplicada)
        const errCode = (error as any)?.code || (error as any)?.details || ''
        if (rpcAvailability === null && /PGRST202|not found|schema cache/i.test(String(errCode))) {
          rpcAvailability = false
          console.warn(
            'RPC search_ncm_autocomplete indisponível — usando fallback simples (rode a migration no painel).',
          )
          results = await searchNcmAutocompleteFallback(trimmed, limit)
        } else {
          throw error
        }
      } else {
        rpcAvailability = true
        results = (Array.isArray(data) ? data : []).slice(0, limit).map(toAutocompleteOption)
      }
    } catch (err) {
      // Fallback silencioso para a query simples em qualquer outro erro pontual da RPC
      console.warn('Erro na RPC search_ncm_autocomplete, tentando fallback simples:', err)
      try {
        results = await searchNcmAutocompleteFallback(trimmed, limit)
      } catch {
        results = []
      }
    }
  } else {
    results = await searchNcmAutocompleteFallback(trimmed, limit)
  }

  setCacheEntry(cacheKey, results)
  return results
}

/** Cache de validação de NCM para evitar round-trips repetidos */
const ncmValidationCache = new Map<string, boolean>()

/** Invalida o cache de validação (ex.: quando a base tarifária é atualizada) */
export function clearNcmValidationCache() {
  ncmValidationCache.clear()
}

/**
 * Valida se um código NCM existe na tabela imp_sim_tax_rates (ou é a exceção "0000.00.00" / "00000000").
 * Retorna true se válido, false se não existir.
 */
export async function validateNcmExists(code: string | null | undefined): Promise<boolean> {
  if (!code) return false
  const digits = String(code).replace(/\D/g, '')

  // Exceção oficial: 0000.00.00 é sempre aceito sem verificação na base
  if (digits === '00000000' || digits === '0000000') {
    return true
  }

  if (digits.length !== 8) {
    return false
  }

  if (ncmValidationCache.has(digits)) {
    return ncmValidationCache.get(digits)!
  }

  try {
    const { data, error } = await (supabase.from('imp_sim_tax_rates') as any)
      .select('ncm')
      .eq('ncm', digits)
      .limit(1)
      .maybeSingle()

    const exists = !error && !!data
    ncmValidationCache.set(digits, exists)
    return exists
  } catch (err) {
    console.warn('Erro ao validar existência de NCM:', err)
    return false
  }
}

/**
 * Valida um NCM vindo diretamente da lista do autocomplete (o código já veio do banco,
 * portanto é válido sem segunda query de rede). Retorna true se a origem é confiável.
 */
export function isNcmValidFromList(option: NcmAutocompleteOption | null | undefined): boolean {
  return !!option && /^\d{8}$/.test(option.ncm)
}

export const ncmService = {
  generateQueryEmbedding,
  searchCandidates: searchNcmCandidates,
  searchAutocomplete: searchNcmAutocomplete,
  validateExists: validateNcmExists,
  isValidFromList: isNcmValidFromList,
  logClassification: logNcmClassification,
  updateDecision: updateNcmClassificationDecision,
  classifyNcm,
  clearAutocompleteCache: clearNcmAutocompleteCache,
  clearValidationCache: clearNcmValidationCache,
}
