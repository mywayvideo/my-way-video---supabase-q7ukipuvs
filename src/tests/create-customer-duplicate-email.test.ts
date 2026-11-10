/**
 * Teste ao vivo da edge function create-customer:
 * cenário de e-mail duplicado deve responder 409 com mensagem amigável,
 * e requisição não-autenticada deve responder 401.
 * Execute manualmente (a plataforma não roda a suíte): npx vitest run src/tests/create-customer-duplicate-email.test.ts
 */
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('create-customer edge function — e-mail duplicado', () => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  it('rejeita requisição sem token com 401', async () => {
    const res = await fetch(`${supabaseUrl}/functions/v1/create-customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'vendas@mywayvideo.com', password: 'Test@12345', name: 'Teste' }),
    })
    expect(res.status).toBe(401)
  })

  it('responde 409 com mensagem amigável para e-mail já registrado (vendas@mywayvideo.com)', async () => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })
    expect(authError).toBeNull()
    const jwt = authData!.session!.access_token

    const res = await fetch(`${supabaseUrl}/functions/v1/create-customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        email: 'vendas@mywayvideo.com',
        password: 'Test@12345',
        name: 'Teste Duplicado',
      }),
    })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Já existe um usuário cadastrado com este e-mail.')
  })
})
