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

  it('validates contract types for ClassifyNcmResponse checklist_log and audit_verdict', () => {
    const mockResponse: import('@/services/ncmService').ClassifyNcmResponse = {
      success: true,
      audit_id: 'test-audit-id',
      recommendation: {
        ncm: '85437099',
        ex: '',
        ii: 0,
        ipi: 6.5,
        pis: 2.1,
        cofins: 9.65,
        total_tax: 18.25,
        has_ex_tarifario: false,
        justification: 'Enquadramento técnico correto.',
      },
      alternatives: [],
      confidence: 'alta',
      sufficient_info: true,
      web_sources: [],
      model_used: 'openai (gpt-4o-mini)',
      candidates_count: 15,
      execution_time_ms: 1200,
      timestamp: new Date().toISOString(),
      audit_verdict: {
        action: 'APROVA',
        essential_function: 'Controlador remoto de câmeras PTZ',
        audit_critique: 'Aprovado.',
      },
      checklist_log: {
        passed: true,
        status: 'NÃO VERIFICADO',
        requiresExpertReview: true,
        comparisons: [],
        missingInformation: [],
        needsWebSearch: true,
      },
    }

    expect(mockResponse.checklist_log?.status).toBe('NÃO VERIFICADO')
    expect(mockResponse.checklist_log?.requiresExpertReview).toBe(true)
  })
})
