import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
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
      } catch (e) {
        // Ignorar falha de parse se não for um JSON válido e tratar logo abaixo
      }
    }

    const { productId } = body

    if (!productId) {
      return new Response(JSON.stringify({ error: 'O campo productId é obrigatório.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Buscar os detalhes do produto principal
    const { data: mainProduct, error: mainError } = await supabase
      .from('products')
      .select('id, name, description, category, rejected_related_ids')
      .eq('id', productId)
      .maybeSingle()

    if (mainError || !mainProduct) {
      return new Response(JSON.stringify({ error: 'Produto não encontrado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rejectedIds = mainProduct.rejected_related_ids || []

    // 2. Buscar uma lista leve do catálogo para prover contexto à IA
    const { data: catalogRaw, error: catalogError } = await supabase
      .from('products')
      .select('id, name, category')
      .neq('id', productId)
      .eq('is_discontinued', false)
      .limit(500)

    if (catalogError || !catalogRaw || catalogRaw.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Não há produtos suficientes no catálogo para gerar recomendações.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const catalog = catalogRaw.filter((p) => !rejectedIds.includes(p.id))

    if (catalog.length === 0) {
      return new Response(JSON.stringify({ success: true, ai_related_ids: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Obter a chave da OpenAI e preparar a chamada para a API
    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAiKey) {
      return new Response(
        JSON.stringify({ error: 'Chave da API da OpenAI não configurada no servidor.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const systemPrompt = `Você é um especialista em equipamentos audiovisuais profissionais. O seu objetivo é sugerir TODOS os produtos do catálogo fornecido que sejam altamente relevantes ou complementares (cross-sell / up-sell) para o Produto Principal.
Devolva APENAS um objeto JSON contendo um array de strings chamado "related_ids" com os IDs exatos dos produtos que você selecionou do catálogo. 

REGRAS CRÍTICAS:
- Encontre e retorne TODOS os produtos altamente relevantes. Não há limite de quantidade.
- Garanta compatibilidade ESTRITA. NUNCA sugira marcas incompatíveis (ex: baterias Canon para uma câmera Sony).
- Sugira APENAS acessórios diretos, itens estritamente compatíveis e alternativas de melhor custo-benefício.
- Se nenhum produto for um bom complemento, retorne um array vazio.`

    const userPrompt = `PRODUTO PRINCIPAL:
ID: ${mainProduct.id}
Nome: ${mainProduct.name}
Categoria: ${mainProduct.category || 'N/A'}
Descrição: ${mainProduct.description || 'N/A'}

CATÁLOGO DISPONÍVEL:
${catalog.map((p) => `- ID: ${p.id} | Nome: ${p.name} | Cat: ${p.category || 'N/A'}`).join('\n')}

Responda com o JSON no formato: { "related_ids": ["uuid-1", "uuid-2"] }`

    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    if (!openAiResponse.ok) {
      const errText = await openAiResponse.text()
      console.error('Erro na chamada para a API OpenAI:', errText)
      throw new Error('Falha ao comunicar com a inteligência artificial.')
    }

    const aiData = await openAiResponse.json()
    const aiContent = aiData.choices?.[0]?.message?.content || '{}'

    // 4. Parsear o retorno da IA
    let relatedIds: string[] = []
    try {
      const parsed = JSON.parse(aiContent)
      if (Array.isArray(parsed.related_ids)) {
        relatedIds = parsed.related_ids
      }
    } catch (e) {
      console.error('Erro ao decodificar a resposta da IA:', e)
      throw new Error('O formato da resposta gerada pela IA foi inválido.')
    }

    // Filtrar apenas IDs válidos (removida a limitação de 6 itens)
    const validIds = relatedIds.filter((id) => catalog.some((c) => c.id === id))

    // 5. Atualizar o produto no banco de dados com a nova lista de relacionados
    const { error: updateError } = await supabase
      .from('products')
      .update({ ai_related_ids: validIds })
      .eq('id', productId)

    if (updateError) {
      console.error('Erro ao atualizar o banco de dados:', updateError)
      throw new Error('Não foi possível salvar os produtos relacionados no banco de dados.')
    }

    // 6. Retornar resposta JSON de sucesso
    return new Response(JSON.stringify({ success: true, ai_related_ids: validIds }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Erro inesperado em generate-related-products:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Ocorreu um erro interno no servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
