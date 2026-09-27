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

export interface ClassifyNcmParams {
  productDescription: string
  brand?: string
  model?: string
  additionalSpecs?: string
  topN?: number
  saveLog?: boolean
  productId?: string
  impSimProductId?: string
}

export interface ClassifyNcmResponse {
  success: boolean
  audit_id: string | null
  version?: string
  analyst_model?: string
  auditor_model?: string
  product_understanding?: {
    identity: string
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
    },
  })

  if (error) {
    console.error('Erro na chamada da edge function classify-ncm:', error)
    throw error
  }

  return data as ClassifyNcmResponse
}

export const ncmService = {
  generateQueryEmbedding,
  searchCandidates: searchNcmCandidates,
  logClassification: logNcmClassification,
  updateDecision: updateNcmClassificationDecision,
  classifyNcm,
}
