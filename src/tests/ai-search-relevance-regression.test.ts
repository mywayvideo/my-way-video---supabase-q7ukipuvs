import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as ts from 'typescript'
import {
  analyzeQueryTokens,
  isQualifierToken,
  splitCoreAndDescription,
  scoreProductRelevance,
  applyUnifiedRelevanceFilter,
  balanceProductsByManufacturer,
} from '../../supabase/functions/ai-search/relevance-engine'

describe('ai-search relevance engine - unit & regression suite', () => {
  it('parses supabase/functions/ai-search/index.ts and relevance-engine.ts with zero diagnostics', () => {
    for (const file of [
      'supabase/functions/ai-search/index.ts',
      'supabase/functions/ai-search/relevance-engine.ts',
    ]) {
      const code = fs.readFileSync(file, 'utf-8')
      const sourceFile = ts.createSourceFile(
        'index.ts',
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      // @ts-expect-error parseDiagnostics is internal
      const parseDiagnostics = sourceFile.parseDiagnostics || []
      expect(parseDiagnostics.length).toBe(0)
    }
  })

  it('correctly classifies qualifier tokens vs object tokens dynamically', () => {
    expect(isQualifierToken('4k')).toBe(true)
    expect(isQualifierToken('20x')).toBe(true)
    expect(isQualifierToken('12g')).toBe(true)
    expect(isQualifierToken('sfp+')).toBe(true)
    expect(isQualifierToken('60p')).toBe(true)
    expect(isQualifierToken('1080p')).toBe(true)

    expect(isQualifierToken('camera')).toBe(false)
    expect(isQualifierToken('ptz')).toBe(false)
    expect(isQualifierToken('zoom')).toBe(false)
    expect(isQualifierToken('conversor')).toBe(false)
    expect(isQualifierToken('fibra')).toBe(false)
    expect(isQualifierToken('switcher')).toBe(false)
    expect(isQualifierToken('tripe')).toBe(false)

    const analysis = analyzeQueryTokens('camera ptz 4k com zoom óptico 20x', ['camera', 'ptz', 'zoom', '20x'], 'catalog')
    expect(analysis.objectTokens).toContain('camera')
    expect(analysis.objectTokens).toContain('ptz')
    expect(analysis.objectTokens).toContain('zoom')
    expect(analysis.qualifierTokens).toContain('4k')
    expect(analysis.qualifierTokens).toContain('20x')
  })

  it('splits core name and embedded description correctly', () => {
    const p1 = splitCoreAndDescription('Blackmagic Zoom Demand (controle zoom para Studio Camera 4K Plus/Pro, dual USB/speed selector/record button)')
    expect(p1.coreName).toBe('blackmagic zoom demand')
    expect(p1.embeddedDesc).toContain('controle zoom para studio camera')

    const p2 = splitCoreAndDescription('Blackmagic Camera Zoom Focus - Bracket (suporte para pan bar 0.6-1.2"" em URSA Broadcast G2/Studio 4K)')
    expect(p2.coreName).toBe('blackmagic camera zoom focus')
    expect(p2.embeddedDesc).toContain('bracket')

    const p3 = splitCoreAndDescription('Canon CR-N300 4K NDI HX2 PTZ Camera with 20x Zoom')
    expect(p3.coreName).toBe('canon cr-n300 4k ndi hx2 ptz camera with 20x zoom')
    expect(p3.embeddedDesc).toBe('')
  })

  // Acceptance Criterion 1:
  // "camera ptz 4k com zoom óptico 20x": Blackmagic Zoom Demand e Camera Zoom Focus Bracket NÃO aparecem na lista final
  // e as câmeras PTZ (Canon CR-N300, Sony BRC-AM7, Datavideo PTC-305) continuam presentes
  it('Case 1: rejects intruders and keeps PTZ cameras for "camera ptz 4k com zoom óptico 20x"', () => {
    const query = 'camera ptz 4k com zoom óptico 20x'
    const entities = ['camera', 'ptz', 'zoom', '20x']
    const analysis = analyzeQueryTokens(query, entities, 'catalog')

    const sampleProducts = [
      {
        id: 'canon-cr-n300',
        name: 'Canon CR-N300 4K NDI HX2 PTZ Camera with 20x Zoom',
        category: null,
        manufacturer: 'Canon',
      },
      {
        id: 'sony-brc-am7',
        name: 'Sony BRC-AM7 4K60 PTZ Camera with AI Auto-Framing',
        category: null,
        manufacturer: 'Sony',
      },
      {
        id: 'datavideo-ptc-305',
        name: 'Datavideo PTC-305 4K NDI PTZ Camera with Auto Tracking (Black)',
        category: 'PTZ Camera',
        manufacturer: 'Datavideo',
      },
      {
        id: 'datavideo-ptc-305g',
        name: 'Datavideo PTC-305G 4K HDMI/12G-SDI/NDI Tracking PTZ Camera with 20x Zoom (Black)',
        category: null,
        manufacturer: 'Datavideo',
      },
      {
        id: 'bm-zoom-demand',
        name: 'Blackmagic Zoom Demand (controle zoom para Studio Camera 4K Plus/Pro, dual USB/speed selector/record button)',
        category: 'Demand Zoom Studio',
        manufacturer: 'Blackmagic Design',
      },
      {
        id: 'bm-focus-bracket',
        name: 'Blackmagic Camera Zoom Focus - Bracket (suporte para pan bar 0.6-1.2"" em URSA Broadcast G2/Studio 4K)',
        category: 'Accessories',
        manufacturer: 'Blackmagic Design',
      },
    ]

    // Score comparison check
    const scoredPTZ = scoreProductRelevance(sampleProducts[0], analysis)
    const scoredIntruder1 = scoreProductRelevance(sampleProducts[4], analysis)
    const scoredIntruder2 = scoreProductRelevance(sampleProducts[5], analysis)

    // PTZ camera has camera + ptz + zoom in core name
    expect(scoredPTZ.score).toBeGreaterThan(scoredIntruder1.score)

    // Apply unified relevance filter
    const filterRes = applyUnifiedRelevanceFilter(sampleProducts, analysis, { minResults: 3, minScore: 15 })

    // Intruder Blackmagic Zoom Demand does NOT have camera or ptz in coreName, only in embeddedDesc (controle zoom para studio camera...)
    const finalIds = filterRes.filtered.map((p) => p.id)
    expect(finalIds).toContain('canon-cr-n300')
    expect(finalIds).toContain('sony-brc-am7')
    expect(finalIds).toContain('datavideo-ptc-305')
    expect(finalIds).toContain('datavideo-ptc-305g')

    // Balanced curation: verify round-robin picks highest scoring products
    const balanced = balanceProductsByManufacturer(filterRes.scored, 2, 10)
    const balancedIds = balanced.map((p) => p.id)

    expect(balancedIds).toContain('canon-cr-n300')
    expect(balancedIds).toContain('sony-brc-am7')
    expect(balancedIds).toContain('datavideo-ptc-305')
    expect(balancedIds).not.toContain('bm-zoom-demand')
    expect(balancedIds).not.toContain('bm-focus-bracket')
  })

  // Acceptance Criterion 2:
  // A busca de acessório ('controle zoom para Studio Camera') ainda retorna o Zoom Demand
  it('Case 2: accessory search ("controle zoom para Studio Camera") retains Blackmagic Zoom Demand', () => {
    const query = 'controle zoom para Studio Camera'
    const entities = ['controle', 'zoom', 'studio', 'camera']
    const analysis = analyzeQueryTokens(query, entities, 'accessory')

    const sampleProducts = [
      {
        id: 'bm-zoom-demand',
        name: 'Blackmagic Zoom Demand (controle zoom para Studio Camera 4K Plus/Pro, dual USB/speed selector/record button)',
        category: 'Demand Zoom Studio',
        manufacturer: 'Blackmagic Design',
      },
      {
        id: 'canon-cr-n300',
        name: 'Canon CR-N300 4K NDI HX2 PTZ Camera with 20x Zoom',
        category: 'Cameras',
        manufacturer: 'Canon',
      },
    ]

    const filterRes = applyUnifiedRelevanceFilter(sampleProducts, analysis, { minResults: 1, minScore: 6 })
    const finalIds = filterRes.filtered.map((p) => p.id)
    expect(finalIds).toContain('bm-zoom-demand')

    const balanced = balanceProductsByManufacturer(filterRes.scored, 2, 10)
    expect(balanced.map((p) => p.id)).toContain('bm-zoom-demand')
  })

  // Acceptance Criterion 3:
  // A busca 'conversor de fibra óptica para HDMI/SDI' retorna conversores relevantes, sem intrusos
  it('Case 3: converter search ("conversor de fibra óptica para HDMI/SDI") returns relevant converters without intruders', () => {
    const query = 'conversor de fibra óptica para HDMI/SDI'
    const entities = ['conversor', 'fibra', 'hdmi', 'sdi']
    const analysis = analyzeQueryTokens(query, entities, 'catalog')

    const sampleProducts = [
      {
        id: 'conv-fiber-hdmi',
        name: 'Blackmagic Design Mini Converter Optical Fiber 12G (HDMI/SDI to Fiber)',
        category: 'Converters',
        manufacturer: 'Blackmagic Design',
      },
      {
        id: 'conv-fiber-sdi',
        name: 'Datavideo DAC-45 4K Universal Up/Down/Cross Converter with Fiber',
        category: 'Converters',
        manufacturer: 'Datavideo',
      },
      {
        id: 'intruder-cable',
        name: 'Cabo HDMI Ultra Slim 2m (compativel com conversores de fibra)',
        category: 'Cable & Connectors',
        manufacturer: 'Outros',
      },
    ]

    const filterRes = applyUnifiedRelevanceFilter(sampleProducts, analysis, { minResults: 2, minScore: 10 })
    const finalIds = filterRes.filtered.map((p) => p.id)
    expect(finalIds).toContain('conv-fiber-hdmi')
    expect(finalIds).toContain('conv-fiber-sdi')
    expect(finalIds).not.toContain('intruder-cable')
  })

  // Acceptance Criterion 4:
  // Buscas de outros segmentos (tripés, cabos, iluminação, comparações) mantêm seus resultados atuais — nenhum segmento com queda de resultados
  it('Case 4: other segments (tripods, cables, lighting) degrade gracefully and never return empty', () => {
    const tripodQuery = analyzeQueryTokens('tripé de vídeo profissional', ['tripe', 'video'], 'catalog')
    const tripods = [
      { id: 'tripod-1', name: 'Manfrotto 504X Fluid Video Head with 645 Fast Twin Tripod', category: 'Tripods & Rigs', manufacturer: 'Manfrotto' },
      { id: 'tripod-2', name: 'Sachtler Ace M Fluid Head with 2-Stage Aluminum Tripod', category: 'Tripods & Rigs', manufacturer: 'Sachtler' },
      { id: 'accessory-plate', name: 'Quick Release Plate para tripé de vídeo', category: 'Accessories', manufacturer: 'Manfrotto' },
    ]

    const filterRes = applyUnifiedRelevanceFilter(tripods, tripodQuery, { minResults: 2, minScore: 6 })
    expect(filterRes.filtered.length).toBeGreaterThanOrEqual(2)
    expect(filterRes.filtered.map((p) => p.id)).toContain('tripod-1')
    expect(filterRes.filtered.map((p) => p.id)).toContain('tripod-2')

    // Test graceful degradation when strict criteria matches fewer than minResults:
    // It should degrade gracefully to relaxed stages and NEVER return empty list
    const nicheQuery = analyzeQueryTokens('iluminador led bi-color cob 300w', ['iluminador', 'led', '300w'], 'catalog')
    const sparseProducts = [
      { id: 'light-1', name: 'Aputure Amaran 300c RGB LED Light', category: 'Lighting', manufacturer: 'Aputure' },
    ]
    const degradedRes = applyUnifiedRelevanceFilter(sparseProducts, nicheQuery, { minResults: 2, minScore: 15 })
    expect(degradedRes.filtered.length).toBe(1)
    expect(degradedRes.filtered[0].id).toBe('light-1')
  })
})
