import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

describe('Current NCM Assessment Feature Verification', () => {
  it('Edge Function index.ts contains current_ncm_assessment logic and v3.8.0-build.653', () => {
    const fnPath = path.resolve(process.cwd(), 'supabase/functions/classify-ncm/index.ts')
    const content = fs.readFileSync(fnPath, 'utf8')

    // 1. Version increment
    expect(content).toContain("version: '3.8.0-build.653'")

    // 2. Health check feature
    expect(content).toContain("'current_ncm_assessment'")

    // 3. Body params current_ncm & current_ex
    expect(content).toContain('rawCurrentNcm')
    expect(content).toContain('rawCurrentEx')
    expect(content).toContain('cleanCurrentNcmDigits')

    // 4. Layered verdict logic
    expect(content).toContain('buildCurrentNcmAssessment')
    expect(content).toContain("'MANTER'")
    expect(content).toContain("'CONFERIR'")
    expect(content).toContain("'REVISAR'")

    // 5. Extinct code check
    expect(content).toContain('85258090')
    expect(content).toContain('isExtinctCode')

    // 6. Conditional response payload inclusion (omitted when current_ncm is missing)
    expect(content).toContain('if (currentNcmAssessment) {')
    expect(content).toContain('responsePayload.current_ncm_assessment = currentNcmAssessment')

    // 7. TDZ protection for primaryDescription preserved
    expect(content).toMatch(/primaryDescription\s*=/)

    // 8. Log persistence
    expect(content).toContain('current_ncm_assessment: currentNcmAssessment')
  })

  it('ncmService exports CurrentNcmAssessment and passes currentNcm/currentEx in classifyNcm', () => {
    const servicePath = path.resolve(process.cwd(), 'src/services/ncmService.ts')
    const content = fs.readFileSync(servicePath, 'utf8')

    expect(content).toContain('export interface CurrentNcmAssessment')
    expect(content).toContain('currentNcm?: string')
    expect(content).toContain('currentEx?: string')
    expect(content).toContain('current_ncm_assessment?: CurrentNcmAssessment | null')
    expect(content).toContain('current_ncm: params.currentNcm || undefined')
    expect(content).toContain('current_ex: params.currentEx || undefined')
  })

  it('NcmSuggestDialog passes currentNcm and renders current_ncm_assessment block', () => {
    const dialogPath = path.resolve(process.cwd(), 'src/components/admin/NcmSuggestDialog.tsx')
    const content = fs.readFileSync(dialogPath, 'utf8')

    expect(content).toContain('currentNcm?: string')
    expect(content).toContain('currentEx?: string')
    expect(content).toContain('currentNcm: currentNcm ? cleanNcmDigits(currentNcm) : undefined')
    expect(content).toContain('currentEx: currentEx || undefined')
    expect(content).toContain('result.current_ncm_assessment')
    expect(content).toContain('MANTER')
    expect(content).toContain('CONFERIR')
    expect(content).toContain('REVISAR')
    expect(content).toContain('isCurrentNcmRow')
  })

  it('External API documentation file exists and contains complete guidelines', () => {
    const docPath = path.resolve(process.cwd(), 'docs/classify-ncm-current-ncm-api.md')
    expect(fs.existsSync(docPath)).toBe(true)
    const content = fs.readFileSync(docPath, 'utf8')

    expect(content).toContain('current_ncm_assessment')
    expect(content).toContain('3.8.0-build.653')
    expect(content).toContain('MANTER')
    expect(content).toContain('CONFERIR')
    expect(content).toContain('REVISAR')
    expect(content).toContain('8525.80.90')
    expect(content).toContain('Retrocompatibilidade Garantida')
  })
})
