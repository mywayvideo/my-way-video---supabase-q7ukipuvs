import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('classify-ncm Edge Function live tests', () => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  it('rejects unauthenticated request with 401 and descriptive error', async () => {
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        product_description: 'Sony HDCU-3500R Camera Control Unit',
      }),
    })

    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toContain('Authorization')
  })

  it('rejects invalid JWT with 401', async () => {
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid.jwt.token',
      },
      body: JSON.stringify({
        product_description: 'Sony HDCU-3500R Camera Control Unit',
      }),
    })

    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toBe('JWT inválido ou expirado.')
  })

  it('authenticates with valid user credentials and classifies Sony HDCU-3500R with HTTP 200', async () => {
    // 1. Fazer login com usuário cadastrado
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })

    expect(authError).toBeNull()
    expect(authData?.session?.access_token).toBeDefined()

    const jwt = authData!.session!.access_token

    // 2. Chamar classify-ncm com o JWT de usuário autenticado
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description: 'Sony HDCU-3500R Camera Control Unit for HDC-3000 Series Cameras',
        brand: 'Sony',
        model: 'HDCU-3500R',
        product_id: '7da23859-462c-4e39-a37f-73633a066d0c',
        top_n: 10,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)

    const result = await res.json()
    expect(result.success).toBe(true)
    expect(result.recommendation).toBeDefined()
    expect(typeof result.recommendation.ncm).toBe('string')
    expect(result.recommendation.ncm.length).toBe(8)
    expect(Array.isArray(result.alternatives)).toBe(true)
    expect(result.confidence).toBeDefined()
    expect(result.audit_id).toBeDefined()

    console.log('Sony HDCU-3500R recommended NCM:', result.recommendation.ncm)
    console.log('Sony HDCU-3500R audit_id:', result.audit_id)
    console.log('Sony HDCU-3500R confidence:', result.confidence)
    console.log('Sony HDCU-3500R alternatives count:', result.alternatives.length)
  }, 45000)
})
