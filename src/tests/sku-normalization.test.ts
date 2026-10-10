import { describe, it, expect } from 'vitest'
import {
  normalizeSkuKey,
  formatSonyStandardSku,
  hasSkuDash,
  isSonyBrand,
} from '@/utils/sku-normalization'

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
})
