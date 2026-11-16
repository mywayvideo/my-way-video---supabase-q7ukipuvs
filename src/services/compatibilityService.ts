import { supabase } from '@/lib/supabase/client'

// Fase 2 do plano de acessórios: vínculos de COMPATIBILIDADE (acessório ↔ produto com que funciona).
// Diferente de "relacionado" (related_product_rules / ai_related_ids): não misturar as duas semânticas.
// Nesta etapa só existe CRUD manual; nenhuma análise ou sugestão automática roda aqui.

export const COMPATIBILITY_TABLE = 'product_compatibilities'

// Códigos que indicam que a tabela ainda não existe no remoto (migração não aplicada).
const MISSING_TABLE_CODES = ['42P01', 'PGRST205']

export interface CompatibilityLink {
  id: string
  productId: string
  name: string
  sku: string | null
  category: string | null
  priceBrl: number | null
  origem: 'manual' | 'ai'
  status: 'sugerido' | 'aprovado' | 'rejeitado'
}

export interface CompatibilityLinksResult {
  /** Vínculos em que o produto consultado é o ACESSÓRIO: cada item aponta para um produto compatível. */
  links: CompatibilityLink[]
  /** Vínculos em que o produto consultado é o PRINCIPAL: cada item aponta para o acessório designado. */
  reverseLinks: CompatibilityLink[]
  /** true quando a tabela ainda não existe no banco: a tela mostra aviso, sem quebrar. */
  unavailable: boolean
}

export interface CatalogSearchItem {
  id: string
  name: string
  sku: string | null
  category: string | null
  price_brl: number | null
  is_accessory: boolean
}

const SEARCH_LIMIT = 20

/** Escapa curingas do ILIKE e vírgulas usadas pelo filtro .or() do PostgREST. */
function sanitizeTerm(term: string): string {
  return term
    .trim()
    .replace(/[%_,()]/g, ' ')
    .trim()
}

function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return !!error && MISSING_TABLE_CODES.includes(error.code ?? '')
}

interface ProductRuleRow {
  id: string
  is_accessory: boolean | null
  category_id: string | null
  category: string | null
}

/** Chave efetiva de categoria: category_id quando existe, senão o rótulo legado normalizado. */
function effectiveCategoryKey(row: ProductRuleRow): string | null {
  if (row.category_id) return row.category_id
  const legacy = (row.category || '').trim().toLowerCase()
  return legacy || null
}

/**
 * Principal ↔ principal: permitido apenas entre categorias DIFERENTES (ex.: bateria de
 * Batteries & Chargers ↔ câmera de Cameras). Mesma categoria recusa.
 */
function validateMainMainPair(a: ProductRuleRow, b: ProductRuleRow): string | null {
  const keyA = effectiveCategoryKey(a)
  const keyB = effectiveCategoryKey(b)
  if (keyA && keyB && keyA === keyB) {
    return 'Vínculo recusado: os dois produtos são principais da MESMA categoria. Principal ↔ principal só é permitido entre categorias diferentes (ex.: uma bateria de "Batteries & Chargers" para uma câmera de "Cameras").'
  }
  return null
}

