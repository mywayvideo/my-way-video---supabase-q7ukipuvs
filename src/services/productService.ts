import { supabase } from '@/lib/supabase/client'
import { ProductFormData } from '@/types/product'
import { isStorageImageUrl } from '@/lib/image-proxy'
import { sanitizeSku } from '@/utils/sku-sanitizer'
import {
  normalizeSkuKey,
  normalizeBhSkuKey,
  matchBhSkuWithDatabase,
  formatSonyStandardSku,
} from '@/utils/sku-normalization'
import { normalizeSkuForBrand, isSonyBrand } from '@/utils/sku-normalize'

export async function persistExternalProductImage(
  imageUrl: string | null | undefined,
  productId?: string | null,
): Promise<string | null> {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
    return null
  }

  const trimmedUrl = imageUrl.trim()

  // Se a URL já for do Supabase Storage, retorna direto
  if (
    isStorageImageUrl(trimmedUrl) ||
    trimmedUrl.includes('/storage/v1/object/public/product-images')
  ) {
    return trimmedUrl
  }

  try {
    const { data, error } = await supabase.functions.invoke('image-proxy', {
      body: {
        url: trimmedUrl,
        forceUpload: true,
        json: true,
        productId: productId || undefined,
      },
    })

    if (!error && data?.success && data?.storageUrl) {
      return data.storageUrl
    }

    const failureReason = error?.message || data?.error || 'Failed to persist external image'

    // Em caso de falha, insere registro em image_migration_failures sem bloquear o cadastro
    try {
      await supabase.from('image_migration_failures').insert({
        product_id: productId || null,
        external_url: trimmedUrl,
        error_message: failureReason,
        attempt_count: 1,
      })
    } catch (_insertErr) {
      console.warn('Falha ao registrar em image_migration_failures:', _insertErr)
    }

    return trimmedUrl
  } catch (err: any) {
    console.warn('Erro ao invocar persistência de imagem externa:', err)
    try {
      await supabase.from('image_migration_failures').insert({
        product_id: productId || null,
        external_url: trimmedUrl,
        error_message: err?.message || 'Exception invoking image-proxy',
        attempt_count: 1,
      })
    } catch (_insertErr) {
      // Ignora erro no log da falha
    }
    // O cadastro nunca deve falhar por causa de imagem: retorna a URL original
    return trimmedUrl
  }
}

