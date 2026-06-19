import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'

export interface AIGlobalSettings {
  id?: string
  cache_expiration_days: number
  price_threshold_usd: number
  search_algorithm_sql: string
  result_component_config: string
  system_prompt_template: string
  logistics_rules_prompt: string
  ignore_stock_count: boolean
  product_page_prompt?: string
}

export function useAISettings() {
  const [settings, setSettings] = useState<AIGlobalSettings | null>(null)
  const [agentSystemPrompt, setAgentSystemPrompt] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const fetchSettings = async () => {
    try {
      setLoading(true)

      const [settingsRes, agentSettingsRes] = await Promise.all([
        supabase
          .from('ai_settings')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('ai_agent_settings')
          .select('id, system_prompt')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ])

      const { data } = settingsRes

      if (data) {
        setSettings({
          id: data.id,
          cache_expiration_days: data.cache_expiration_days ?? 30,
          price_threshold_usd: data.price_threshold_usd ?? 5000,
          search_algorithm_sql: data.search_algorithm_sql || '',
          result_component_config: data.result_component_config
            ? JSON.stringify(data.result_component_config)
            : '',
          system_prompt_template: data.system_prompt_template || '',
          logistics_rules_prompt: data.logistics_rules_prompt || '',
          ignore_stock_count: data.ignore_stock_count ?? false,
          product_page_prompt: data.product_page_prompt || '',
        })
      } else {
        setSettings({
          cache_expiration_days: 30,
          price_threshold_usd: 5000,
          search_algorithm_sql: '',
          result_component_config: '{}',
          system_prompt_template:
            'Identidade: Consultor Técnico e de Vendas Sênior da My Way Business.\nModo de Vendas: Se um produto ou SKU for mencionado, ative o Modo de Vendas imediatamente. Seja persuasivo e técnico.\n\nREGRAS OBRIGATÓRIAS DE FORMATO:\n1. Sua resposta DEVE ser sempre um objeto JSON válido.\n2. Use a chave "referenced_internal_products" para listar um array contendo APENAS os IDs (UUIDs) dos produtos encontrados e recomendados.\n3. Use a chave "content" para o texto da sua resposta.\n4. É IMPRESCINDÍVEL incluir os IDs de TODOS os produtos mencionados na conversa para que os cards sejam exibidos corretamente na tela.\n\nBriefing Técnico: Detalhe sensor, latitude, codecs e ergonomia para cada produto.\nGatilhos Visuais: Force a exibição dos cards de produtos sempre que houver uma correspondência no inventário, retornando seus respectivos IDs.',
          logistics_rules_prompt:
            'Se price_usd > 0: Miami e Brasil. Se apenas price_nationalized_sales > 0: Somente Brasil.\nIMPORTANTE: Se o produto não tiver preço cadastrado (0 ou nulo) tanto em USD quanto Nacionalizado, a disponibilidade é "Sob Consulta" e NUNCA presuma que é estoque exclusivo do Brasil.',
          ignore_stock_count: false,
          product_page_prompt: '',
        })
      }

      if (agentSettingsRes.data) {
        setAgentSystemPrompt(agentSettingsRes.data.system_prompt || '')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async (newSettings: AIGlobalSettings) => {
    try {
      let parsedConfig = {}
      if (newSettings.result_component_config) {
        try {
          parsedConfig = JSON.parse(newSettings.result_component_config)
        } catch (e) {
          toast.error('Erro de JSON. A configuração visual é inválida.')
          return false
        }
      }

      let aiSettingsId = newSettings.id
      if (!aiSettingsId) {
        const { data } = await supabase
          .from('ai_settings')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        aiSettingsId = data?.id || '00000000-0000-0000-0000-000000000001'
      }

      const { error } = await supabase
        .from('ai_settings')
        .upsert(
          {
            id: aiSettingsId,
            cache_expiration_days: newSettings.cache_expiration_days,
            price_threshold_usd: newSettings.price_threshold_usd,
            search_algorithm_sql: newSettings.search_algorithm_sql,
            result_component_config: parsedConfig,
            system_prompt_template: newSettings.system_prompt_template,
            logistics_rules_prompt: newSettings.logistics_rules_prompt,
            ignore_stock_count: newSettings.ignore_stock_count,
            product_page_prompt: newSettings.product_page_prompt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        )
        .select()
        .single()

      if (error) throw error

      toast.success('Configurações da IA salvas com sucesso!')
      await fetchSettings()
      return true
    } catch (error: any) {
      console.error(error)
      toast.error(
        'Erro ao salvar configurações da IA: ' +
          (error.message || 'Falha na comunicação com o banco.'),
      )
      return false
    }
  }

  const saveAgentSystemPrompt = async (prompt: string) => {
    try {
      const { data } = await supabase
        .from('ai_agent_settings')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (data?.id) {
        const { error } = await supabase
          .from('ai_agent_settings')
          .update({ system_prompt: prompt, updated_at: new Date().toISOString() })
          .eq('id', data.id)
          .select()
          .single()
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('ai_agent_settings')
          .insert({
            system_prompt: prompt,
            id: '00000000-0000-0000-0000-000000000001',
          })
          .select()
          .single()
        if (error) throw error
      }

      setAgentSystemPrompt(prompt)
      toast.success('Instruções da IA salvas com sucesso!')
      return true
    } catch (error: any) {
      console.error(error)
      toast.error('Erro ao salvar instruções: ' + (error.message || 'Sem permissão ou falha.'))
      return false
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  return {
    settings,
    agentSystemPrompt,
    loading,
    fetchSettings,
    saveSettings,
    saveAgentSystemPrompt,
  }
}