export const compatibilityService = {
  /** Busca acessórios (is_accessory = true) por nome ou SKU. */
  async searchAccessories(term: string): Promise<CatalogSearchItem[]> {
    return this.searchProducts(term, { accessoriesOnly: true })
  },

  /** Busca produtos PRINCIPAIS (is_accessory = false) por nome ou SKU. */
  async searchMainProducts(term: string): Promise<CatalogSearchItem[]> {
    return this.searchProducts(term, { accessoriesOnly: false })
  },

  /** Busca produtos PRINCIPAIS (is_accessory = false) candidatos a compatíveis por nome ou SKU. */
  async searchCompatibleCandidates(
    term: string,
    excludeProductId: string,
  ): Promise<CatalogSearchItem[]> {
    return this.searchProducts(term, { accessoriesOnly: false, excludeId: excludeProductId })
  },

  /**
   * Modo "a partir do produto principal": busca candidatos a acessório SEM filtro de
   * is_accessory (qualquer produto serve, inclusive baterias e memórias), excluindo o próprio.
   */
  async searchAccessoryCandidates(
    term: string,
    excludeProductId: string,
  ): Promise<CatalogSearchItem[]> {
    return this.searchProducts(term, {
      accessoriesOnly: false,
      anyKind: true,
      excludeId: excludeProductId,
    })
  },

  async searchProducts(
    term: string,
    opts: { accessoriesOnly: boolean; anyKind?: boolean; excludeId?: string },
  ): Promise<CatalogSearchItem[]> {
    const clean = sanitizeTerm(term)
    if (clean.length < 2) return []

    let query = supabase
      .from('products')
      .select('id, name, sku, category, price_brl, is_accessory')
      .or(`name.ilike.%${clean}%,sku.ilike.%${clean}%`)
      .order('name')
      .limit(SEARCH_LIMIT)

    if (opts.accessoriesOnly) query = query.eq('is_accessory', true)
    else if (!opts.anyKind) query = query.eq('is_accessory', false)
    if (opts.excludeId) query = query.neq('id', opts.excludeId)

    const { data, error } = await query
    if (error) throw error
    return (data || []) as CatalogSearchItem[]
  },

  /**
   * Listagem bidirecional: retorna os vínculos nos DOIS sentidos do produto consultado.
   * `links` = produtos com que ele funciona (ele como acessório);
   * `reverseLinks` = acessórios designados a ele (ele como produto principal).
   */
  async fetchLinks(productId: string): Promise<CompatibilityLinksResult> {
    const asAccessory = await (supabase as any)
      .from(COMPATIBILITY_TABLE)
      .select(
        'id, product_id, origem, status, product:products!product_id(id, name, sku, category, price_brl)',
      )
      .eq('accessory_id', productId)
      .order('created_at', { ascending: true })

    if (asAccessory.error) {
      if (isMissingTable(asAccessory.error))
        return { links: [], reverseLinks: [], unavailable: true }
      throw asAccessory.error
    }

    const asMain = await (supabase as any)
      .from(COMPATIBILITY_TABLE)
      .select(
        'id, accessory_id, origem, status, product:products!accessory_id(id, name, sku, category, price_brl)',
      )
      .eq('product_id', productId)
      .order('created_at', { ascending: true })

    if (asMain.error) {
      if (isMissingTable(asMain.error)) return { links: [], reverseLinks: [], unavailable: true }
      throw asMain.error
    }

    const map = (rows: any[], otherKey: 'product_id' | 'accessory_id'): CompatibilityLink[] =>
      ((rows || []) as any[]).map((row) => ({
        id: row.id,
        productId: row[otherKey],
        name: row.product?.name ?? '(produto removido)',
        sku: row.product?.sku ?? null,
        category: row.product?.category ?? null,
        priceBrl: row.product?.price_brl == null ? null : Number(row.product.price_brl),
        origem: row.origem,
        status: row.status,
      }))

    return {
      links: map(asAccessory.data, 'product_id'),
      reverseLinks: map(asMain.data, 'accessory_id'),
      unavailable: false,
    }
  },

  /** Cria vínculo manual já aprovado (origem manual, status aprovado). */
  async addManualLink(accessoryId: string, productId: string): Promise<void> {
    if (accessoryId === productId) {
      throw new Error('Não é possível vincular um produto a ele mesmo.')
    }

    // Regras: acessório ↔ principal, ou principal ↔ principal entre categorias diferentes.
    const { data, error: fetchError } = await supabase
      .from('products')
      .select('id, is_accessory, category_id, category')
      .in('id', [accessoryId, productId])

    if (fetchError) throw fetchError
    const rows = (data || []) as ProductRuleRow[]
    const accessorySide = rows.find((r) => r.id === accessoryId)
    const productSide = rows.find((r) => r.id === productId)

    if (!accessorySide || !productSide) {
      throw new Error('Produto não encontrado no catálogo. Recarregue a busca e tente novamente.')
    }
    if (accessorySide.is_accessory && productSide.is_accessory) {
      throw new Error(
        'Vínculo recusado: os dois produtos estão marcados como acessório. Um vínculo de compatibilidade deve ligar um acessório a um produto principal.',
      )
    }
    if (!accessorySide.is_accessory && !productSide.is_accessory) {
      // Principal ↔ principal é permitido SOMENTE entre categorias diferentes.
      const mainMainError = validateMainMainPair(accessorySide, productSide)
      if (mainMainError) throw new Error(mainMainError)
    }

    const { error } = await (supabase as any).from(COMPATIBILITY_TABLE).upsert(
      {
        accessory_id: accessoryId,
        product_id: productId,
        origem: 'manual',
        status: 'aprovado',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'accessory_id,product_id' },
    )
    if (error) throw error
  },

  /**
   * Modo "a partir do produto principal": o admin escolhe o produto PRINCIPAL e designa
   * acessórios para ele. `designatedId` é o produto designado como acessório (qualquer um,
   * marcado como acessório ou não). Regras: nunca o próprio produto; acessório ↔ acessório
   * recusado; principal ↔ principal só entre categorias diferentes. Nasce manual + aprovado.
   */
  async addMainProductLink(mainProductId: string, designatedId: string): Promise<void> {
    if (mainProductId === designatedId) {
      throw new Error('Não é possível vincular um produto a ele mesmo.')
    }

    const { data, error: fetchError } = await supabase
      .from('products')
      .select('id, is_accessory, category_id, category')
      .in('id', [mainProductId, designatedId])

    if (fetchError) throw fetchError
    const rows = (data || []) as ProductRuleRow[]
    const designated = rows.find((r) => r.id === designatedId)
    const main = rows.find((r) => r.id === mainProductId)

    if (!designated || !main) {
      throw new Error('Produto não encontrado no catálogo. Recarregue a busca e tente novamente.')
    }
    if (designated.is_accessory && main.is_accessory) {
      throw new Error(
        'Vínculo recusado: os dois produtos estão marcados como acessório. Um vínculo de compatibilidade deve ligar um acessório a um produto principal.',
      )
    }
    if (!designated.is_accessory && !main.is_accessory) {
      const mainMainError = validateMainMainPair(designated, main)
      if (mainMainError) throw new Error(mainMainError)
    }

    const { error } = await (supabase as any).from(COMPATIBILITY_TABLE).upsert(
      {
        accessory_id: designatedId,
        product_id: mainProductId,
        origem: 'manual',
        status: 'aprovado',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'accessory_id,product_id' },
    )
    if (error) throw error
  },

  /** Remove um vínculo gravado. */
  async removeLink(linkId: string): Promise<void> {
    const { error } = await (supabase as any).from(COMPATIBILITY_TABLE).delete().eq('id', linkId)
    if (error) throw error
  },

  /**
   * Busca PÚBLICA (página do produto): acessórios designados a este produto
   * como principal, somente status "aprovado". Retorna os campos que o card
   * público precisa (id, nome, imagem, preço).
   * ATENÇÃO: products NÃO tem colunas slug/images (não inventadas aqui) —
   * pedir essas colunas faz o PostgREST devolver 42703/PGRST e a seção sumir.
   */
  async fetchApprovedAccessories(productId: string): Promise<
    {
      id: string
      name: string
      image_url: string | null
      price_usd: number | null
      price_brl: number | null
    }[]
  > {
    const { data, error } = await (supabase as any)
      .from(COMPATIBILITY_TABLE)
      .select(
        `accessory:products!product_compatibilities_accessory_id_fkey!inner(id, name, image_url, price_usd, price_brl, is_discontinued)`,
      )
      .eq('product_id', productId)
      .eq('status', 'aprovado')
      .order('created_at', { ascending: true })

    if (error) {
      if (isMissingTable(error)) return []
      throw error
    }

    return ((data || []) as any[])
      .map((row) => row.accessory)
      .filter((a) => !!a && !a.is_discontinued)
  },
  /**
   * Busca em LOTE (renderização em lista — evita N+1): recebe os ids dos
   * produtos exibidos e devolve o subconjunto que tem PELO MENOS UM vínculo
   * com status "aprovado" (em qualquer sentido — na prática, o vínculo gravado
   * fica sempre com o produto principal no lado product_id). Um único SELECT
   * com in() na tabela product_compatibilities.
   */
  async fetchProductIdsWithApprovedLinks(productIds: string[]): Promise<Set<string>> {
    const result = new Set<string>()
    if (productIds.length === 0) return result

    const CHUNK = 200
    for (let i = 0; i < productIds.length; i += CHUNK) {
      const chunk = productIds.slice(i, i + CHUNK)
      const { data, error } = await (supabase as any)
        .from(COMPATIBILITY_TABLE)
        .select('product_id, accessory_id')
        .eq('status', 'aprovado')
        .or(`product_id.in.(${chunk.join(',')}),accessory_id.in.(${chunk.join(',')})`)
      if (error) {
        if (isMissingTable(error)) return result
        throw error
      }
      for (const row of (data || []) as any[]) {
        if (chunk.includes(row.product_id)) result.add(row.product_id)
        if (chunk.includes(row.accessory_id)) result.add(row.accessory_id)
      }
    }
    return result
  },
}
