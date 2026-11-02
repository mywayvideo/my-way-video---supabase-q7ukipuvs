import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as ts from 'typescript'
import {
  analyzeQueryTokens,
  isQualifierToken,
  isAccessoryOrSupportCategory,
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

  // (A) TOKENS-OBJETO só derivam do TIPO DE PRODUTO detectado na query;
  // tokens extraídos de frases de especificação multi-palavra injetadas pelo classificador
  // (ex. 'optical zoom' → 'zoom', 'otico') e de etiquetas genéricas de domínio
  // (ex. 'audiovisual equipment') são SEMPRE qualificadores, jamais objetos —
  // após a correção, o log deve mostrar objects=[camera, ptz] e qualifiers contendo zoom/otico/4k/20x,
  // com 'audiovisual equipment' descartado do scoring.
  it('Correction (A): correctly classifies object tokens vs qualifiers and discards generic domain labels', () => {
    expect(isQualifierToken('4k')).toBe(true)
    expect(isQualifierToken('20x')).toBe(true)
    expect(isQualifierToken('12g')).toBe(true)
    expect(isQualifierToken('sfp+')).toBe(true)
    expect(isQualifierToken('60p')).toBe(true)
    expect(isQualifierToken('1080p')).toBe(true)
    expect(isQualifierToken('zoom')).toBe(true)
    expect(isQualifierToken('optico')).toBe(true)

    expect(isQualifierToken('camera')).toBe(false)
    expect(isQualifierToken('ptz')).toBe(false)
    expect(isQualifierToken('conversor')).toBe(false)
    expect(isQualifierToken('fibra')).toBe(false)
    expect(isQualifierToken('switcher')).toBe(false)
    expect(isQualifierToken('tripe')).toBe(false)
    expect(isQualifierToken('microfone')).toBe(false)
    expect(isQualifierToken('shotgun')).toBe(false)

    // Test with classifier-injected terms including 'optical zoom' and 'audiovisual equipment'
    const analysis = analyzeQueryTokens(
      'camera ptz 4k com zoom óptico 20x',
      ['camera', 'ptz', 'optical zoom', 'audiovisual equipment', '4k', '20x'],
      'catalog',
    )

    // Objects MUST strictly be ['camera', 'ptz']
    expect(analysis.objectTokens).toEqual(['camera', 'ptz'])

    // Qualifiers must contain 4k, 20x, zoom, optico
    expect(analysis.qualifierTokens).toContain('4k')
    expect(analysis.qualifierTokens).toContain('20x')
    expect(analysis.qualifierTokens).toContain('zoom')
    expect(analysis.qualifierTokens).toContain('optico')

    // 'audiovisual' and 'equipment' must be discarded from scoring
    expect(analysis.objectTokens).not.toContain('audiovisual')
    expect(analysis.objectTokens).not.toContain('equipment')
    expect(analysis.qualifierTokens).not.toContain('audiovisual')
    expect(analysis.qualifierTokens).not.toContain('equipment')
    expect(analysis.allTokens).not.toContain('audiovisual')
    expect(analysis.allTokens).not.toContain('equipment')

    // Compound type detected: 'camera' and 'ptz' are adjacent in clean query
    expect(analysis.compoundTypeTokens).toEqual(['camera', 'ptz'])
  })

  it('Correction (B): isAccessoryOrSupportCategory detects accessory and support categories across segments', () => {
    expect(isAccessoryOrSupportCategory('Accessories')).toBe(true)
    expect(isAccessoryOrSupportCategory('Accessory')).toBe(true)
    expect(isAccessoryOrSupportCategory('Acessório')).toBe(true)
    expect(isAccessoryOrSupportCategory('Camera Accessories')).toBe(true)
    expect(isAccessoryOrSupportCategory('Suporte para Pan Bar')).toBe(true)
    expect(isAccessoryOrSupportCategory('Wall Mount Bracket')).toBe(true)
    expect(isAccessoryOrSupportCategory('Cables & Connectors')).toBe(true)

    expect(isAccessoryOrSupportCategory('Cameras')).toBe(false)
    expect(isAccessoryOrSupportCategory('PTZ Camera')).toBe(false)
    expect(isAccessoryOrSupportCategory('Production Switchers')).toBe(false)
    expect(isAccessoryOrSupportCategory('Converters')).toBe(false)
    expect(isAccessoryOrSupportCategory('Tripods & Rigs')).toBe(false)
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

    const p4 = splitCoreAndDescription('Blackmagic Design URSA Broadcast G2 Camera with Fujinon 8.5-170mm Digital Servo Lens & Zoom/Focus Control')
    expect(p4.coreName).toBe('blackmagic design ursa broadcast g2 camera with fujinon 8.5-170mm digital servo lens & zoom/focus control')
    expect(p4.embeddedDesc).toBe('')
  })

  // Acceptance Criterion 1:
  // "camera ptz 4k com zoom óptico 20x": NÃO aparecem Zoom Demand, Camera Zoom Focus - Bracket nem URSA Broadcast G2 (nenhuma variante);
  // e as PTZs (Sony BRC-X1000/BRC-H800/BRC-AM7, Canon CR-N300/CR-N400, Datavideo PTC-305/PTC-140) continuam presentes
  it('Case 1: rejects Zoom Demand, Camera Zoom Focus Bracket and URSA Broadcast G2 for "camera ptz 4k com zoom óptico 20x"', () => {
    const query = 'camera ptz 4k com zoom óptico 20x'
    const entities = ['camera', 'ptz', 'optical zoom', 'audiovisual equipment', '4k', '20x']
    const analysis = analyzeQueryTokens(query, entities, 'catalog')

    expect(analysis.objectTokens).toEqual(['camera', 'ptz'])
    expect(analysis.compoundTypeTokens).toEqual(['camera', 'ptz'])

    const sampleProducts = [
      {
        id: 'sony-brc-x1000',
        name: 'Sony BRC-X1000 4K PTZ Camera with 1" CMOS Sensor and PoE+ (Black)',
        category: 'PTZ Camera',
        manufacturer: 'Sony',
      },
      {
        id: 'sony-brc-h800',
        name: 'Sony BRC-H800 HD PTZ Camera',
        category: null,
        manufacturer: 'Sony',
      },
      {
        id: 'sony-brc-am7',
        name: 'Sony BRC-AM7 4K60 PTZ Camera with AI Auto-Framing (White)',
        category: null,
        manufacturer: 'Sony',
      },
      {
        id: 'canon-cr-n300',
        name: 'Canon CR-N300 4K NDI HX2 PTZ Camera with 20x Zoom',
        category: null,
        manufacturer: 'Canon',
      },
      {
        id: 'canon-cr-n400',
        name: 'Canon CR-N400 4K 12G-SDI NDI PTZ Camera with 20x Optical Zoom (Satin Black)',
        category: null,
        manufacturer: 'Canon',
      },
      {
        id: 'datavideo-ptc-305',
        name: 'Datavideo PTC-305 4K NDI PTZ Camera with Auto Tracking (Black)',
        category: 'PTZ Camera',
        manufacturer: 'Datavideo',
      },
      {
        id: 'datavideo-ptc-140',
        name: 'Datavideo PTC-140 1080p NDI PTZ Camera with 20x Zoom',
        category: 'PTZ Camera',
        manufacturer: 'Datavideo',
      },
      // Intruso 1: Bracket (categoria Accessories/suporte, tem 'camera' e 'zoom' no nome core)
      {
        id: 'bm-focus-bracket',
        name: 'Blackmagic Camera Zoom Focus - Bracket (suporte para pan bar 0.6-1.2"" em URSA Broadcast G2/Studio 4K)',
        category: 'Accessories',
        manufacturer: 'Blackmagic Design',
      },
      // Intruso 2: URSA Broadcast G2 com lente Fujinon (categoria Cameras/Broadcast ENG ou nula, tem 'camera' mas NÃO tem 'ptz')
      {
        id: 'bm-ursa-broadcast-fujinon',
        name: 'Blackmagic Design URSA Broadcast G2 Camera with Fujinon 8.5-170mm Digital Servo Lens & Zoom/Focus Control',
        category: 'Cameras',
        manufacturer: 'Blackmagic Design',
      },
      // Intruso 2b: URSA Broadcast G2 variante padrão
      {
        id: 'bm-ursa-broadcast-g2',
        name: 'Blackmagic URSA Broadcast G2 (broadcast 6K B4/EF, dual native ISO, 12G-SDI/NDI, Blackmagic RAW)',
        category: 'Câmera Broadcast ENG',
        manufacturer: 'Blackmagic Design',
      },
      // Intruso 3: Zoom Demand (controle de zoom)
      {
        id: 'bm-zoom-demand',
        name: 'Blackmagic Zoom Demand (controle zoom para Studio Camera 4K Plus/Pro, dual USB/speed selector/record button)',
        category: 'Demand Zoom Studio',
        manufacturer: 'Blackmagic Design',
      },
    ]

    // Apply unified relevance filter
    const filterRes = applyUnifiedRelevanceFilter(sampleProducts, analysis, { minResults: 3, minScore: 6 })

    // Must pass in 'strict' stage because we have 7 valid PTZ cameras
    expect(filterRes.stageUsed).toBe('strict')

    const strictIds = filterRes.filtered.map((p) => p.id)

    // Intruders MUST be eliminated in strict filter:
    // (1) Bracket eliminated by Category Precedence (Accessories is incompatible with PTZ camera)
    expect(strictIds).not.toContain('bm-focus-bracket')
    // (2) URSA Broadcast G2 eliminated by Compound Type (missing 'ptz' qualifier of 'camera ptz' in core name)
    expect(strictIds).not.toContain('bm-ursa-broadcast-fujinon')
    expect(strictIds).not.toContain('bm-ursa-broadcast-g2')
    // (3) Zoom Demand eliminated by Compound Type (missing 'camera' and 'ptz' in core name)
    expect(strictIds).not.toContain('bm-zoom-demand')

    // Valid PTZ cameras must all survive
    expect(strictIds).toContain('sony-brc-x1000')
    expect(strictIds).toContain('sony-brc-h800')
    expect(strictIds).toContain('sony-brc-am7')
    expect(strictIds).toContain('canon-cr-n300')
    expect(strictIds).toContain('canon-cr-n400')
    expect(strictIds).toContain('datavideo-ptc-305')
    expect(strictIds).toContain('datavideo-ptc-140')

    // Balanced curation: verify round-robin picks top PTZs and none of the intruders
    const balanced = balanceProductsByManufacturer(filterRes.scored, 2, 8)
    const balancedIds = balanced.map((p) => p.id)

    expect(balancedIds).not.toContain('bm-focus-bracket')
    expect(balancedIds).not.toContain('bm-ursa-broadcast-fujinon')
    expect(balancedIds).not.toContain('bm-ursa-broadcast-g2')
    expect(balancedIds).not.toContain('bm-zoom-demand')

    // PTZs are present
    expect(balancedIds).toContain('sony-brc-x1000')
    expect(balancedIds).toContain('canon-cr-n300')
    expect(balancedIds).toContain('datavideo-ptc-305')
  })

  // Acceptance Criterion 2:
  // A busca de acessório ('controle zoom para Studio Camera') continua retornando o Zoom Demand
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
  it('Case 3: converter search ("conversor de fibra óptica HDMI/SDI") returns relevant converters without intruders', () => {
    const query = 'conversor de fibra óptica HDMI/SDI'
    const entities = ['conversor', 'fibra', 'hdmi', 'sdi']
    const analysis = analyzeQueryTokens(query, entities, 'catalog')

    // Compound type detected: 'conversor' and 'fibra' are adjacent
    expect(analysis.compoundTypeTokens).toEqual(['conversor', 'fibra'])

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
        category: 'Accessories',
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
  // Buscas de outros segmentos (tripés, cabos, iluminação, comparações, microfones) mantêm seus resultados
  // nenhum segmento com queda de resultados, e degradação graciosa em 4 estágios nunca retorna vazio
  it('Case 4: other segments (tripods, cables, lighting, shotgun mic) degrade gracefully and never return empty', () => {
    // 4a: Tripé de vídeo fluid
    const tripodQuery = analyzeQueryTokens('tripé de vídeo fluid', ['tripe', 'video', 'fluid'], 'catalog')
    expect(tripodQuery.objectTokens).toContain('tripe')
    expect(tripodQuery.objectTokens).toContain('video')
    expect(tripodQuery.qualifierTokens).toContain('fluid')

    const tripods = [
      { id: 'tripod-1', name: 'Manfrotto 504X Fluid Video Head with 645 Fast Twin Tripod', category: 'Tripods & Rigs', manufacturer: 'Manfrotto' },
      { id: 'tripod-2', name: 'Sachtler Ace M Fluid Head with 2-Stage Aluminum Tripod', category: 'Tripods & Rigs', manufacturer: 'Sachtler' },
      { id: 'accessory-plate', name: 'Quick Release Plate para tripé de vídeo', category: 'Accessories', manufacturer: 'Manfrotto' },
    ]

    const tripodRes = applyUnifiedRelevanceFilter(tripods, tripodQuery, { minResults: 2, minScore: 6 })
    expect(tripodRes.filtered.length).toBeGreaterThanOrEqual(2)
    expect(tripodRes.filtered.map((p) => p.id)).toContain('tripod-1')
    expect(tripodRes.filtered.map((p) => p.id)).toContain('tripod-2')
    expect(tripodRes.filtered.map((p) => p.id)).not.toContain('accessory-plate')

    // 4b: Microfone shotgun
    const micQuery = analyzeQueryTokens('microfone shotgun profissional', ['microfone', 'shotgun'], 'catalog')
    expect(micQuery.objectTokens).toEqual(['microfone', 'shotgun'])
    expect(micQuery.compoundTypeTokens).toEqual(['microfone', 'shotgun'])

    const mics = [
      { id: 'mic-1', name: 'Sennheiser MKH 416-P48U3 Short Shotgun Interference Tube Microphone', category: 'Audio', manufacturer: 'Sennheiser' },
      { id: 'mic-2', name: 'Rode NTG5 Moisture-Resistant Short Shotgun Microphone', category: 'Audio', manufacturer: 'Rode' },
      { id: 'windshield', name: 'Deadcat Windshield para Microfone Shotgun', category: 'Accessories', manufacturer: 'Rode' },
    ]

    const micRes = applyUnifiedRelevanceFilter(mics, micQuery, { minResults: 2, minScore: 6 })
    expect(micRes.filtered.length).toBeGreaterThanOrEqual(2)
    expect(micRes.filtered.map((p) => p.id)).toContain('mic-1')
    expect(micRes.filtered.map((p) => p.id)).toContain('mic-2')
    expect(micRes.filtered.map((p) => p.id)).not.toContain('windshield')

    // 4c: Switcher SDI
    const switcherQuery = analyzeQueryTokens('switcher sdi 12g', ['switcher', 'sdi', '12g'], 'catalog')
    expect(switcherQuery.objectTokens).toEqual(['switcher'])
    expect(switcherQuery.qualifierTokens).toContain('sdi')
    expect(switcherQuery.qualifierTokens).toContain('12g')

    // 4d: Degradação graciosa em 4 estágios sem lista vazia
    const nicheQuery = analyzeQueryTokens('iluminador led bi-color cob 300w', ['iluminador', 'led', '300w'], 'catalog')
    const sparseProducts = [
      { id: 'light-1', name: 'Aputure Amaran 300c RGB LED Light', category: 'Lighting', manufacturer: 'Aputure' },
    ]
    const degradedRes = applyUnifiedRelevanceFilter(sparseProducts, nicheQuery, { minResults: 2, minScore: 15 })
    expect(degradedRes.filtered.length).toBe(1)
    expect(degradedRes.filtered[0].id).toBe('light-1')
  })
})
