import { describe, it, expect } from 'vitest'
import {
  normalizeSkuKey,
  normalizeBhSkuKey,
  matchBhSkuWithDatabase,
  formatSonyStandardSku,
  hasSkuDash,
  isSonyBrand,
} from '@/utils/sku-normalization'
import {
  normalizeSonySku,
  normalizeSkuForBrand,
} from '@/utils/sku-normalize'

describe('sku-normalization utility', () => {
  describe('normalizeSkuKey', () => {
    it('normalizes Sony SKUs removing dash, spaces and making uppercase', () => {
      expect(normalizeSkuKey('BRU-SF10')).toBe('BRUSF10')
      expect(normalizeSkuKey('bru-sf10')).toBe('BRUSF10')
      expect(normalizeSkuKey('ILME-FX2')).toBe('ILMEFX2')
      expect(normalizeSkuKey('ILME-FX3')).toBe('ILMEFX3')
      expect(normalizeSkuKey('ILCE-7RM5')).toBe('ILCE7RM5')
    })

    it('handles SKUs with prefix "MFR #"', () => {
      expect(normalizeSkuKey('MFR #SEL300F28GM')).toBe('SEL300F28GM')
      expect(normalizeSkuKey('mfr # MRW-G3')).toBe('MRWG3')
    })

    it('handles non-Sony brands identically for key comparison', () => {
      expect(normalizeSkuKey('BMD-CINECAMPOCHDF4K')).toBe('BMDCINECAMPOCHDF4K')
      expect(normalizeSkuKey('CONVCMIC/HS03G/WPSU')).toBe('CONVCMICHS03GWPSU')
      expect(normalizeSkuKey('DV/RESFB/BRNK')).toBe('DVRESFBBRNK')
    })

    it('matches Rodada 4 SQL normalize_sku_key rules on real collisions (AJA & Blackmagic)', () => {
      // Caso 1: AJA (MFR # ROI-HDMI vs ROI-HDMI)
      expect(normalizeSkuKey('ROI-HDMI')).toBe('ROIHDMI')
      expect(normalizeSkuKey('MFR # ROI-HDMI')).toBe('ROIHDMI')
      expect(normalizeSkuKey('mfr # ROI-HDMI')).toBe('ROIHDMI')
      expect(normalizeSkuKey('MFR#ROI-HDMI')).toBe('ROIHDMI')
      // Caso 2: Blackmagic Design (BDLKWEB/C/SEDHD vs BDLKWEBCSEDHD)
      expect(normalizeSkuKey('BDLKWEB/C/SEDHD')).toBe('BDLKWEBCSEDHD')
      expect(normalizeSkuKey('BDLKWEBCSEDHD')).toBe('BDLKWEBCSEDHD')
    })

    it('returns empty string on empty or non-string input', () => {
      expect(normalizeSkuKey('')).toBe('')
      expect(normalizeSkuKey(null)).toBe('')
      expect(normalizeSkuKey(undefined)).toBe('')
      expect(normalizeSkuKey(12345)).toBe('')
    })
  })

  describe('formatSonyStandardSku', () => {
    it('formats Sony SKU to standardized physical form (no dashes, uppercase)', () => {
      expect(formatSonyStandardSku('BRU-SF10')).toBe('BRUSF10')
      expect(formatSonyStandardSku('ILME-FX2')).toBe('ILMEFX2')
      expect(formatSonyStandardSku('MFR # MRW-G3')).toBe('MRWG3')
    })
  })

  describe('normalizeBhSkuKey & matchBhSkuWithDatabase (B&H integration)', () => {
    it('normalizes B&H SKU keys removing manufacturer prefix SO for Sony', () => {
      // Casos de regressão obrigatórios B&H:
      // A B&H exibe BH #SOBRUSF10 (prefixo SO do fabricante) e MFR #BRU-SF10
      expect(normalizeBhSkuKey('SOBRUSF10', true)).toBe('BRUSF10')
      expect(normalizeBhSkuKey('SOBRUSF10', false)).toBe('BRUSF10')
      expect(normalizeBhSkuKey('SOILMEFX2', true)).toBe('ILMEFX2')
    })

    it('matches B&H MFR and internal SKUs with database SKUs correctly', () => {
      // BRU-SF10 vs BRUSF10
      expect(matchBhSkuWithDatabase('BRU-SF10', 'BRUSF10', true)).toBe(true)
      expect(matchBhSkuWithDatabase('BRUSF10', 'BRU-SF10', true)).toBe(true)

      // BH #SOBRUSF10 vs DB BRUSF10 e DB BRU-SF10
      expect(matchBhSkuWithDatabase('SOBRUSF10', 'BRUSF10', true)).toBe(true)
      expect(matchBhSkuWithDatabase('SOBRUSF10', 'BRU-SF10', true)).toBe(true)

      // ILME-FX2 vs ILMEFX2
      expect(matchBhSkuWithDatabase('ILME-FX2', 'ILMEFX2', true)).toBe(true)
      expect(matchBhSkuWithDatabase('SOILMEFX2', 'ILMEFX2', true)).toBe(true)
      expect(matchBhSkuWithDatabase('SOILMEFX2', 'ILME-FX2', true)).toBe(true)

      // Casos com prefixo MFR #
      expect(matchBhSkuWithDatabase('MFR # BRU-SF10', 'BRUSF10', true)).toBe(true)
      expect(matchBhSkuWithDatabase('MFR # ILME-FX2', 'ILMEFX2', true)).toBe(true)

      // Não-Sony não remove prefixo arbitrário nem mistura produtos diferentes
      expect(matchBhSkuWithDatabase('BMD-POCKET4K', 'BMD-POCKET4K', false)).toBe(true)
      expect(matchBhSkuWithDatabase('BMD-POCKET4K', 'BMDPOCKET4K', false)).toBe(true)
      expect(matchBhSkuWithDatabase('CANON-R5', 'CANON-R6', false)).toBe(false)
    })
  })

  describe('normalizeSkuForBrand (src/utils/sku-normalize.ts)', () => {
    it('normalizes Sony SKUs (removes hyphens, uppercase, trim)', () => {
      expect(normalizeSkuForBrand('ILME-FX2', 'Sony')).toBe('ILMEFX2')
      expect(normalizeSkuForBrand('BRU-SF10', 'Sony')).toBe('BRUSF10')
      expect(normalizeSkuForBrand('  ilme-fx2  ', 'Sony')).toBe('ILMEFX2')
      expect(normalizeSkuForBrand('MFR # BRU-SF10', 'SONY')).toBe('BRUSF10')
      expect(normalizeSkuForBrand('ILMEFX2', 'Sony')).toBe('ILMEFX2')
      expect(normalizeSkuForBrand('BRUSF10', 'Sony')).toBe('BRUSF10')
    })

    it('preserves hyphens and format for non-Sony brands', () => {
      expect(normalizeSkuForBrand('BMD-CINECAMPOCHDF4K', 'Blackmagic Design')).toBe('BMD-CINECAMPOCHDF4K')
      expect(normalizeSkuForBrand('CONVCMIC/HS03G/WPSU', 'Blackmagic Design')).toBe('CONVCMIC/HS03G/WPSU')
      expect(normalizeSkuForBrand('EOS-R5C', 'Canon')).toBe('EOS-R5C')
      expect(normalizeSkuForBrand('ILME-FX2', 'OutraMarca')).toBe('ILME-FX2')
      expect(normalizeSkuForBrand('BRU-SF10', undefined)).toBe('BRU-SF10')
    })
  })

  describe('normalizeSonySku (src/utils/sku-normalize.ts)', () => {
    it('normalizes Sony SKU directly', () => {
      expect(normalizeSonySku('ILME-FX2')).toBe('ILMEFX2')
      expect(normalizeSonySku('BRU-SF10')).toBe('BRUSF10')
      expect(normalizeSonySku('MFR # BRU-SF10')).toBe('BRUSF10')
      expect(normalizeSonySku('')).toBe('')
      expect(normalizeSonySku(null)).toBe('')
      expect(normalizeSonySku(undefined)).toBe('')
    })
  })

  describe('hasSkuDash', () => {
    it('detects presence of dash', () => {
      expect(hasSkuDash('BRU-SF10')).toBe(true)
      expect(hasSkuDash('BRUSF10')).toBe(false)
      expect(hasSkuDash('ILME-FX3')).toBe(true)
      expect(hasSkuDash('FX3')).toBe(false)
      expect(hasSkuDash(null)).toBe(false)
      expect(hasSkuDash(undefined)).toBe(false)
    })
  })

  describe('isSonyBrand', () => {
    it('checks if brand name is Sony case-insensitively', () => {
      expect(isSonyBrand('Sony')).toBe(true)
      expect(isSonyBrand('SONY')).toBe(true)
      expect(isSonyBrand(' sony ')).toBe(true)
      expect(isSonyBrand('Blackmagic Design')).toBe(false)
      expect(isSonyBrand(null)).toBe(false)
    })
  })

  describe('Casos Multi-Marca Conhecidos (AJA e Blackmagic Design)', () => {
    it('normalizes AJA SKUs (ROI-HDMI vs MFR # ROI-HDMI) to the same normalized key ROIHDMI', () => {
      const keyOfficial = normalizeSkuKey('ROI-HDMI')
      const keyScraped = normalizeSkuKey('MFR # ROI-HDMI')
      expect(keyOfficial).toBe('ROIHDMI')
      expect(keyScraped).toBe('ROIHDMI')
      expect(keyOfficial).toBe(keyScraped)
    })

    it('normalizes Blackmagic SKUs (BDLKWEB/C/SEDHD vs BDLKWEBCSEDHD) to the same normalized key BDLKWEBCSEDHD', () => {
      const keyOfficial = normalizeSkuKey('BDLKWEB/C/SEDHD')
      const keyCompact = normalizeSkuKey('BDLKWEBCSEDHD')
      expect(keyOfficial).toBe('BDLKWEBCSEDHD')
      expect(keyCompact).toBe('BDLKWEBCSEDHD')
      expect(keyOfficial).toBe(keyCompact)
    })
  })
})