export async function uploadProductImage(
  file: File,
  productId?: string | null,
): Promise<{ publicUrl: string; path: string }> {
  const allowedTypes = ['image/jpeg', 'image/png']
  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      'Formato inválido. Apenas imagens em JPEG (.jpg, .jpeg) ou PNG (.png) são permitidas.',
    )
  }

  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Arquivo muito grande. O tamanho máximo permitido é de 10MB.')
  }

  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  const targetId = productId && productId.trim() !== '' ? productId.trim() : crypto.randomUUID()
  const filePath = `products/${targetId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    console.error('Erro no upload para Supabase Storage:', uploadError)
    throw new Error(uploadError.message || 'Erro ao enviar imagem para o armazenamento.')
  }

  const { data } = supabase.storage.from('product-images').getPublicUrl(filePath)
  if (!data?.publicUrl) {
    throw new Error('Não foi possível obter a URL pública da imagem enviada.')
  }

  return {
    publicUrl: data.publicUrl,
    path: filePath,
  }
}

export const productService = {
  persistExternalProductImage,
  uploadProductImage,
  async getCategories() {
    const { data, error } = await supabase.from('categories').select('id, name').order('name')
    if (error) throw error
    return data || []
  },

  async checkSkuExists(
    sku: string,
    options?: {
      manufacturerId?: string | null
      manufacturerName?: string | null
      excludeProductId?: string | null
    },
  ): Promise<boolean> {
    const candidateProduct = await this.findDuplicateProductByNormalizedSku(sku, options)
    return !!candidateProduct
  },

  /**
   * Encontra se já existe no banco um produto que colide com o SKU fornecido,
   * comparando pela CHAVE NORMALIZADA (uppercase, sem traço, sem espaço).
   * Se for Sony (ou se manufacturerId/Name indicar Sony), a colisão é restrita ou prioritária para produtos Sony,
   * mas de forma geral a chave normalizada protege contra colisões exatas e normalizadas.
   */
  async findDuplicateProductByNormalizedSku(
    rawSku: string,
    options?: {
      manufacturerId?: string | null
      manufacturerName?: string | null
      excludeProductId?: string | null
    },
  ): Promise<{ id: string; sku: string; name: string } | null> {
    if (!rawSku || typeof rawSku !== 'string' || !rawSku.trim()) {
      return null
    }

    const normKey = normalizeSkuKey(rawSku)
    if (!normKey) return null

    // 1. Checagem direta no mesmo fabricante (se fornecido) comparando chave normalizada
    if (options?.manufacturerId) {
      let mfgQuery = supabase
        .from('products')
        .select('id, sku, name, manufacturer_id')
        .eq('manufacturer_id', options.manufacturerId)

      if (options.excludeProductId) {
        mfgQuery = mfgQuery.neq('id', options.excludeProductId)
      }

      const { data: mfgProducts, error: mfgErr } = await mfgQuery
      if (!mfgErr && mfgProducts && mfgProducts.length > 0) {
        const found = mfgProducts.find((p) => normalizeSkuKey(p.sku) === normKey)
        if (found) {
          return { id: found.id, sku: found.sku || '', name: found.name || '' }
        }
      }
    }

    // 2. Correspondência exata de SKU (geral ou excluindo produto atual)
    let exactQuery = supabase.from('products').select('id, sku, name').eq('sku', rawSku.trim())

    if (options?.excludeProductId) {
      exactQuery = exactQuery.neq('id', options.excludeProductId)
    }

    const { data: exactMatch, error: exactErr } = await exactQuery.maybeSingle()
    if (!exactErr && exactMatch) {
      return exactMatch
    }

    // 3. Busca inteligente considerando casamentos B&H e variações com/sem hífen
    // (ex.: B&H # SOBRUSF10 vs MFR BRU-SF10 vs DB BRUSF10):
    const isSony =
      (options?.manufacturerName && isSonyBrand(options.manufacturerName)) ||
      normKey.startsWith('SO')
    const strippedKey = normalizeBhSkuKey(normKey, isSony)

    // Busca candidatos com ilike usando a raiz do SKU (strippedKey ou normKey)
    const searchRoot = strippedKey && strippedKey.length >= 3 ? strippedKey : normKey
    const { data: candidates, error: candErr } = await supabase
      .from('products')
      .select('id, sku, name')
      .ilike('sku', `%${searchRoot.slice(0, 10)}%`)
      .limit(50)

    if (!candErr && candidates && candidates.length > 0) {
      const collision = candidates.find((c) => {
        if (options?.excludeProductId && c.id === options.excludeProductId) return false
        return matchBhSkuWithDatabase(rawSku, c.sku, isSony)
      })
      if (collision) {
        return { id: collision.id, sku: collision.sku || '', name: collision.name || '' }
      }
    }

    return null
  },

  async extractFromUrl(url: string) {
    const { data, error } = await supabase.functions.invoke('extract-product-bhphoto', {
      body: { url },
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    if (data && typeof data.sku === 'string') {
      const isSony = isSonyBrand(data.extracted_brand) || isSonyBrand(data.manufacturer)
      data.sku = isSony ? formatSonyStandardSku(data.sku) : sanitizeSku(data.sku)
    }
    // Garante que source_url esteja sempre preenchido com a URL enviada caso não retornado
    if (data && !data.source_url) {
      data.source_url = url
    }
    return data
  },

  async calculateBrl(price_cost: number, weight: number) {
    const { data, error } = await supabase.functions.invoke('calculate-price-brl', {
      body: { price_cost, weight },
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    return data.price_brl
  },

  async extractProductFromUrl(url: string) {
    return this.extractFromUrl(url)
  },

  async suggestNcm(description: string) {
    const { data, error } = await supabase.functions.invoke('validate-ncm-suggestion', {
      body: { description },
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    return data
  },

  async getManufacturers() {
    const { data, error } = await supabase.from('manufacturers').select('id, name').order('name')
    if (error) throw error
    return data || []
  },

  async createProduct(productData: any) {
    let finalImageUrl = productData.image_url || null
    let brandName = productData.brand || productData.manufacturer_name || ''
    if (!brandName && productData.manufacturer_id) {
      try {
        const { data: mfg } = await supabase
          .from('manufacturers')
          .select('name')
          .eq('id', productData.manufacturer_id)
          .maybeSingle()
        if (mfg?.name) brandName = mfg.name
      } catch {
        /* intentionally ignored */
      }
    }

    const finalSku = normalizeSkuForBrand(productData.sku, brandName)
    if (finalImageUrl) {
      try {
        finalImageUrl = await persistExternalProductImage(finalImageUrl)
      } catch (_imgErr) {
        // Fallback para URL original caso erro inesperado
      }
    }

    // REGRA 1: Recusar categoria vazia/inválida ao salvar produto
    if (!productData.category_id || String(productData.category_id).trim() === '') {
      throw new Error(
        'Categoria obrigatória: o salvamento de produto (individual e via importação) deve recusar categoria vazia/inválida. Selecione uma categoria válida.',
      )
    }

    // Validação preventiva de unicidade por chave normalizada antes de tentar o insert
    if (finalSku) {
      const duplicate = await this.findDuplicateProductByNormalizedSku(finalSku, {
        manufacturerId: productData.manufacturer_id || null,
        manufacturerName: brandName || null,
      })
      if (duplicate) {
        throw new Error(
          `Não foi possível criar o produto: SKU "${finalSku}" colide com produto já cadastrado "${duplicate.sku}" (${duplicate.name}).`,
        )
      }
    }

    const payload = {
      name: productData.name,
      sku: finalSku,
      manufacturer_id: productData.manufacturer_id || null,
      price_usd: productData.price_usa || 0,
      price_cost: productData.price_cost || 0,
      price_brl: productData.price_brl || 0,
      weight: productData.weight || 0,
      dimensions: productData.dimensions || null,
      stock: productData.stock || 0,
      ncm: productData.ncm || null,
      image_url: finalImageUrl,
      description: productData.description !== undefined ? productData.description : null,
      technical_info: productData.technical_info !== undefined ? productData.technical_info : null,
      is_special: productData.is_special || false,
      is_discontinued: productData.is_discontinued || false,
      category_id: productData.category_id || null,
      category: productData.category || null,
      price_nationalized_sales: productData.price_nationalized_sales || null,
      price_nationalized_cost: productData.price_nationalized_cost || null,
      price_nationalized_currency: productData.price_nationalized_currency || 'BRL',
      manual_related_ids: productData.manual_related_ids || [],
      ai_related_ids: productData.ai_related_ids || [],
      price_usa_rebate:
        productData.price_usa_rebate === '' ? null : (productData.price_usa_rebate ?? null),
      price_cost_rebate:
        productData.price_cost_rebate === '' ? null : (productData.price_cost_rebate ?? null),
      date_rebate: productData.date_rebate === '' ? null : (productData.date_rebate ?? null),
      website_url: productData.website_url ? String(productData.website_url).trim() : null,
    }

    const { data, error } = await supabase.from('products').insert(payload).select().single()

    if (error) throw error
    return data
  },

  async markProductAsReviewed(id: string) {
    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from('products')
      .update({ last_reviewed_at: nowIso } as any)
      .eq('id', id)
      .select('id, created_at, updated_at, last_reviewed_at')
      .single()

    if (error) throw error
    return data
  },

  async updateProduct(id: string, productData: any) {
    let finalImageUrl = productData.image_url !== undefined ? productData.image_url : undefined
    let brandName = productData.brand || productData.manufacturer_name || ''
    if (!brandName && productData.manufacturer_id) {
      try {
        const { data: mfg } = await supabase
          .from('manufacturers')
          .select('name')
          .eq('id', productData.manufacturer_id)
          .maybeSingle()
        if (mfg?.name) brandName = mfg.name
      } catch {
        /* intentionally ignored */
      }
    }

    const finalSku =
      productData.sku !== undefined ? normalizeSkuForBrand(productData.sku, brandName) : undefined
    if (finalImageUrl) {
      try {
        finalImageUrl = await persistExternalProductImage(finalImageUrl, id)
      } catch (_imgErr) {
        // Fallback para URL original caso erro inesperado
      }
    }

    // Validação preventiva de unicidade por chave normalizada na alteração de SKU
    const effectiveSku = finalSku !== undefined ? finalSku : productData.sku
    if (effectiveSku) {
      const duplicate = await this.findDuplicateProductByNormalizedSku(effectiveSku, {
        manufacturerId: productData.manufacturer_id || null,
        manufacturerName: brandName || null,
        excludeProductId: id,
      })
      if (duplicate) {
        throw new Error(
          `Não foi possível atualizar o produto: SKU "${effectiveSku}" colide com produto já cadastrado "${duplicate.sku}" (${duplicate.name}).`,
        )
      }
    }

    const payload: any = {
      name: productData.name,
      sku: finalSku !== undefined ? finalSku : productData.sku,
      manufacturer_id: productData.manufacturer_id || null,
      price_usd: productData.price_usa || 0,
      price_cost: productData.price_cost || 0,
      price_brl: productData.price_brl || 0,
      weight: productData.weight || 0,
      dimensions: productData.dimensions || null,
      stock: productData.stock || 0,
      ncm: productData.ncm || null,
      image_url: finalImageUrl || null,
      description: productData.description !== undefined ? productData.description : null,
      technical_info: productData.technical_info !== undefined ? productData.technical_info : null,
      is_special: productData.is_special || false,
      is_discontinued: productData.is_discontinued || false,
      category_id: productData.category_id || null,
      category: productData.category || null,
      price_nationalized_sales: productData.price_nationalized_sales || null,
      price_nationalized_cost: productData.price_nationalized_cost || null,
      price_nationalized_currency: productData.price_nationalized_currency || 'BRL',
      manual_related_ids: productData.manual_related_ids || [],
      ai_related_ids: productData.ai_related_ids || [],
      price_usa_rebate:
        productData.price_usa_rebate === '' ? null : (productData.price_usa_rebate ?? null),
      price_cost_rebate:
        productData.price_cost_rebate === '' ? null : (productData.price_cost_rebate ?? null),
      date_rebate: productData.date_rebate === '' ? null : (productData.date_rebate ?? null),
      ...(productData.website_url !== undefined
        ? { website_url: productData.website_url ? String(productData.website_url).trim() : null }
        : {}),
    }

    const { error } = await supabase.from('products').update(payload).eq('id', id)

    if (error) throw error
    return true
  },
}
