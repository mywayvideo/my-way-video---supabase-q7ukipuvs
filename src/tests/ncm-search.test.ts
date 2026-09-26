import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('RPC search_ncm_candidates validation', () => {
  const supabase = createClient(supabaseUrl, supabaseKey)

  it('searches for "câmera de estúdio" and returns plausible candidates', async () => {
    const { data, error } = await supabase.rpc('search_ncm_candidates', {
      query: 'câmera de estúdio',
      top_n: 5
    })

    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    console.log('Query "câmera de estúdio":', JSON.stringify(data?.slice(0, 3), null, 2))
  })

  it('searches for "lente" and returns plausible candidates', async () => {
    const { data, error } = await supabase.rpc('search_ncm_candidates', {
      query: 'lente',
      top_n: 5
    })

    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect(data.length).toBeGreaterThan(0)
    console.log('Query "lente":', JSON.stringify(data?.slice(0, 3), null, 2))
  })

  it('searches for "tripé" and returns plausible candidates', async () => {
    const { data, error } = await supabase.rpc('search_ncm_candidates', {
      query: 'tripé',
      top_n: 5
    })

    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect(data.length).toBeGreaterThan(0)
    console.log('Query "tripé":', JSON.stringify(data?.slice(0, 3), null, 2))
  })

  it('searches for "servidor" and returns chapter 84 candidates', async () => {
    const { data, error } = await supabase.rpc('search_ncm_candidates', {
      query: 'servidor',
      top_n: 5
    })

    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect(data.length).toBeGreaterThan(0)
    const hasCap84 = data.some((item: any) => item.ncm.startsWith('84'))
    console.log('Query "servidor" has cap 84:', hasCap84, JSON.stringify(data?.slice(0, 3), null, 2))
    expect(hasCap84).toBe(true)
  })

  it('searches for "microfone" and returns plausible candidates', async () => {
    const { data, error } = await supabase.rpc('search_ncm_candidates', {
      query: 'microfone',
      top_n: 5
    })

    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect(data.length).toBeGreaterThan(0)
    console.log('Query "microfone":', JSON.stringify(data?.slice(0, 3), null, 2))
  })
})
