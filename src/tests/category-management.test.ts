import { describe, it, expect } from 'vitest'
import {
  normalizeNcmDigits,
  isValidNcmPrefix,
  formatNcmPrefixDisplay,
  getNcmPrefixHint,
  isNcmMatchingCategory,
  isNcmOutOfCategoryStandard,
  getProductCategorySuggestion,
  LEGACY_EXACT_MAP,
  CategoryItem,
} from '../services/categoryTriageService'

describe('categoryTriageService - NCM Prefix & Matching Rules', () => {
  it('normalizes NCM digits properly', () => {
    expect(normalizeNcmDigits('9002.11.90')).toBe('90021190')
    expect(normalizeNcmDigits('8543.70')).toBe('854370')
    expect(normalizeNcmDigits('9002')).toBe('9002')
    expect(normalizeNcmDigits(null)).toBe('')
    expect(normalizeNcmDigits(undefined)).toBe('')
  })

  it('validates 4, 6 and 8 digit prefixes', () => {
    expect(isValidNcmPrefix('9002')).toBe(true)
    expect(isValidNcmPrefix('9002.11')).toBe(true)
    expect(isValidNcmPrefix('9002.11.90')).toBe(true)
    expect(isValidNcmPrefix('90021190')).toBe(true)
    expect(isValidNcmPrefix('900')).toBe(false)
    expect(isValidNcmPrefix('90021')).toBe(false)
    expect(isValidNcmPrefix('9002119')).toBe(false)
    expect(isValidNcmPrefix('900211900')).toBe(false)
  })

  it('formats prefix display according to length', () => {
    expect(formatNcmPrefixDisplay('9002')).toBe('9002')
    expect(formatNcmPrefixDisplay('900211')).toBe('9002.11')
    expect(formatNcmPrefixDisplay('90021190')).toBe('9002.11.90')
  })

  it('provides helpful prefix hint text', () => {
    expect(getNcmPrefixHint('9002')).toContain('Prefixo de 4 dígitos')
    expect(getNcmPrefixHint('8543.70')).toContain('Prefixo de 6 dígitos')
    expect(getNcmPrefixHint('85437099')).toContain('Código completo de 8 dígitos')
  })

  it('matches NCM with prefix (4, 6 or 8 digits)', () => {
    const acceptable = ['9002', '9002.11', '9002.11.90']
    expect(isNcmMatchingCategory('9002.11.90', acceptable)).toBe(true)
    expect(isNcmMatchingCategory('9002.19.00', ['9002'])).toBe(true)
    expect(isNcmMatchingCategory('8543.70.35', ['8543.70'])).toBe(true)
    expect(isNcmMatchingCategory('8543.70.99', ['8543.70'])).toBe(true)
    expect(isNcmMatchingCategory('8528.52.00', ['8543.70'])).toBe(false)
    // Se produto não tem NCM, é neutro (true)
    expect(isNcmMatchingCategory(null, acceptable)).toBe(true)
    expect(isNcmMatchingCategory('', acceptable)).toBe(true)
    // Se categoria não tem acceptable_ncms, é neutro (true)
    expect(isNcmMatchingCategory('9002.11.90', [])).toBe(true)
  })

  it('determines when NCM is out of standard for badge', () => {
    const acceptableMonitors = ['8528.52', '8528.59']
    // Produto com NCM de monitor válido -> não está fora do padrão (badge = false)
    expect(isNcmOutOfCategoryStandard('8528.52.20', acceptableMonitors)).toBe(false)
    // Produto com NCM de lentes (9002.11.90) dentro de Monitors -> está fora do padrão (badge = true)
    expect(isNcmOutOfCategoryStandard('9002.11.90', acceptableMonitors)).toBe(true)
    // Sem NCM -> neutro (badge = false)
    expect(isNcmOutOfCategoryStandard(null, acceptableMonitors)).toBe(false)
    expect(isNcmOutOfCategoryStandard('', acceptableMonitors)).toBe(false)
  })
})

