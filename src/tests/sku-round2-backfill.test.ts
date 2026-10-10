import { describe, it, expect, vi, beforeEach } from 'vitest'
import { skuStandardizationService } from '@/services/skuStandardizationService'
import { supabase } from '@/lib/supabase/client'
import { formatSonyStandardSku } from '@/utils/sku-normalization'

describe('Rodada 2 - Backfill, Mesclagem e Salvaguardas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('padroniza SKU Sony removendo hífen e mantendo alfanumérico limpo', () => {
    expect(formatSonyStandardSku('ILME-FX2')).toBe('ILMEFX2')
    expect(formatSonyStandardSku('BRU-SF10')).toBe('BRUSF10')
    expect(formatSonyStandardSku('ILME-FR7')).toBe('ILMEFR7')
    expect(formatSonyStandardSku('ILME-FR7K')).toBe('ILMEFR7K')
    expect(formatSonyStandardSku('mfr # ILME-FX3')).toBe('ILMEFX3')
  })

  it('falha com mensagem clara se a tabela sku_collision_decisions não estiver acessível', async () => {
    // Mock do Supabase simulando erro na consulta de sku_collision_decisions
    const mockFrom = vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'sku_collision_decisions') {
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'relation "sku_collision_decisions" does not exist' },
            }),
          }),
        } as any
      }
      return {} as any
    })

    const check = await skuStandardizationService.checkDecisionsTableAccessible()
    expect(check.accessible).toBe(false)
    expect(check.error).toContain('sku_collision_decisions')
    expect(check.error).toContain('SQL Editor do painel Supabase')
    expect(check.error).toContain("NOTIFY pgrst, 'reload schema'")

    mockFrom.mockRestore()
  })

  it('lógica de mesclagem: enriquece prevalente sem sobrescrever dados preenchidos com vazio', async () => {
    // Caso de uso: Par ILME-FR7 e ILMEFR7
    // Prevalente tem name e sku, mas website_url e ncm estão vazios
    // Secundário tem website_url e ncm preenchidos
    const preferredProduct = {
      id: 'e3fea5c6-f801-44b7-a570-f8642e98a00b',
      name: 'Sony FR7 Cinema Line PTZ Camera',
      sku: 'ILME-FR7',
      manufacturer_id: 'mfr-sony',
      price_usd: 9698,
      is_discontinued: false,
      image_url: 'https://example.com/fr7-preferred.jpg',
      website_url: null, // VAZIO no prevalente
      ncm: null, // VAZIO no prevalente
      description: 'Descrição original do prevalente',
      technical_info: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      last_reviewed_at: '2026-01-01T00:00:00Z',
    }

    const secondaryProduct = {
      id: 'ee3f5e2e-5b24-4f43-86d2-65744aa2c906',
      name: 'Sony FR7 Camera PTZ (Secundário)',
      sku: 'ILMEFR7',
      manufacturer_id: 'mfr-sony',
      price_usd: 9698,
      is_discontinued: false,
      image_url: 'https://example.com/fr7-secondary.jpg',
      website_url: 'https://www.bhphotovideo.com/c/product/1726053-REG/sony_ilme_fr7_fr7_cinema_line_ptz.html', // MAIS ATUALIZADO
      ncm: '85258919', // MAIS ATUALIZADO
      description: 'Outra descrição menos relevante',
      technical_info: 'Specs completas secundário',
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
      last_reviewed_at: '2026-02-01T00:00:00Z',
    }

    const updatesCaptured: Record<string, any> = {}
    const deactivatedCaptured: Record<string, any>[] = []

    const mockFrom = vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'manufacturers') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'mfr-sony', name: 'Sony' }],
            error: null,
          }),
        } as any
      }
      if (table === 'sku_collision_decisions') {
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [{ id: 'dec-1' }], error: null }),
            then: (resolve: any) =>
              resolve({
                data: [
                  {
                    id: 'dec-1',
                    normalized_sku: 'ILMEFR7',
                    brand: 'Sony',
                    is_sony: true,
                    decision_type: 'keep_preferred',
                    preferred_product_id: preferredProduct.id,
                    secondary_product_ids: [secondaryProduct.id],
                  },
                ],
                error: null,
              }),
          }),
        } as any
      }
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: [preferredProduct, secondaryProduct],
              error: null,
            }),
          }),
          update: vi.fn().mockImplementation((payload: any) => {
            return {
              eq: vi.fn().mockImplementation((field: string, id: string) => {
                if (id === preferredProduct.id) {
                  Object.assign(updatesCaptured, payload)
                } else if (id === secondaryProduct.id) {
                  deactivatedCaptured.push({ id, payload })
                }
                return Promise.resolve({ error: null })
              }),
            }
          }),
        } as any
      }
      return {} as any
    })

    const report = await skuStandardizationService.executeRound2Backfill()

    expect(report.success).toBe(true)
    expect(report.mergedGroups.length).toBe(1)
    const mergeResult = report.mergedGroups[0]
    expect(mergeResult.preferredProductId).toBe(preferredProduct.id)

    // O prevalente deve ter recebido website_url e ncm do secundário
    expect(updatesCaptured.website_url).toBe(secondaryProduct.website_url)
    expect(updatesCaptured.ncm).toBe(secondaryProduct.ncm)
    expect(updatesCaptured.technical_info).toBe(secondaryProduct.technical_info)

    // O prevalente NÃO deve ter sobrescrito image_url nem description porque já estavam preenchidos
    expect(updatesCaptured.image_url).toBeUndefined()
    expect(updatesCaptured.description).toBeUndefined()

    // O SKU do prevalente foi normalizado para o padrão sem traço
    expect(updatesCaptured.sku).toBe('ILMEFR7')

    // Como o prevalente de fato RECEBEU dados mesclados (website_url, ncm, technical_info),
    // ele recebe updated_at = last_reviewed_at = agora
    expect(updatesCaptured.updated_at).toBeDefined()
    expect(updatesCaptured.last_reviewed_at).toBeDefined()
    expect(updatesCaptured.updated_at).toBe(updatesCaptured.last_reviewed_at)

    // NUNCA tocar em price_usd
    expect(updatesCaptured.price_usd).toBeUndefined()

    // O secundário foi desativado (is_discontinued = true) sem DELETE
    // O perdedor desativado NÃO recebe marcação de datas (updated_at e last_reviewed_at NÃO devem estar no payload)
    expect(deactivatedCaptured.length).toBe(1)
    expect(deactivatedCaptured[0].id).toBe(secondaryProduct.id)
    expect(deactivatedCaptured[0].payload.is_discontinued).toBe(true)
    expect(deactivatedCaptured[0].payload.updated_at).toBeUndefined()
    expect(deactivatedCaptured[0].payload.last_reviewed_at).toBeUndefined()

    mockFrom.mockRestore()
  })

  it('renames de SKU (backfill do traço) alteram APENAS o campo sku sem tocar em updated_at ou last_reviewed_at', async () => {
    const singleProductWithDash = {
      id: 'prod-single-sony-1',
      name: 'Sony Camcorder FX6',
      sku: 'ILME-FX6V',
      manufacturer_id: 'mfr-sony',
      price_usd: 5998,
      is_discontinued: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-02-15T10:00:00Z',
      last_reviewed_at: '2026-02-15T10:00:00Z',
    }

    const updatesCaptured: Record<string, any>[] = []

    const mockFrom = vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'manufacturers') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'mfr-sony', name: 'Sony' }],
            error: null,
          }),
        } as any
      }
      if (table === 'sku_collision_decisions') {
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [{ id: 'dec-1' }], error: null }),
            then: (resolve: any) => resolve({ data: [], error: null }),
          }),
        } as any
      }
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: [singleProductWithDash],
              error: null,
            }),
          }),
          update: vi.fn().mockImplementation((payload: any) => {
            updatesCaptured.push(payload)
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            }
          }),
        } as any
      }
      return {} as any
    })

    const report = await skuStandardizationService.executeRound2Backfill()

    expect(report.success).toBe(true)
    expect(report.totalSonyRenamed).toBe(1)
    expect(report.renamedItems.length).toBe(1)
    expect(report.renamedItems[0].oldSku).toBe('ILME-FX6V')
    expect(report.renamedItems[0].newSku).toBe('ILMEFX6V')

    // O UPDATE disparado para o rename deve conter APENAS o campo sku
    expect(updatesCaptured.length).toBe(1)
    expect(updatesCaptured[0]).toEqual({ sku: 'ILMEFX6V' })
    expect(updatesCaptured[0].updated_at).toBeUndefined()
    expect(updatesCaptured[0].last_reviewed_at).toBeUndefined()

    mockFrom.mockRestore()
  })

  it('prevalente em colisão sem nada a mesclar altera apenas sku sem tocar nas datas dele', async () => {
    // Ambos produtos possuem todos os campos já preenchidos igualmente ou secundário sem novos dados
    const prefProduct = {
      id: 'pref-complete-1',
      name: 'Sony Alpha 1 Camera',
      sku: 'ILCE-1',
      manufacturer_id: 'mfr-sony',
      price_usd: 6498,
      is_discontinued: false,
      image_url: 'https://example.com/a1.jpg',
      website_url: 'https://www.bhphotovideo.com/c/product/123-REG/sony_ilce1.html',
      ncm: '85258919',
      description: 'Descrição completa oficial',
      technical_info: 'Specs completas',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
      last_reviewed_at: '2026-02-01T00:00:00Z',
    }

    const secProduct = {
      id: 'sec-redundant-1',
      name: 'Sony Alpha 1 (Duplicata)',
      sku: 'ILCE1',
      manufacturer_id: 'mfr-sony',
      price_usd: 6498,
      is_discontinued: false,
      image_url: 'https://example.com/a1.jpg',
      website_url: null,
      ncm: null,
      description: null,
      technical_info: null,
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
      last_reviewed_at: '2026-02-01T00:00:00Z',
    }

    const updatesCaptured: Record<string, any> = {}
    const deactivatedCaptured: Record<string, any>[] = []

    const mockFrom = vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'manufacturers') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'mfr-sony', name: 'Sony' }],
            error: null,
          }),
        } as any
      }
      if (table === 'sku_collision_decisions') {
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [{ id: 'dec-1' }], error: null }),
            then: (resolve: any) =>
              resolve({
                data: [
                  {
                    id: 'dec-1',
                    normalized_sku: 'ILCE1',
                    brand: 'Sony',
                    is_sony: true,
                    decision_type: 'keep_preferred',
                    preferred_product_id: prefProduct.id,
                    secondary_product_ids: [secProduct.id],
                  },
                ],
                error: null,
              }),
          }),
        } as any
      }
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: [prefProduct, secProduct],
              error: null,
            }),
          }),
          update: vi.fn().mockImplementation((payload: any) => {
            return {
              eq: vi.fn().mockImplementation((field: string, id: string) => {
                if (id === prefProduct.id) {
                  Object.assign(updatesCaptured, payload)
                } else if (id === secProduct.id) {
                  deactivatedCaptured.push({ id, payload })
                }
                return Promise.resolve({ error: null })
              }),
            }
          }),
        } as any
      }
      return {} as any
    })

    const report = await skuStandardizationService.executeRound2Backfill()

    expect(report.success).toBe(true)
    expect(report.mergedGroups.length).toBe(1)
    expect(report.mergedGroups[0].mergedFields.length).toBe(0) // Nada a mesclar

    // O prevalente teve apenas o SKU normalizado para 'ILCE1'
    expect(updatesCaptured.sku).toBe('ILCE1')

    // Como NÃO recebeu nenhum dado mesclado novo, NÃO toca nas datas do prevalente
    expect(updatesCaptured.updated_at).toBeUndefined()
    expect(updatesCaptured.last_reviewed_at).toBeUndefined()

    // O perdedor secundário é desativado sem marcação de datas
    expect(deactivatedCaptured.length).toBe(1)
    expect(deactivatedCaptured[0].payload).toEqual({ is_discontinued: true })

    mockFrom.mockRestore()
  })

  it('idempotência: rodar novamente não duplica nem regrava quem já está conforme e desativado', async () => {
    // Supondo que a base já foi tratada:
    // Prevalente já tem SKU 'ILMEFR7' (sem traço)
    // Secundário já está desativado (is_discontinued = true)
    const treatedPreferred = {
      id: 'e3fea5c6-f801-44b7-a570-f8642e98a00b',
      name: 'Sony FR7 Cinema Line PTZ Camera',
      sku: 'ILMEFR7', // Já sem traço
      manufacturer_id: 'mfr-sony',
      price_usd: 9698,
      is_discontinued: false,
      image_url: 'https://example.com/fr7.jpg',
      website_url: 'https://www.bhphotovideo.com/c/product/1726053-REG/sony_ilme_fr7_fr7_cinema_line_ptz.html',
      ncm: '85258919',
      description: 'Desc',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
      last_reviewed_at: '2026-10-10T00:00:00Z',
    }

    const treatedSecondary = {
      id: 'ee3f5e2e-5b24-4f43-86d2-65744aa2c906',
      name: 'Sony FR7 Camera PTZ (Secundário)',
      sku: 'ILMEFR7',
      manufacturer_id: 'mfr-sony',
      price_usd: 9698,
      is_discontinued: true, // Já desativado
      image_url: 'https://example.com/fr7-secondary.jpg',
      website_url: 'https://www.bhphotovideo.com/c/product/1726053-REG/sony_ilme_fr7_fr7_cinema_line_ptz.html',
      ncm: '85258919',
      description: 'Desc',
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
      last_reviewed_at: '2026-10-10T00:00:00Z',
    }

    let updateCount = 0

    const mockFrom = vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'manufacturers') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'mfr-sony', name: 'Sony' }],
            error: null,
          }),
        } as any
      }
      if (table === 'sku_collision_decisions') {
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [{ id: 'dec-1' }], error: null }),
            then: (resolve: any) =>
              resolve({
                data: [
                  {
                    id: 'dec-1',
                    normalized_sku: 'ILMEFR7',
                    brand: 'Sony',
                    is_sony: true,
                    decision_type: 'keep_preferred',
                    preferred_product_id: treatedPreferred.id,
                    secondary_product_ids: [treatedSecondary.id],
                  },
                ],
                error: null,
              }),
          }),
        } as any
      }
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: [treatedPreferred, treatedSecondary],
              error: null,
            }),
          }),
          update: vi.fn().mockImplementation(() => {
            updateCount++
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            }
          }),
        } as any
      }
      return {} as any
    })

    const preview = await skuStandardizationService.getBackfillPreview()
    expect(preview.renamesCount).toBe(0) // Nenhum rename novo necessário
    expect(preview.mergesPreview[0]?.fieldsToMerge.length).toBe(0) // Nenhum campo novo a mesclar

    mockFrom.mockRestore()
  })

  it('colisões sem decisão (undecided) são puladas e reportadas', async () => {
    const p1 = {
      id: 'undec-1',
      name: 'Sony Cam Undecided 1',
      sku: 'CAM-U1',
      manufacturer_id: 'mfr-sony',
      created_at: '2026-01-01T00:00:00Z',
    }
    const p2 = {
      id: 'undec-2',
      name: 'Sony Cam Undecided 2',
      sku: 'CAMU1',
      manufacturer_id: 'mfr-sony',
      created_at: '2026-01-02T00:00:00Z',
    }

    const mockFrom = vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'manufacturers') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'mfr-sony', name: 'Sony' }],
            error: null,
          }),
        } as any
      }
      if (table === 'sku_collision_decisions') {
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [{ id: 'dec-1' }], error: null }),
            then: (resolve: any) => resolve({ data: [], error: null }),
          }),
        } as any
      }
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: [p1, p2],
              error: null,
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        } as any
      }
      return {} as any
    })

    const preview = await skuStandardizationService.getBackfillPreview()
    expect(preview.skippedCollisionsCount).toBe(1)
    expect(preview.skippedCollisions[0].normalizedSku).toBe('CAMU1')
    expect(preview.skippedCollisions[0].reason).toBe('undecided')

    // O produto p1 com traço NÃO pode ser renomeado porque está em colisão sem decisão
    expect(preview.renamesCount).toBe(0)

    mockFrom.mockRestore()
  })
})
