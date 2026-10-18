import { supabase } from '@/lib/supabase/client'

export type RelationType = 'essencial' | 'complemento' | 'licenca' | 'suporte'

export interface CompatibilityFilter {
  spec?: string
  target_spec?: string
  match?: 'equal' | 'contains' | 'any'
  [key: string]: any
}

export interface RelatedProductRule {
  id: string
  categoria_origem: string
  categoria_alvo: string
  tipo_relacao: RelationType
  prioridade: number
  max_sugestoes: number
  filtros_compatibilidade: CompatibilityFilter
  bidirecional: boolean
  ativa: boolean
  observacoes?: string | null
  created_at?: string
  updated_at?: string
  // Joins opcionais
  categoria_origem_ref?: { id: string; name: string }
  categoria_alvo_ref?: { id: string; name: string }
}

export interface RelatedSuggestionMeta {
  confidence: 'alta' | 'media' | 'baixa'
  reason: string
  rule_id?: string | null
  created_at?: string
}

export type ProductRelatedMeta = Record<string, RelatedSuggestionMeta>

export const relatedRulesService = {
  async listRules(): Promise<RelatedProductRule[]> {
    const { data, error } = await (supabase as any)
      .from('related_product_rules')
      .select(`
        *,
        categoria_origem_ref:categories!related_product_rules_categoria_origem_fkey(id, name),
        categoria_alvo_ref:categories!related_product_rules_categoria_alvo_fkey(id, name)
      `)
      .order('prioridade', { ascending: true })

    if (error) {
      console.warn('Erro ao carregar regras com fkey join, tentando sem join:', error.message)
      // Fallback sem join explícito caso fkey difira
      const { data: raw, error: rawError } = await (supabase as any)
        .from('related_product_rules')
        .select('*')
        .order('prioridade', { ascending: true })

      if (rawError) throw rawError
      return (raw || []) as unknown as RelatedProductRule[]
    }

    return (data || []) as unknown as RelatedProductRule[]
  },

  async createRule(
    rule: Omit<RelatedProductRule, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<RelatedProductRule> {
    const { data, error } = await (supabase as any)
      .from('related_product_rules')
      .insert({
        categoria_origem: rule.categoria_origem,
        categoria_alvo: rule.categoria_alvo,
        tipo_relacao: rule.tipo_relacao,
        prioridade: rule.prioridade ?? 10,
        max_sugestoes: rule.max_sugestoes ?? 3,
        filtros_compatibilidade: rule.filtros_compatibilidade || {},
        bidirecional: Boolean(rule.bidirecional),
        ativa: rule.ativa ?? true,
        observacoes: rule.observacoes || null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return data as unknown as RelatedProductRule
  },

  async updateRule(id: string, updates: Partial<RelatedProductRule>): Promise<RelatedProductRule> {
    const { data, error } = await (supabase as any)
      .from('related_product_rules')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as unknown as RelatedProductRule
  },

  async deleteRule(id: string): Promise<void> {
    const { error } = await supabase
      .from('related_product_rules' as any)
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  async toggleActive(id: string, current: boolean): Promise<void> {
    await this.updateRule(id, { ativa: !current })
  },
}
