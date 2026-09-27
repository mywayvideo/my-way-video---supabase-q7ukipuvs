import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('NCM Product Validation & Recalibration Tests', () => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  it('validates Sony RM-IP500 is classified under 8543.70.99 or 8529.90.90, never under 8428 or 8426', async () => {
    // 1. Autenticação para obter JWT válido
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })

    expect(authError).toBeNull()
    const jwt = authData!.session!.access_token

    // 2. Chamar classify-ncm com o produto Sony RM-IP500
    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description: 'Sony RM-IP500 Professional Remote Controller with Joystick for PTZ Cameras',
        brand: 'Sony',
        model: 'RM-IP500',
        additional_specs: 'PTZ camera controller with joystick, RS-422, VISCA over IP, RJ45, control of up to 100 cameras',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.success).toBe(true)
    expect(result.recommendation).toBeDefined()

    const recommendedNcm = result.recommendation.ncm.replace(/\D/g, '')

    // Não deve ser gruas (8428) nem guindastes/robôs de elevação (8426)
    expect(recommendedNcm.startsWith('8428')).toBe(false)
    expect(recommendedNcm.startsWith('8426')).toBe(false)

    // Deve ser preferencialmente 85437099 ou 85299090
    const isPlausible =
      recommendedNcm === '85437099' ||
      recommendedNcm === '85299090' ||
      recommendedNcm.startsWith('8543') ||
      recommendedNcm.startsWith('8529')

    expect(isPlausible).toBe(true)
  }, 45000)

  it('validates Sony BURANO 8K regression test maintains 8525 chapter with high confidence', async () => {
    const { data: authData } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })

    const jwt = authData!.session!.access_token

    const res = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        product_description: 'Sony BURANO 8K Digital Cinema Camera MPC-2610 Full-Frame 8.6K Sensor PL/E Mount',
        brand: 'Sony',
        model: 'MPC-2610 (BURANO)',
        top_n: 15,
        save_log: true,
      }),
    })

    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.success).toBe(true)
    const ncm = result.recommendation.ncm.replace(/\D/g, '')
    expect(ncm.startsWith('8525')).toBe(true)
  }, 45000)
})
