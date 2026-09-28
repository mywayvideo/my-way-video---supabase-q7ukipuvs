import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('ncm_support layer integration and safeguards', () => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  it('checks that ncm_support table exists and has seeds loaded for key AV families', async () => {
    // Authenticar com usuário admin para ler ncm_support via RLS
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })
    expect(authError).toBeNull()

    const { data: rows, error } = await supabase
      .from('ncm_support')
      .select('id, familia, ncm_principal, status, ncm_alternativas')
      .eq('status', 'ativa')

    expect(error).toBeNull()
    expect(rows).toBeDefined()
    expect(rows!.length).toBeGreaterThanOrEqual(10)

    // Verificar se famílias essenciais existem
    const camFamily = rows!.find((r) => r.familia.includes('Câmeras'))
    expect(camFamily).toBeDefined()
    expect(camFamily?.ncm_principal).toBe('85258929')

    const switchFamily = rows!.find((r) => r.familia.includes('Misturadores'))
    expect(switchFamily).toBeDefined()
    expect(switchFamily?.ncm_principal).toBe('85437035')

    const micFamily = rows!.find((r) => r.familia.includes('Microfones'))
    expect(micFamily).toBeDefined()
    expect(micFamily?.ncm_principal).toBe('85181090')
  })

  it('validates that the vigencia trigger refuses an invalid NCM not present in imp_sim_tax_rates', async () => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })
    expect(authError).toBeNull()

    // Tentar inserir com código inexistente/falso
    const { error: insertError } = await supabase.from('ncm_support').insert([
      {
        familia: 'Família Teste Fake Inexistente',
        ncm_principal: '99999999',
        palavras_chave: ['fake'],
        status: 'ativa',
      },
    ])

    // O trigger validate_ncm_support_vigencia DEVE recusar o INSERT
    expect(insertError).toBeDefined()
    expect(insertError?.message).toMatch(/não existe na tabela de tarifas vigentes/i)
  })

  it('validates that the vigencia trigger refuses an invalid NCM in ncm_alternativas', async () => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })
    expect(authError).toBeNull()

    // Tentar inserir com ncm_principal válido (85258929) mas alternativa fake (88888888)
    const { error: insertError } = await supabase.from('ncm_support').insert([
      {
        familia: 'Família Teste Alternativa Fake',
        ncm_principal: '85258929',
        palavras_chave: ['fake'],
        ncm_alternativas: [{ ncm: '88888888', quando: 'Nunca', rgi: 'RGI 1' }],
        status: 'ativa',
      },
    ])

    expect(insertError).toBeDefined()
    expect(insertError?.message).toMatch(/não existe na tabela de tarifas vigentes/i)
  })
})
