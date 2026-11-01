/**
 * Serviço de Importação ScanSource Sony
 *
 * Responsável por:
 * 1. Cruzar o MODEL da planilha com o SKU do catálogo usando a normalização alfanumérica
 *    (PXWX400KC acha PXW-X400KC e PXWX400KC, BPU70 acha BP-U70).
 * 2. Preview do cruzamento:
 *    - Casados com mudança de valor (preço atual -> novo)
 *    - Casados inalterados
 *    - Não casados (na tabela, sem produto no banco)
 *    - Linhas SW e 3RD identificadas
 *    - Anomalias (preço zerado, ausente ou negativo)
 * 3. Gravação confirmada pelo usuário:
 *    - Atualizar price_nationalized_cost = valor da Coluna D (arredondado para 2 casas)
 *    - price_nationalized_currency = 'Nacionalizado USD'
 *    - NUNCA alterar price_usd, price_nationalized_sales, price_brl ou preço de venda
 *    - Enviar NÃO CASADOS para a tabela `product_import_staging` com batch_source='scansource'
 *      e sugestão de categoria via categoryImportStagingService
 *    - Gravar registro de auditoria em `scansource_import_audits`
 * 4. Relatório pós-execução:
 *    - Produtos Sony ativos do catálogo ausentes da tabela (sem desativar nada)
 *    - Exportável em CSV
 */

import { supabase } from '@/lib/supabase/client'
import { normalizeSkuKey } from '@/utils/sku-normalization'
import {
  ScanSourceParseResult,
  ScanSourceParsedRow,
  roundToTwoDecimals,
} from '@/utils/scansource-parser'
import { categoryImportStagingService } from '@/services/categoryImportStagingService'
import { CategoryItem } from '@/services/categoryTriageService'
import {
  SkuCandidateMatch,
  ReverseTableMatch,
  findTopCandidatesForUnmatchedRow,
  findSimilarTableRowsForCatalogProduct,
} from '@/utils/scansource-matching-helper'

export interface CatalogProductSummary {
  id: string
  name: string
  sku: string | null
  normalizedSku: string
  price_nationalized_cost: number | null
  price_nationalized_currency: string | null
  price_usd: number | null
  price_brl: number | null
  category: string | null
  category_id: string | null
  manufacturer_id: string | null
  is_discontinued: boolean
}

export interface MatchedItemPreview {
  product: CatalogProductSummary
  row: ScanSourceParsedRow
  currentCostUsd: number | null
  currentCurrency: string | null
  newCostUsd: number
  hasPriceChange: boolean
  diffUsd: number
}

export interface UnmatchedItemPreview {
  row: ScanSourceParsedRow
  suggestedCategoryId: string | null
  suggestedCategoryName: string | null
  suggestionConfidence: 'alta' | 'media' | 'baixa'
  suggestionReason: string
  candidates: SkuCandidateMatch[]
  linkedProductId?: string | null
  linkedProductName?: string | null
  linkedProductSku?: string | null
}

export interface MissingCatalogProduct {
  id: string
  name: string
  sku: string | null
  category: string | null
  price_nationalized_cost: number | null
  price_nationalized_currency: string | null
  price_usd: number | null
  similarTableRows: ReverseTableMatch[]
}

export interface ScanSourceCrossMatchPreview {
  effectiveDate: string
  fileName: string
  totalRows: number

  // Casados
  matchedItems: MatchedItemPreview[]
  matchedWithChange: MatchedItemPreview[]
  matchedUnchanged: MatchedItemPreview[]
  matchedCount: number
  matchedWithChangeCount: number
  matchedUnchangedCount: number

  // Amostra de destaque
  pxwSample?: MatchedItemPreview

  // Não casados
  unmatchedItems: UnmatchedItemPreview[]
  unmatchedCount: number

  // Contagens especiais
  softwareCount: number
  ignored3rdCount: number
  anomalies: ScanSourceParsedRow[]
  anomaliesCount: number

  // Produtos do catálogo Sony ausentes na tabela
  missingFromCatalog: MissingCatalogProduct[]
  missingFromCatalogCount: number
}

