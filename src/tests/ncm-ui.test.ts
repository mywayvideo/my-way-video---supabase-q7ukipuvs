import { describe, it, expect } from 'vitest'
import { formatNcmDisplay, cleanNcmDigits } from '@/components/admin/NcmSuggestDialog'
import { ncmService } from '@/services/ncmService'

describe('NcmSuggestDialog helpers & formatters', () => {
  it('formats 8 digits NCM into 0000.00.00 mask correctly', () => {
    expect(formatNcmDisplay('85258913')).toBe('8525.89.13')
    expect(formatNcmDisplay('84212920')).toBe('8421.29.20')
    expect(formatNcmDisplay('90021100')).toBe('9002.11.00')
  })

  it('handles already formatted or non-standard lengths gracefully', () => {
    expect(formatNcmDisplay('8525.89.13')).toBe('8525.89.13')
    expect(formatNcmDisplay(null)).toBe('—')
    expect(formatNcmDisplay('')).toBe('—')
  })

  it('cleans NCM digits to pure 8 numbers string for DB storage', () => {
    expect(cleanNcmDigits('8525.89.13')).toBe('85258913')
    expect(cleanNcmDigits('85258913')).toBe('85258913')
    expect(cleanNcmDigits('  8421-29.20  ')).toBe('84212920')
    expect(cleanNcmDigits(null)).toBe('')
  })

  it('exports updateDecision in ncmService', () => {
    expect(typeof ncmService.updateDecision).toBe('function')
  })
})
