import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSION = 1536

interface IndexRequestBody {
  action?: 'index' | 'embed' | 'stats'
  text?: string
  limit?: number
  batchSize?: number
  force?: boolean
  ncm?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || ''
  const openAiKey = Deno.env.get('OPENAI_API_KEY') || ''

  if (!openAiKey) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY não configurada no backend.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: IndexRequestBody = {}
  try {
    if (req.method === 'POST') {
      body = await req.json().catch(() => ({}))
    }
  } catch (_e) {
    body = {}
  }

  const action = body.action || 'index'
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  try {
    // 1. AÇÃO: EMBED ÚNICO PARA QUERY
    if (action === 'embed') {
      const text = body.text?.trim()
      if (!text) {
        return new Response(
          JSON.stringify({ error: 'Parâmetro text é obrigatório para action embed.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const embedding = await generateSingleEmbedding(text, openAiKey)
      return new Response(
        JSON.stringify({
          model: OPENAI_EMBEDDING_MODEL,
          dimension: embedding.length,
          embedding,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. AÇÃO: ESTATÍSTICAS
    if (action === 'stats') {
      const { count: total, error: totalErr } = await supabaseAdmin
        .from('imp_sim_ncm_embeddings')
        .select('*', { count: 'exact', head: true })

      const { count: indexed, error: indexedErr } = await supabaseAdmin
        .from('imp_sim_ncm_embeddings')
        .select('*', { count: 'exact', head: true })
        .not('embedding', 'is', null)

      if (totalErr || indexedErr) {
        throw new Error(totalErr?.message || indexedErr?.message)
      }

      const tot = Number(total || 0)
      const ind = Number(indexed || 0)
      const remaining = tot - ind

      return new Response(
        JSON.stringify({
          total: tot,
          indexed: ind,
          remaining,
          model: OPENAI_EMBEDDING_MODEL,
          dimension: EMBEDDING_DIMENSION,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. AÇÃO PRINCIPAL: INDEXAR LINHAS
    // Cada execução de lote processa até 800 linhas em sub-lotes de 100 para evitar timeout na RPC
    const limit = Math.max(1, Math.min(Number(body.limit) || 800, 1000))
    const dbSubBatchSize = 100
    const force = Boolean(body.force)

    // Buscar registros para processar
    let query = supabaseAdmin
      .from('imp_sim_ncm_embeddings')
      .select('ncm, ex, source_text')
      .order('ncm', { ascending: true })
      .order('ex', { ascending: true })
      .limit(limit)

    if (!force) {
      query = query.is('embedding', null)
    }

    if (body.ncm) {
      query = query.eq('ncm', body.ncm)
    }

    const { data: rows, error: selectError } = await query

    if (selectError) {
      return new Response(JSON.stringify({ error: selectError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'Nenhum registro pendente para indexar.',
          processed: 0,
          remaining: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let processedTotal = 0
    let updatedTotal = 0

    // 1. Gerar todos os embeddings das linhas selecionadas via OpenAI em uma única chamada (rápido!)
    const inputs = rows.map((r) => {
      const text = (r.source_text || `NCM ${r.ncm}`).trim()
      return text.length > 0 ? text : `NCM ${r.ncm}`
    })

    const embeddings = await generateBatchEmbeddings(inputs, openAiKey)

    if (embeddings.length !== rows.length) {
      throw new Error(
        `Discrepância no lote: esperados ${rows.length} vetores, recebidos ${embeddings.length}`,
      )
    }

    // 2. Atualizar no banco em fatias menores de 100 linhas (rápido e não estoura statement_timeout)
    for (let i = 0; i < rows.length; i += dbSubBatchSize) {
      const chunkRows = rows.slice(i, i + dbSubBatchSize)
      const chunkEmbeddings = embeddings.slice(i, i + dbSubBatchSize)

      const recordsToUpdate = chunkRows.map((r, idx) => ({
        ncm: r.ncm,
        ex: r.ex || '',
        source_text: r.source_text,
        embedding: `[${chunkEmbeddings[idx].join(',')}]`,
      }))

      const { data: updatedCount, error: rpcError } = await supabaseAdmin.rpc(
        'upsert_ncm_embeddings_batch',
        {
          records: recordsToUpdate,
          p_model: OPENAI_EMBEDDING_MODEL,
        },
      )

      if (rpcError) {
        console.error('Erro na RPC upsert_ncm_embeddings_batch:', rpcError)
        throw rpcError
      }

      processedTotal += chunkRows.length
      updatedTotal += Number(updatedCount || 0)
    }

    return new Response(
      JSON.stringify({
        success: true,
        batch_limit: limit,
        processed: processedTotal,
        updated: updatedTotal,
        model: OPENAI_EMBEDDING_MODEL,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Erro na indexação NCM:', error)
    return new Response(
      JSON.stringify({
        error: error.message || 'Erro inesperado durante indexação de embeddings.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

async function generateSingleEmbedding(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSION,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI API error (${res.status}): ${errText}`)
  }

  const json = await res.json()
  return json.data[0].embedding
}

async function generateBatchEmbeddings(inputs: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: inputs,
      dimensions: EMBEDDING_DIMENSION,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI Embeddings API error (${res.status}): ${errText}`)
  }

  const json = await res.json()
  const data = json.data as { index: number; embedding: number[] }[]
  // Garantir a ordenação correta por índice original
  data.sort((a, b) => a.index - b.index)
  return data.map((d) => d.embedding)
}
