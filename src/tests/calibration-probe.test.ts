import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('classify-ncm Single Case Probe', () => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  it('probes Sony UWP-D21 and ATEM SDI', async () => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })
    expect(authError).toBeNull()
    const jwt = authData!.session!.access_token

    console.log('[PROBE] Testing UWP-D21...')
    const resUwp = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        product_description:
          'Sony UWP-D21 Camera-Mount Wireless Omni Lavalier Microphone System (UC14: 470 to 542 MHz) - Wireless Transmission: Analog UHF | RF Channels: 2772',
        brand: 'Sony',
        model: 'UWP-D21/14',
        additional_specs:
          'Sistema sem fio analógico UHF composto por transmissor bodypack UTX-B40, receptor portátil URX-P40 e microfone de lapela ECM-V1BMP.',
        top_n: 15,
        save_log: false,
      }),
    })
    expect(resUwp.status).toBe(200)
    const uwpJson = await resUwp.json()
    console.log('[PROBE UWP-D21 Result]:', JSON.stringify({
      recommended: uwpJson.recommendation?.ncm,
      alternatives: uwpJson.alternatives?.map((a: any) => a.ncm),
    }))
    expect(uwpJson.recommendation?.ncm).toBe('85181090')
    expect((uwpJson.alternatives || []).map((a: any) => a.ncm)).not.toContain('85437099')

    console.log('[PROBE] Testing Audio Delay...')
    const resDelay = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        product_description:
          'Datavideo AD-100 Audio Delay Box - Processador de retardo e sincronizador de áudio/vídeo profissional para ajuste de lip-sync em transmissões ao vivo.',
        brand: 'Datavideo',
        model: 'AD-100',
        additional_specs:
          'Dispositivo autônomo com entradas e saídas RCA/XLR balanceadas, retardo ajustável de 0 a 700ms para compensar atraso de processamento de vídeo e garantir sincronia labial.',
        top_n: 15,
        save_log: false,
      }),
    })
    expect(resDelay.status).toBe(200)
    const delayJson = await resDelay.json()
    console.log('[PROBE Audio Delay Result]:', JSON.stringify({
      recommended: delayJson.recommendation?.ncm,
      alternatives: delayJson.alternatives?.map((a: any) => a.ncm),
    }))
    const delayAll = [delayJson.recommendation?.ncm, ...(delayJson.alternatives || []).map((a: any) => a.ncm)]
    expect(delayAll).toContain('85437099')
  }, 120000)
})
