import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  searchNcmAutocomplete,
  validateNcmExists,
  formatNcmCode,
  normalizeTextSearch,
  isNcmValidFromList,
  clearNcmAutocompleteCache,
  NcmAutocompleteOption,
} from '@/services/ncmService'
import { supabase } from '@/lib/supabase/client'

describe('NCM Autocomplete & Validation Service Unit Tests (v2 — RPC única)', () => {
  beforeAll(() => {
    clearNcmAutocompleteCache()
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('formats NCM codes with points correctly (8 digits)', () => {
    expect(formatNcmCode('90071000')).toBe('9007.10.00')
    expect(formatNcmCode('85437099')).toBe('8543.70.99')
    expect(formatNcmCode('00000000')).toBe('0000.00.00')
    expect(formatNcmCode('9007.10.00')).toBe('9007.10.00')
    expect(formatNcmCode('')).toBe('')
    expect(formatNcmCode(null)).toBe('')
  })

  it('normalizes search terms removing accents and lowercasing', () => {
    expect(normalizeTextSearch('Tripé')).toBe('tripe')
    expect(normalizeTextSearch('Câmera')).toBe('camera')
    expect(normalizeTextSearch('Óptica')).toBe('optica')
    expect(normalizeTextSearch('NÃO')).toBe('nao')
  })

  it('validates 0000.00.00 is ALWAYS accepted without backend check', async () => {
    const validWithDots = await validateNcmExists('0000.00.00')
    const validDigits = await validateNcmExists('00000000')
    expect(validWithDots).toBe(true)
    expect(validDigits).toBe(true)
  })

  it('validates existing NCM in imp_sim_tax_rates returns true', async () => {
    const valid1 = await validateNcmExists('9007.10.00')
    const valid2 = await validateNcmExists('90071000')
    const valid3 = await validateNcmExists('85437099')
    expect(valid1).toBe(true)
    expect(valid2).toBe(true)
    expect(valid3).toBe(true)
  })

  it('validates non-existent NCM in imp_sim_tax_rates is refused', async () => {
    const invalid1 = await validateNcmExists('99999999')
    const invalid2 = await validateNcmExists('1111.11.11')
    const invalid3 = await validateNcmExists('abc123')
    expect(invalid1).toBe(false)
    expect(invalid2).toBe(false)
    expect(invalid3).toBe(false)
  })

  it('searches NCM by digits prefix ignoring punctuation: 9007 matches 9007.x codes (via RPC única)', async () => {
    const results = await searchNcmAutocomplete('9007')
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(15)

    // Todos os resultados devem começar com 9007 (prefixo do código tem prioridade no ranking)
    const allStartWith9007 = results.every((r) => r.ncm.startsWith('9007'))
    expect(allStartWith9007).toBe(true)

    // Deve conter formato exibição com pontos
    expect(results[0].ncm_formatted).toMatch(/^\d{4}\.\d{2}\.\d{2}$/)
    expect(results[0].ncm_descricao_full.length).toBeGreaterThan(0)
  })

  it('searches NCM by 90071000 without dots and matches 9007.10.00 (código exato primeiro)', async () => {
    const results = await searchNcmAutocomplete('90071000')
    expect(results.length).toBeGreaterThan(0)
    const match = results.find((r) => r.ncm === '90071000')
    expect(match).toBeDefined()
    expect(match?.ncm_formatted).toBe('9007.10.00')
    expect(match?.ncm_descricao_full).toContain('cinematografia')
    // Código exato tem ranking 1 no servidor
    expect(results[0].ncm).toBe('90071000')
  })

  it('searches NCM by 9007.10 with dots and matches 90071000 (pontos ignorados)', async () => {
    const results = await searchNcmAutocomplete('9007.10')
    expect(results.length).toBeGreaterThan(0)
    const match = results.find((r) => r.ncm === '90071000')
    expect(match).toBeDefined()
    expect(match?.ncm_formatted).toBe('9007.10.00')
  })

  it('searches NCM by description words (case/accent-insensitive): "camera" or "câmera"', async () => {
    const results = await searchNcmAutocomplete('camera')
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(15)

    // Verifica que ncm_descricao_full é usado
    const hasDesc = results.some((r) =>
      normalizeTextSearch(r.ncm_descricao_full).includes('camera') ||
      normalizeTextSearch(r.ncm_descricao_full).includes('fotograf') ||
      normalizeTextSearch(r.ncm_descricao_full).includes('optica'),
    )
    expect(hasDesc).toBe(true)
  })

  it('searches accented word "câmeras" and returns ranked results (bug do print de lentidão)', async () => {
    const results = await searchNcmAutocomplete('câmeras')
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(15)

    const hasCameraDesc = results.some((r) =>
      normalizeTextSearch(r.ncm_descricao_full).includes('camera'),
    )
    expect(hasCameraDesc).toBe(true)
  })

  it('caches recent searches in memory (same query hits cache, no refetch)', async () => {
    clearNcmAutocompleteCache()
    const spy = vi.spyOn(supabase as any, 'rpc')

    const first = await searchNcmAutocomplete('tripé')
    const second = await searchNcmAutocomplete('tripé')

    expect(first).toEqual(second)
    // RPC só deve ter sido chamada uma vez para a mesma query (a segunda veio do cache)
    const rpcCalls = spy.mock.calls.filter((c) => c[0] === 'search_ncm_autocomplete')
    expect(rpcCalls.length).toBeLessThanOrEqual(1)

    spy.mockRestore()
  })

  it('NEVER falls back to search_ncm_candidates (embeddings) in the autocomplete flow', async () => {
    clearNcmAutocompleteCache()
    const spy = vi.spyOn(supabase as any, 'rpc')

    await searchNcmAutocomplete('microfone')

    const candidatesCalls = spy.mock.calls.filter((c) => c[0] === 'search_ncm_candidates')
    expect(candidatesCalls.length).toBe(0)

    spy.mockRestore()
  })

  it('isNcmValidFromList: option vinda da lista com 8 dígitos é válida sem segunda query', () => {
    expect(isNcmValidFromList({ ncm: '90071000' } as NcmAutocompleteOption)).toBe(true)
    expect(isNcmValidFromList({ ncm: '9007.10.00' } as NcmAutocompleteOption)).toBe(false)
    expect(isNcmValidFromList(null)).toBe(false)
  })

  it('returns empty array for empty or too-short queries without network call', async () => {
    clearNcmAutocompleteCache()
    expect(await searchNcmAutocomplete('')).toEqual([])
    expect(await searchNcmAutocomplete('   ')).toEqual([])
    expect(await searchNcmAutocomplete('9')).toEqual([])
    expect(await searchNcmAutocomplete('c')).toEqual([])
  })
})
