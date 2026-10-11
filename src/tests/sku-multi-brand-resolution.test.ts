import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  skuStandardizationService,
  analyzeProductsSku,
} from '@/services/skuStandardizationService'
import { normalizeSkuKey } from '@/utils/sku-normalization'

// Mock do supabase client
vi.mock('@/lib/supabase/client', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  }
})

import { supabase } from '@/lib/supabase/client'

describe('Central de Duplicidades — Resolução Multi-Marca de Colisões', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Deteção e Análise Pura de Colisões Multi-Marca', () => {
    it('detecta colisão AJA (ROI-HDMI vs MFR # ROI-HDMI) e sugere o prevalente oficial sem prefixo MFR', () => {
      const ajaMfrId = 'mfr-aja-001'
      const rawProducts = [
        {
          id: 'prod-aja-1',
          name: 'AJA ROI-HDMI Mini-Converter to 3G-SDI',
          sku: 'ROI-HDMI',
          manufacturer_id: ajaMfrId,
          price_usd: 1295,
          price_cost: 950,
          is_discontinued: false,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
          last_reviewed_at: null,
        },
        {
          id: 'prod-aja-2',
          name: 'AJA ROI-HDMI Mini-Converter to 3G-SDI',
          sku: 'MFR # ROI-HDMI',
          manufacturer_id: ajaMfrId,
          price_usd: 1295,
          price_cost: 950,
          is_discontinued: false,
          created_at: '2025-01-02T00:00:00Z',
          updated_at: '2025-01-02T00:00:00Z',
          last_reviewed_at: null,
        },
      ]

      const mfrMap = new Map<string, string>([[ajaMfrId, 'AJA']])

      const result = analyzeProductsSku(rawProducts, mfrMap, [])
      expect(result.otherCollisions).toHaveLength(1)

      const ajaCollision = result.otherCollisions[0]
      expect(ajaCollision.brand).toBe('AJA')
      expect(ajaCollision.normalizedSku).toBe('ROIHDMI')
      expect(ajaCollision.products).toHaveLength(2)

      // Sugere o SKU sem o prefixo "MFR #"
      expect(ajaCollision.suggestedPreferredId).toBe('prod-aja-1')
    })

    it('detecta colisão Blackmagic (BDLKWEB/C/SEDHD vs BDLKWEBCSEDHD) com preços divergentes', () => {
      const bmdMfrId = 'mfr-bmd-001'
      const rawProducts = [
        {
          id: 'prod-bmd-1',
          name: 'Blackmagic Design Web Presenter HD',
          sku: 'BDLKWEB/C/SEDHD',
          manufacturer_id: bmdMfrId,
          price_usd: 585,
          price_cost: 410,
          is_discontinued: false,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-02-01T00:00:00Z',
          last_reviewed_at: null,
        },
        {
          id: 'prod-bmd-2',
          name: 'Blackmagic Design Web Presenter HD',
          sku: 'BDLKWEBCSEDHD',
          manufacturer_id: bmdMfrId,
          price_usd: 569,
          price_cost: 399,
          is_discontinued: false,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-15T00:00:00Z',
          last_reviewed_at: null,
        },
      ]

      const mfrMap = new Map<string, string>([[bmdMfrId, 'Blackmagic Design']])

      const result = analyzeProductsSku(rawProducts, mfrMap, [])
      expect(result.otherCollisions).toHaveLength(1)

      const bmdCollision = result.otherCollisions[0]
      expect(bmdCollision.brand).toBe('Blackmagic Design')
      expect(bmdCollision.normalizedSku).toBe('BDLKWEBCSEDHD')
      expect(bmdCollision.products).toHaveLength(2)

      // Mais recente ou ativo prevalece na sugestão inicial
      expect(bmdCollision.suggestedPreferredId).toBe('prod-bmd-1')
    })
  })

  describe('skuStandardizationService.resolveSingleCollision', () => {
    it('executa resolução AJA: mantém ROI-HDMI, redireciona FKs, deleta MFR # ROI-HDMI e mescla campos vazios', async () => {
      const preferred = {
        id: 'prod-aja-1',
        name: 'AJA ROI-HDMI Converter',
        sku: 'ROI-HDMI',
        manufacturer_id: 'mfr-aja-001',
        price_usd: 1295,
        price_cost: 950,
        is_discontinued: false,
        website_url: null, // vazio, deve receber do perdedor
        image_url: 'https://example.com/aja-preferred.jpg',
        ncm: null, // vazio, deve receber
        description: 'Descrição original',
        technical_info: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        last_reviewed_at: null,
      }

      const loser = {
        id: 'prod-aja-2',
        name: 'AJA ROI-HDMI Converter (Scraped)',
        sku: 'MFR # ROI-HDMI',
        manufacturer_id: 'mfr-aja-001',
        price_usd: 1295,
        price_cost: 950,
        is_discontinued: false,
        website_url: 'https://bhphotovideo.com/c/product/123-aja',
        image_url: 'https://example.com/aja-loser.jpg',
        ncm: '85437099',
        description: 'Descrição do perdedor',
        technical_info: 'Specs do perdedor',
        created_at: '2025-01-02T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
        last_reviewed_at: null,
      }

      // Mock chain do Supabase
      const updatedPreferredCalls: any[] = []
      const deletedProductIds: string[] = []
      const redirectedOrderItems: any[] = []
      const redirectedPriceChecks: any[] = []

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'products') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [preferred, loser],
                error: null,
              }),
            }),
            update: vi.fn().mockImplementation((updates: any) => ({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (col === 'id') {
                  updatedPreferredCalls.push({ id: val, updates })
                }
                return Promise.resolve({ error: null })
              }),
            })),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                deletedProductIds.push(val)
                return Promise.resolve({ error: null })
              }),
            }),
          } as any
        }

        if (table === 'order_items') {
          return {
            update: vi.fn().mockImplementation((updates: any) => ({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                redirectedOrderItems.push({ from: val, to: updates.product_id })
                return Promise.resolve({ error: null })
              }),
            })),
          } as any
        }

        if (table === 'price_checks') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'pc-1',
                      checked_at: '2025-02-01T10:00:00Z',
                      status: 'ok',
                      price_db: 1295,
                      price_bh: 1295,
                      message: null,
                      source: 'bh_search',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockImplementation((updates: any) => ({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                redirectedPriceChecks.push({ from: val, to: updates.product_id })
                return Promise.resolve({ error: null })
              }),
            })),
          } as any
        }

        if (table === 'sku_collision_decisions') {
          return {
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          } as any
        }

        // tabelas secundárias padrão (cart_items, favorites, etc.)
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        } as any
      })

      const report = await skuStandardizationService.resolveSingleCollision({
        normalizedSku: 'ROIHDMI',
        brand: 'AJA',
        preferredProductId: 'prod-aja-1',
        secondaryProductIds: ['prod-aja-2'],
        targetSku: 'ROI-HDMI',
      })

      expect(report.success).toBe(true)
      expect(report.preferredProductId).toBe('prod-aja-1')
      expect(report.preferredSkuAfter).toBe('ROI-HDMI')

      // FKs redirecionadas
      expect(redirectedOrderItems).toEqual([{ from: 'prod-aja-2', to: 'prod-aja-1' }])
      expect(redirectedPriceChecks).toEqual([{ from: 'prod-aja-2', to: 'prod-aja-1' }])

      // Perdedor deletado de vez (Opção B)
      expect(deletedProductIds).toContain('prod-aja-2')
      expect(report.deletedProducts).toHaveLength(1)
      expect(report.deletedProducts[0].priceChecksCount).toBe(1)

      // Prevalente atualizado com campos vazios mesclados
      expect(updatedPreferredCalls).toHaveLength(1)
      const updates = updatedPreferredCalls[0].updates
      expect(updates.website_url).toBe('https://bhphotovideo.com/c/product/123-aja')
      expect(updates.ncm).toBe('85437099')
      expect(updates.technical_info).toBe('Specs do perdedor')
      // Não sobrescreve o que já estava preenchido
      expect(updates.description).toBeUndefined()
      expect(updates.image_url).toBeUndefined()

      // Regra de datas: recebeu dados mesclados reais -> updated_at = last_reviewed_at = agora
      expect(updates.updated_at).toBeDefined()
      expect(updates.last_reviewed_at).toBeDefined()
      expect(updates.updated_at).toBe(updates.last_reviewed_at)
    })

    it('executa resolução Blackmagic com alteração deliberada de preço pelo usuário', async () => {
      const preferred = {
        id: 'prod-bmd-1',
        name: 'Blackmagic Web Presenter HD',
        sku: 'BDLKWEB/C/SEDHD',
        manufacturer_id: 'mfr-bmd-001',
        price_usd: 585,
        price_cost: 410,
        is_discontinued: false,
        website_url: 'https://bhphotovideo.com/c/product/456-bmd',
        image_url: 'https://example.com/bmd.jpg',
        ncm: '85437099',
        description: 'Web Presenter HD original',
        technical_info: '1080p stream',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        last_reviewed_at: '2025-01-01T00:00:00Z',
      }

      const loser = {
        id: 'prod-bmd-2',
        name: 'Blackmagic Web Presenter HD (duplicado compacto)',
        sku: 'BDLKWEBCSEDHD',
        manufacturer_id: 'mfr-bmd-001',
        price_usd: 569,
        price_cost: 399,
        is_discontinued: false,
        website_url: null,
        image_url: null,
        ncm: null,
        description: null,
        technical_info: null,
        created_at: '2025-01-02T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
        last_reviewed_at: null,
      }

      const updatedCalls: any[] = []
      const deletedIds: string[] = []

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'products') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [preferred, loser],
                error: null,
              }),
            }),
            update: vi.fn().mockImplementation((updates: any) => ({
              eq: vi.fn().mockImplementation((_col: string, val: string) => {
                updatedCalls.push({ id: val, updates })
                return Promise.resolve({ error: null })
              }),
            })),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((_col: string, val: string) => {
                deletedIds.push(val)
                return Promise.resolve({ error: null })
              }),
            }),
          } as any
        }

        if (table === 'order_items' || table === 'price_checks') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          } as any
        }

        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        } as any
      })

      // Usuário escolhe deliberadamente manter o SKU oficial "BDLKWEB/C/SEDHD" e definir o preço de 585
      const report = await skuStandardizationService.resolveSingleCollision({
        normalizedSku: 'BDLKWEBCSEDHD',
        brand: 'Blackmagic Design',
        preferredProductId: 'prod-bmd-1',
        secondaryProductIds: ['prod-bmd-2'],
        chosenPriceUsd: 585,
        targetSku: 'BDLKWEB/C/SEDHD',
      })

      expect(report.success).toBe(true)
      expect(report.preferredSkuAfter).toBe('BDLKWEB/C/SEDHD')
      expect(deletedIds).toEqual(['prod-bmd-2'])

      // Se o usuário alternar para 569, o preço é atualizado e as datas de revisão são alteradas
      const reportWithNewPrice = await skuStandardizationService.resolveSingleCollision({
        normalizedSku: 'BDLKWEBCSEDHD',
        brand: 'Blackmagic Design',
        preferredProductId: 'prod-bmd-1',
        secondaryProductIds: ['prod-bmd-2'],
        chosenPriceUsd: 569,
        targetSku: 'BDLKWEB/C/SEDHD',
      })

      expect(reportWithNewPrice.priceUpdated).toBe(true)
      expect(reportWithNewPrice.datesUpdated).toBe(true)

      const lastUpdateCall = updatedCalls[updatedCalls.length - 1]
      expect(lastUpdateCall.updates.price_usd).toBe(569)
      expect(lastUpdateCall.updates.updated_at).toBeDefined()
      expect(lastUpdateCall.updates.last_reviewed_at).toBeDefined()
      expect(lastUpdateCall.updates.updated_at).toBe(lastUpdateCall.updates.last_reviewed_at)
    })
  })
})