export interface ScanSourceExecutionResult {
  success: boolean
  auditId?: string
  updatedProductsCount: number
  unchangedProductsCount: number
  stagingCreatedCount: number
  ignored3rdCount: number
  missingCatalogCount: number
  effectiveDate: string
  error?: string
}

export const scanSourceImportService = {
  /**
   * Busca todos os produtos do catálogo (priorizando Sony)
   */
  async fetchCatalogProducts(): Promise<CatalogProductSummary[]> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(
          'id, name, sku, price_nationalized_cost, price_nationalized_currency, price_usd, price_brl, category, category_id, manufacturer_id, is_discontinued',
        )

      if (error) {
        console.error('Erro ao buscar produtos para ScanSource:', error)
        throw error
      }

      return (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        normalizedSku: normalizeSkuKey(p.sku),
        price_nationalized_cost: p.price_nationalized_cost
          ? Number(p.price_nationalized_cost)
          : null,
        price_nationalized_currency: p.price_nationalized_currency || null,
        price_usd: p.price_usd ? Number(p.price_usd) : null,
        price_brl: p.price_brl ? Number(p.price_brl) : null,
        category: p.category || null,
        category_id: p.category_id || null,
        manufacturer_id: p.manufacturer_id || null,
        is_discontinued: Boolean(p.is_discontinued),
      }))
    } catch (e: any) {
      console.error('Falha em fetchCatalogProducts:', e)
      return []
    }
  },

  /**
   * Realiza o cruzamento em memória dos dados parseados com o catálogo
   */
  async buildCrossMatchPreview(
    parseResult: ScanSourceParseResult,
    fileName: string,
    catalogProducts: CatalogProductSummary[],
    categories: CategoryItem[],
  ): Promise<ScanSourceCrossMatchPreview> {
    // Indexa produtos do catálogo pela chave normalizada
    const productByNormSku = new Map<string, CatalogProductSummary>()
    const allSonyProducts: CatalogProductSummary[] = []

    for (const p of catalogProducts) {
      if (p.normalizedSku) {
        // Se houver duplicidade, mantém o primeiro
        if (!productByNormSku.has(p.normalizedSku)) {
          productByNormSku.set(p.normalizedSku, p)
        }
      }
      // Considera Sony por manufacturer_id ou por marca/SKU característico
      allSonyProducts.push(p)
    }

    const matchedItems: MatchedItemPreview[] = []
    const matchedWithChange: MatchedItemPreview[] = []
    const matchedUnchanged: MatchedItemPreview[] = []
    const unmatchedItems: UnmatchedItemPreview[] = []
    const matchedProductIds = new Set<string>()

    const categoryMappings = await categoryImportStagingService.getCategoryMappings()

    for (const row of parseResult.validRows) {
      const normModel = row.normalizedModel
      const matchedProd = normModel ? productByNormSku.get(normModel) : undefined

      if (matchedProd && row.priceUsdSt !== null) {
        matchedProductIds.add(matchedProd.id)
        const currentCost = matchedProd.price_nationalized_cost
        const currentCurrency = matchedProd.price_nationalized_currency
        const newCost = row.priceUsdSt
        const isSameCurrency = currentCurrency === 'Nacionalizado USD'
        const isSamePrice =
          currentCost !== null && isSameCurrency && Math.abs(currentCost - newCost) < 0.005

        const hasPriceChange = !isSamePrice
        const diffUsd = currentCost !== null ? roundToTwoDecimals(newCost - currentCost) : newCost

        const matchEntry: MatchedItemPreview = {
          product: matchedProd,
          row,
          currentCostUsd: currentCost,
          currentCurrency,
          newCostUsd: newCost,
          hasPriceChange,
          diffUsd,
        }

        matchedItems.push(matchEntry)
        if (hasPriceChange) {
          matchedWithChange.push(matchEntry)
        } else {
          matchedUnchanged.push(matchEntry)
        }
      } else {
        // Não casado -> preparar sugestão de categoria
        const catMatch = categoryImportStagingService.resolveCategoryMatch({
          rawCategory: null,
          productName: row.description || row.model,
          productDescription: row.description,
          productNcm: row.ncmSuggested,
          categories,
          mappings: categoryMappings,
        })

        // Calcula até 5 melhores candidatos do catálogo por similaridade
        const candidates = findTopCandidatesForUnmatchedRow(
          row.model,
          row.description,
          catalogProducts,
          5,
        )

        unmatchedItems.push({
          row,
          suggestedCategoryId: catMatch.suggestedCategoryId,
          suggestedCategoryName: catMatch.suggestedCategoryName,
          suggestionConfidence: catMatch.confidence,
          suggestionReason: catMatch.reason,
          candidates,
        })
      }
    }

    // Amostra de destaque PXWX400KC para o usuário conferir na tela US$ 22.934,47
    const pxwSample = matchedItems.find(
      (m) => m.row.normalizedModel === 'PXWX400KC' || m.product.normalizedSku === 'PXWX400KC',
    )

    // Produtos Sony do catálogo que NÃO apareceram na planilha (não desativados)
    const missingFromCatalog: MissingCatalogProduct[] = []
    for (const p of catalogProducts) {
      if (!p.is_discontinued && p.normalizedSku && !matchedProductIds.has(p.id)) {
        // Filtra para Sony (ou todos do catálogo com SKU compatível)
        const isSony =
          p.manufacturer_id === '7d96d4ce-2f62-44ce-80e5-cab07efa7914' ||
          p.name.toLowerCase().includes('sony')
        if (isSony) {
          const similarTableRows = findSimilarTableRowsForCatalogProduct(
            p.sku,
            p.name,
            parseResult.validRows,
            3,
          )

          missingFromCatalog.push({
            id: p.id,
            name: p.name,
            sku: p.sku,
            category: p.category,
            price_nationalized_cost: p.price_nationalized_cost,
            price_nationalized_currency: p.price_nationalized_currency,
            price_usd: p.price_usd,
            similarTableRows,
          })
        }
      }
    }

    return {
      effectiveDate: parseResult.effectiveDate,
      fileName,
      totalRows: parseResult.totalRowsFound,
      matchedItems,
      matchedWithChange,
      matchedUnchanged,
      matchedCount: matchedItems.length,
      matchedWithChangeCount: matchedWithChange.length,
      matchedUnchangedCount: matchedUnchanged.length,
      pxwSample,
      unmatchedItems,
      unmatchedCount: unmatchedItems.length,
      softwareCount: parseResult.softwareCount,
      ignored3rdCount: parseResult.ignored3rdCount,
      anomalies: parseResult.anomalyRows,
      anomaliesCount: parseResult.anomalyRows.length,
      missingFromCatalog,
      missingFromCatalogCount: missingFromCatalog.length,
    }
  },

  /**
   * Executa a gravação real após confirmação do usuário:
   * 1. Atualiza produtos casados (price_nationalized_cost = coluna D, currency = 'Nacionalizado USD')
   *    NUNCA altera price_usd nem price_brl nem price_nationalized_sales
   * 2. Insere produtos não casados na tabela product_import_staging com batch_source='scansource'
   * 3. Grava registro de auditoria em scansource_import_audits
   */
  async executeConfirmedImport(
    preview: ScanSourceCrossMatchPreview,
    currentUserId?: string,
    onProgress?: (step: string, percent: number) => void,
  ): Promise<ScanSourceExecutionResult> {
    try {
      const batchId = `scansource_${Date.now()}`
      const totalUpdates = preview.matchedWithChange.length
      let updatedCount = 0

      // 1. Atualizar em lotes de 15 os produtos casados que mudaram
      onProgress?.('Atualizando preços de custo nacionalizado em USD...', 10)

      const CHUNK_SIZE = 15
      for (let i = 0; i < totalUpdates; i += CHUNK_SIZE) {
        const chunk = preview.matchedWithChange.slice(i, i + CHUNK_SIZE)

        await Promise.all(
          chunk.map(async (item) => {
            const { error } = await supabase
              .from('products')
              .update({
                price_nationalized_cost: item.newCostUsd,
                price_nationalized_currency: 'Nacionalizado USD',
                // NUNCA tocar em price_usd, price_brl ou price_nationalized_sales
              })
              .eq('id', item.product.id)

            if (!error) {
              updatedCount++
            } else {
              console.warn(`Falha ao atualizar custo de ${item.product.sku}:`, error.message)
            }
          }),
        )

        const pct = 10 + Math.round(((i + chunk.length) / Math.max(1, totalUpdates)) * 40)
        onProgress?.(
          `Atualizados ${Math.min(i + chunk.length, totalUpdates)}/${totalUpdates} produtos casados...`,
          pct,
        )
      }

      // 2. Inserir não-casados na tabela de staging
      onProgress?.('Enviando itens não casados para a fila de revisão...', 55)

      let stagingCount = 0
      if (preview.unmatchedItems.length > 0) {
        const stagingPayload = preview.unmatchedItems.map((u) => ({
          batch_id: batchId,
          batch_source: 'scansource' as any,
          sku: u.row.model || null,
          name: u.row.description || `Sony ${u.row.model}`,
          brand_name: 'Sony',
          price_usd: 0,
          price_cost: 0,
          price_brl: 0,
          price_nationalized_cost: u.row.priceUsdSt,
          price_nationalized_currency: 'Nacionalizado USD',
          ncm: u.row.ncmSuggested || null,
          description: u.row.description || null,
          technical_info: `Importado via ScanSource (Tipo: ${u.row.itemType}, Vigência: ${preview.effectiveDate})`,
          original_category: `Sony ScanSource (${u.row.itemType})`,
          suggested_category_id: u.suggestedCategoryId,
          suggested_category_name: u.suggestedCategoryName,
          suggestion_confidence: u.suggestionConfidence,
          suggestion_reason: u.suggestionReason,
          status: 'pending' as const,
          raw_payload: {
            source: 'scansource',
            model: u.row.model,
            rawPrice: u.row.rawPriceUsdSt,
            itemType: u.row.itemType,
            rowIndex: u.row.rowIndex,
            effectiveDate: preview.effectiveDate,
            hasCandidates: u.candidates && u.candidates.length > 0,
            candidatesCount: u.candidates?.length || 0,
          },
        }))

        // Insere em chunks de 50
        for (let j = 0; j < stagingPayload.length; j += 50) {
          const slice = stagingPayload.slice(j, j + 50)
          const insRes = await categoryImportStagingService.insertStagingBatch(slice)
          if (insRes.success) {
            stagingCount += insRes.insertedCount
          }
          const pct = 55 + Math.round(((j + slice.length) / stagingPayload.length) * 35)
          onProgress?.(
            `Enviados ${Math.min(j + slice.length, stagingPayload.length)}/${stagingPayload.length} não casados para revisão...`,
            pct,
          )
        }
      }

      // 3. Gravar registro de auditoria
      onProgress?.('Gravando registro de auditoria da importação...', 95)

      let auditId: string | undefined
      try {
        const auditPayload = {
          file_name: preview.fileName,
          effective_date: preview.effectiveDate,
          total_sheet_rows: preview.totalRows,
          matched_count: preview.matchedCount,
          updated_count: updatedCount,
          unchanged_count: preview.matchedUnchangedCount,
          ignored_sw_count: 0, // SW entra como atualização de custo conforme regra aprovada
          ignored_3rd_count: preview.ignored3rdCount,
          staging_pending_count: stagingCount,
          anomalies_count: preview.anomaliesCount,
          missing_catalog_count: preview.missingFromCatalogCount,
          details: {
            batchId,
            softwareCount: preview.softwareCount,
            pxwSampleCost: preview.pxwSample?.newCostUsd,
            missingCatalogSample: preview.missingFromCatalog.slice(0, 10),
            anomaliesSample: preview.anomalies.slice(0, 10),
          },
          executed_by: currentUserId || null,
        }

        const { data: auditData, error: auditErr } = await (supabase as any)
          .from('scansource_import_audits')
          .insert(auditPayload)
          .select('id')
          .single()

        if (!auditErr && auditData) {
          auditId = auditData.id
        }
      } catch (e) {
        console.warn('Falha ao gravar auditoria scansource_import_audits:', e)
      }

      onProgress?.('Importação ScanSource concluída com sucesso!', 100)

      return {
        success: true,
        auditId,
        updatedProductsCount: updatedCount,
        unchangedProductsCount: preview.matchedUnchangedCount,
        stagingCreatedCount: stagingCount,
        ignored3rdCount: preview.ignored3rdCount,
        missingCatalogCount: preview.missingFromCatalogCount,
        effectiveDate: preview.effectiveDate,
      }
    } catch (err: any) {
      console.error('Erro na execução da importação ScanSource:', err)
      return {
        success: false,
        updatedProductsCount: 0,
        unchangedProductsCount: 0,
        stagingCreatedCount: 0,
        ignored3rdCount: 0,
        missingCatalogCount: 0,
        effectiveDate: preview.effectiveDate,
        error: err?.message || 'Erro desconhecido ao executar importação ScanSource',
      }
    }
  },

  /**
   * Gera o CSV do relatório de produtos ativos do catálogo ausentes na tabela
   */
  exportMissingCatalogCsv(items: MissingCatalogProduct[]): string {
    const headers = [
      'SKU',
      'Nome do Produto',
      'Categoria',
      'Custo Nacionalizado Atual (USD)',
      'Moeda Custo',
      'Preço de Venda USD (price_usd)',
    ]

    const rows = items.map((it) => [
      `"${(it.sku || '').replace(/"/g, '""')}"`,
      `"${(it.name || '').replace(/"/g, '""')}"`,
      `"${(it.category || '').replace(/"/g, '""')}"`,
      it.price_nationalized_cost !== null ? it.price_nationalized_cost.toFixed(2) : '',
      `"${(it.price_nationalized_currency || '').replace(/"/g, '""')}"`,
      it.price_usd !== null ? it.price_usd.toFixed(2) : '',
    ])

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  },

  /**
   * Vincula diretamente uma linha da tabela ScanSource a um produto existente do catálogo.
   * Aplica o custo nacionalizado USD (coluna D) com a vigência especificada (padrão 'JAN 2nd 2025'),
   * grava na auditoria com origem "vinculado" e NUNCA altera price_usd nem preço de venda.
   */
  async linkTableRowToProduct(params: {
    productId: string
    newCostUsd: number
    effectiveDate?: string
    tableModel: string
    rowDescription?: string
    userId?: string
  }): Promise<{ success: boolean; error?: string }> {
    const {
      productId,
      newCostUsd,
      effectiveDate = 'JAN 2nd 2025',
      tableModel,
      rowDescription,
      userId,
    } = params

    try {
      if (newCostUsd < 0 || isNaN(newCostUsd)) {
        throw new Error('O valor de custo nacionalizado deve ser um número positivo.')
      }

      // 1. Atualizar produto em `products` (apenas custo nacionalizado)
      const { data: updatedProd, error: updateErr } = await supabase
        .from('products')
        .update({
          price_nationalized_cost: roundToTwoDecimals(newCostUsd),
          price_nationalized_currency: 'Nacionalizado USD',
          // Invariante de integridade: NUNCA alterar price_usd, price_brl ou price_nationalized_sales
        })
        .eq('id', productId)
        .select('id, name, sku, price_usd')
        .single()

      if (updateErr) {
        console.error('Erro ao vincular produto existente:', updateErr)
        throw new Error(updateErr.message)
      }

      // 2. Registrar evento na auditoria scansource_import_audits com origem 'vinculado'
      try {
        await (supabase as any).from('scansource_import_audits').insert({
          file_name: `Vinculação Manual: ${tableModel} -> ${updatedProd?.sku || productId}`,
          effective_date: effectiveDate,
          total_sheet_rows: 1,
          matched_count: 1,
          updated_count: 1,
          unchanged_count: 0,
          details: {
            origin: 'vinculado',
            action: 'link_to_existing_product',
            productId,
            productSku: updatedProd?.sku,
            productName: updatedProd?.name,
            tableModel,
            rowDescription,
            appliedCostUsd: roundToTwoDecimals(newCostUsd),
            effectiveDate,
          },
          executed_by: userId || null,
        })
      } catch (auditErr) {
        console.warn('Falha não-bloqueante ao registrar auditoria de vinculação:', auditErr)
      }

      return { success: true }
    } catch (e: any) {
      console.error('Erro em linkTableRowToProduct:', e)
      return { success: false, error: e?.message || 'Falha ao vincular produto' }
    }
  },

  /**
   * Grava custo nacionalizado USD manual para um produto existente
   * (usado na ação 'Informar custo' dos ausentes ou edição direta).
   * Origem na auditoria é gravada como "manual" e NUNCA toca em price_usd nem preço de venda.
   * Se costUsd for nulo ou vazio, não altera nem bloqueia.
   */
  async updateManualNationalizedCost(params: {
    productId: string
    costUsd: number | null
    effectiveDate?: string
    notes?: string
    userId?: string
  }): Promise<{ success: boolean; error?: string }> {
    const { productId, costUsd, effectiveDate = 'JAN 2nd 2025', notes, userId } = params

    // Se nulo ou não fornecido, operação válida sem alteração (opcionalidade estrita)
    if (costUsd === null || costUsd === undefined) {
      return { success: true }
    }

    if (costUsd < 0 || isNaN(costUsd)) {
      return { success: false, error: 'O custo deve ser um número positivo.' }
    }

    try {
      const { data: updatedProd, error: updateErr } = await supabase
        .from('products')
        .update({
          price_nationalized_cost: roundToTwoDecimals(costUsd),
          price_nationalized_currency: 'Nacionalizado USD',
          // NUNCA altera price_usd nem price_brl
        })
        .eq('id', productId)
        .select('id, name, sku, price_usd')
        .single()

      if (updateErr) throw new Error(updateErr.message)

      try {
        await (supabase as any).from('scansource_import_audits').insert({
          file_name: `Custo Manual: ${updatedProd?.sku || productId}`,
          effective_date: effectiveDate,
          total_sheet_rows: 1,
          matched_count: 0,
          updated_count: 1,
          unchanged_count: 0,
          details: {
            origin: 'manual',
            action: 'manual_cost_input',
            productId,
            productSku: updatedProd?.sku,
            productName: updatedProd?.name,
            appliedCostUsd: roundToTwoDecimals(costUsd),
            effectiveDate,
            notes,
          },
          executed_by: userId || null,
        })
      } catch (auditErr) {
        console.warn('Falha não-bloqueante na auditoria de custo manual:', auditErr)
      }

      return { success: true }
    } catch (e: any) {
      console.error('Erro em updateManualNationalizedCost:', e)
      return { success: false, error: e?.message || 'Falha ao atualizar custo manual' }
    }
  },

  /**
   * Atualiza o custo nacionalizado em um registro da staging table (área de revisão)
   * antes ou durante a revisão de categoria.
   */
  async updateStagingNationalizedCost(
    stagingId: string,
    costUsd: number | null,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await (supabase as any)
        .from('product_import_staging')
        .update({
          price_nationalized_cost: costUsd !== null ? roundToTwoDecimals(costUsd) : null,
          price_nationalized_currency: costUsd !== null ? 'Nacionalizado USD' : 'BRL',
          updated_at: new Date().toISOString(),
        })
        .eq('id', stagingId)

      if (error) throw error
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message || 'Falha ao atualizar custo na staging' }
    }
  },

  /**
   * Busca histórico de auditorias
   */
  async fetchRecentAudits(): Promise<any[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('scansource_import_audits')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) return []
      return data || []
    } catch (e) {
      return []
    }
  },
}
