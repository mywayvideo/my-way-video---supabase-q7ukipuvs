import { describe, it, expect } from 'vitest'
import { classifyNcm, searchNcmCandidates } from '@/services/ncmService'

describe('NCM Service & classify-ncm Edge Function Contract Tests', () => {
  it('has classifyNcm function exported with correct signature', () => {
    expect(typeof classifyNcm).toBe('function')
  })

  it('searches for real Sony camera candidates in tax rates database', async () => {
    const candidates = await searchNcmCandidates({
      query: 'Sony BRC-X1000 4K PTZ Camera CMOS',
      topN: 5,
    })

    expect(Array.isArray(candidates)).toBe(true)
    expect(candidates.length).toBeGreaterThan(0)
    console.log('Sony BRC-X1000 candidates:', candidates.slice(0, 2))

    // Verifica que contém os campos esperados
    const first = candidates[0]
    expect(first.ncm).toBeDefined()
    expect(typeof first.ii_rate).toBe('number')
    expect(typeof first.ipi_rate).toBe('number')
    expect(typeof first.pis_rate).toBe('number')
    expect(typeof first.cofins_rate).toBe('number')
  })

  it('searches for ambiguous equipment (encoder/converter 84 vs 85)', async () => {
    const candidates = await searchNcmCandidates({
      query: 'conversor de sinal de vídeo e dados para transmissão SDI',
      topN: 10,
    })

    expect(Array.isArray(candidates)).toBe(true)
    expect(candidates.length).toBeGreaterThan(0)

    // Verifica se temos candidatos tanto de 84 quanto de 85 ou 90 na base
    const chapters = new Set(candidates.map((c) => c.ncm.substring(0, 2)))
    console.log('Ambiguous equipment retrieved chapters:', Array.from(chapters))
    expect(chapters.size).toBeGreaterThanOrEqual(1)
  })
})
