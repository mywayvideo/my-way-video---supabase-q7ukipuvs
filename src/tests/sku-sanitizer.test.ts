import { describe, it, expect } from 'vitest'
import { sanitizeSku } from '@/utils/sku-sanitizer'

describe('sanitizeSku', () => {
  it('should remove "MFR #" prefix preserving the actual SKU', () => {
    expect(sanitizeSku('MFR #SEL300F28GM')).toBe('SEL300F28GM')
    expect(sanitizeSku('MFR #MRW-G3')).toBe('MRW-G3')
  })

  it('should handle case-insensitive variations (mfr #, Mfr #)', () => {
    expect(sanitizeSku('mfr #SEL300F28GM')).toBe('SEL300F28GM')
    expect(sanitizeSku('Mfr #SEL300F28GM')).toBe('SEL300F28GM')
  })

  it('should handle variations without space before or after the hash (MFR#, MFR # , mfr#)', () => {
    expect(sanitizeSku('MFR#SEL300F28GM')).toBe('SEL300F28GM')
    expect(sanitizeSku('mfr#SEL300F28GM')).toBe('SEL300F28GM')
    expect(sanitizeSku('MFR # SEL300F28GM')).toBe('SEL300F28GM')
    expect(sanitizeSku('MFR   #   SEL300F28GM')).toBe('SEL300F28GM')
  })

  it('should trim surrounding whitespace', () => {
    expect(sanitizeSku('   MFR #SEL300F28GM   ')).toBe('SEL300F28GM')
    expect(sanitizeSku('  SEL300F28GM  ')).toBe('SEL300F28GM')
  })

  it('should keep already clean SKUs untouched', () => {
    expect(sanitizeSku('SEL300F28GM')).toBe('SEL300F28GM')
    expect(sanitizeSku('ILCE-7RM5')).toBe('ILCE-7RM5')
    expect(sanitizeSku('SOMRWG3')).toBe('SOMRWG3')
  })

  it('should not alter SKUs where mfr appears elsewhere', () => {
    expect(sanitizeSku('ABC-MFR-123')).toBe('ABC-MFR-123')
  })

  it('should return empty string for null, undefined or non-string values', () => {
    expect(sanitizeSku(null)).toBe('')
    expect(sanitizeSku(undefined)).toBe('')
    expect(sanitizeSku(12345)).toBe('')
  })
})