describe('categoryTriageService - 2-Layer Suggestions & Cintel Rules', () => {
  const mockCategories: Map<string, CategoryItem> = new Map([
    ['Converters', { id: 'cat-converters', name: 'Converters' }],
    ['Accessories', { id: 'cat-accessories', name: 'Accessories' }],
    ['Audio', { id: 'cat-audio', name: 'Audio' }],
    ['Networking & Storage', { id: 'cat-net-storage', name: 'Networking & Storage' }],
    ['Cameras', { id: 'cat-cameras', name: 'Cameras' }],
    ['Lenses', { id: 'cat-lenses', name: 'Lenses' }],
    ['Monitors', { id: 'cat-monitors', name: 'Monitors' }],
    ['Streaming', { id: 'cat-streaming', name: 'Streaming' }],
    ['Production Switchers', { id: 'cat-prod-switchers', name: 'Production Switchers' }],
    ['Desktop Video', { id: 'cat-desktop-video', name: 'Desktop Video' }],
  ])

  it('routes Cintel Scanners and Gates to Converters', () => {
    const scanner = {
      name: 'Blackmagic Cintel Scanner G3 HDR+ 8/16',
      category: 'Scanner de Filme 4K/8K',
      ncm: '8471.60.90',
    }
    const gate = {
      name: 'Blackmagic Cintel Scanner 16mm Gate HDR',
      category: 'Gate Scanner Cintel',
      ncm: '9002.20.90',
    }
    const sugScanner = getProductCategorySuggestion(scanner, mockCategories)
    const sugGate = getProductCategorySuggestion(gate, mockCategories)

    expect(sugScanner?.categoryName).toBe('Converters')
    expect(sugScanner?.level).toBe('high')
    expect(sugGate?.categoryName).toBe('Converters')
    expect(sugGate?.level).toBe('high')
  })

  it('routes Cintel Audio/KeyKode reader and Roller Kit to Accessories', () => {
    const reader = {
      name: 'Blackmagic Cintel Audio and KeyKode Reader',
      category: 'Leitor Audio/KeyKode Cintel',
      ncm: '8523.80.90',
    }
    const roller = {
      name: 'Blackmagic Cintel Film Cleaning Roller Kit',
      category: 'Kit Limpeza Filme Cintel',
      ncm: '8479.89.90',
    }
    const sugReader = getProductCategorySuggestion(reader, mockCategories)
    const sugRoller = getProductCategorySuggestion(roller, mockCategories)

    expect(sugReader?.categoryName).toBe('Accessories')
    expect(sugReader?.level).toBe('high')
    expect(sugRoller?.categoryName).toBe('Accessories')
    expect(sugRoller?.level).toBe('high')
  })

  it('identifies Layer 1 exact legacy label matches as high confidence', () => {
    const prod1 = {
      name: 'Sony FE 24-70mm GM II',
      category: 'Lentes Zoom Standard',
      ncm: '9002.11.90',
    }
    const prod2 = {
      name: 'Sony FX3 Cinema Line',
      category: 'Câmeras Mirrorles',
      ncm: '8525.89.29',
    }
    const sug1 = getProductCategorySuggestion(prod1, mockCategories)
    const sug2 = getProductCategorySuggestion(prod2, mockCategories)

    expect(sug1?.categoryName).toBe('Lenses')
    expect(sug1?.level).toBe('high')
    expect(sug2?.categoryName).toBe('Cameras')
    expect(sug2?.level).toBe('high')
  })

  it('identifies Layer 2 keywords/NCM as medium confidence for products without legacy category', () => {
    const audioProd = {
      name: 'Sony UWP-D21 Wireless Lavalier Microphone System',
      category: null,
      ncm: '8518.10.00',
    }
    const netProd = {
      name: 'Blackmagic Cloud Store Mini 8TB 10GbE Network Storage',
      category: null,
      ncm: '8471.70.12',
    }
    const sugAudio = getProductCategorySuggestion(audioProd, mockCategories)
    const sugNet = getProductCategorySuggestion(netProd, mockCategories)

    expect(sugAudio?.categoryName).toBe('Audio')
    expect(sugAudio?.level).toBe('medium')
    expect(sugNet?.categoryName).toBe('Networking & Storage')
    expect(sugNet?.level).toBe('medium')
  })

  it('identifies Production Switchers and Control Panels correctly', () => {
    const atemSwitcher = {
      name: 'Blackmagic Design ATEM Mini Extreme ISO G2 Switcher',
      category: 'Switcher',
      ncm: '85437099',
    }
    const controlPanel = {
      name: 'Blackmagic ATEM 1 M/E Advanced Panel 10',
      category: 'Control Panel',
      ncm: '85437099',
    }
    const sugSwitcher = getProductCategorySuggestion(atemSwitcher, mockCategories)
    const sugPanel = getProductCategorySuggestion(controlPanel, mockCategories)

    expect(sugSwitcher?.categoryName).toBe('Production Switchers')
    expect(sugSwitcher?.level).toBe('high')
    expect(sugPanel?.categoryName).toBe('Production Switchers')
    expect(sugPanel?.level).toBe('high')
  })
})
