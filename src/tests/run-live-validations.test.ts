import { describe, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('Live 5 Validations for classify-ncm v3.8.0-build.615', () => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  it('runs the 5 live validations and logs output for the final report', async () => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })
    if (authError || !authData?.session) {
      throw new Error(`Auth failed: ${authError?.message}`)
    }
    const jwt = authData.session.access_token

    // Health check confirmation
    const healthRes = await fetch(`${supabaseUrl}/functions/v1/classify-ncm?health=true`)
    const healthData = await healthRes.json()
    console.log('=== HEALTH CHECK ===', JSON.stringify(healthData, null, 2))

    // 1. ATEM SDI Extreme ISO Switcher (8 entradas SDI)
    console.log('\n>>> VALIDATING 1. ATEM SDI Extreme ISO Switcher (8 entradas SDI)...')
    const res1 = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        product_description: 'Blackmagic Design ATEM SDI Extreme ISO Switcher - Switcher de produção ao vivo com 8 entradas 3G-SDI, 4 saídas SDI, 2 portas USB para webcam e gravação ISO de todos os 8 canais de entrada mais o programa.',
        brand: 'Blackmagic Design',
        model: 'ATEM SDI Extreme ISO',
        additional_specs: 'Misturador e comutador digital de vídeo em tempo real, 8 entradas SDI com conversão de padrões integrada, mixer de áudio Fairlight com EQ e dinâmica.',
        top_n: 15,
        save_log: true,
      }),
    })
    const d1 = await res1.json()
    console.log('=== RESULT 1 (ATEM SDI) ===', JSON.stringify({
      ncm: d1.recommendation?.ncm,
      ex: d1.recommendation?.ex,
      ii: d1.recommendation?.ii,
      description: d1.recommendation?.description,
      confidence: d1.confidence,
      sufficient_info: d1.sufficient_info,
      alternatives: d1.alternatives?.map((a: any) => ({ ncm: a.ncm, ex: a.ex, reason: a.reason, source: a.alternatives_source })),
      model_used: d1.model_used,
    }, null, 2))

    // 2. RM-IP500 (controlador remoto PTZ Sony)
    console.log('\n>>> VALIDATING 2. RM-IP500 (controlador remoto PTZ Sony)...')
    const res2 = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        product_id: 'da9abc07-91ba-4478-b927-51a41ca9f0ff',
        product_description: 'Sony RM-IP500 PTZ Camera Remote Controller. Control of up to 100 cameras over IP. Pan, tilt, and zoom joystick control with PTZ speed control knobs.',
        brand: 'Sony',
        model: 'RM-IP500',
        top_n: 15,
        save_log: true,
      }),
    })
    const d2 = await res2.json()
    console.log('=== RESULT 2 (RM-IP500) ===', JSON.stringify({
      ncm: d2.recommendation?.ncm,
      ex: d2.recommendation?.ex,
      confidence: d2.confidence,
      sufficient_info: d2.sufficient_info,
      alternatives: d2.alternatives?.map((a: any) => ({ ncm: a.ncm, ex: a.ex, reason: a.reason, source: a.alternatives_source })),
      model_used: d2.model_used,
    }, null, 2))

    // 3. HDC-3200R (câmera de estúdio)
    console.log('\n>>> VALIDATING 3. HDC-3200R (câmera de estúdio)...')
    const res3 = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        product_description: 'Sony HDC-3200R 2/3-inch 3-CMOS 4K Broadcast Camera System. 4K HDR live production camera with 3x 2/3" 4K CMOS image sensors, global shutter, B4 lens mount.',
        brand: 'Sony',
        model: 'HDC-3200R',
        top_n: 15,
        save_log: true,
      }),
    })
    const d3 = await res3.json()
    console.log('=== RESULT 3 (HDC-3200R) ===', JSON.stringify({
      ncm: d3.recommendation?.ncm,
      ex: d3.recommendation?.ex,
      confidence: d3.confidence,
      sufficient_info: d3.sufficient_info,
      alternatives: d3.alternatives?.map((a: any) => ({ ncm: a.ncm, ex: a.ex, reason: a.reason, source: a.alternatives_source })),
      model_used: d3.model_used,
    }, null, 2))

    // 4. UWP-D21 (microfone sem fio)
    console.log('\n>>> VALIDATING 4. UWP-D21 (microfone sem fio)...')
    const res4 = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        product_id: '0d6f7946-c95d-4d5e-9219-edc30b31feac',
        product_description: 'Sony UWP-D21 Camera-Mount Wireless Omni Lavalier Microphone System (UC14: 470 to 542 MHz) - Wireless Transmission: Analog UHF | RF Channels: 2772',
        brand: 'Sony',
        model: 'UWP-D21/14',
        top_n: 15,
        save_log: true,
      }),
    })
    const d4 = await res4.json()
    console.log('=== RESULT 4 (UWP-D21) ===', JSON.stringify({
      ncm: d4.recommendation?.ncm,
      ex: d4.recommendation?.ex,
      confidence: d4.confidence,
      sufficient_info: d4.sufficient_info,
      alternatives: d4.alternatives?.map((a: any) => ({ ncm: a.ncm, ex: a.ex, reason: a.reason, source: a.alternatives_source })),
      model_used: d4.model_used,
    }, null, 2))

    // 5. Manopla de servo zoom para teleobjetiva
    console.log('\n>>> VALIDATING 5. Manopla de servo zoom para teleobjetiva...')
    const res5 = await fetch(`${supabaseUrl}/functions/v1/classify-ncm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        product_description: 'Fujinon ERD-20A-A02 Zoom Demand / Manopla de controle de servo zoom e foco para teleobjetivas e lentes broadcast de estúdio. Dispositivo de comando remoto acoplável a tripé para acionamento de servomotores da objetiva.',
        brand: 'Fujinon',
        model: 'ERD-20A-A02',
        additional_specs: 'Requer conexão com o servo da lente broadcast/teleobjetiva para operar. Sem alimentação ou função autônoma independente.',
        top_n: 15,
        save_log: true,
      }),
    })
    const d5 = await res5.json()
    console.log('=== RESULT 5 (Manopla Servo Zoom) ===', JSON.stringify({
      ncm: d5.recommendation?.ncm,
      ex: d5.recommendation?.ex,
      confidence: d5.confidence,
      sufficient_info: d5.sufficient_info,
      alternatives: d5.alternatives?.map((a: any) => ({ ncm: a.ncm, ex: a.ex, reason: a.reason, source: a.alternatives_source })),
      model_used: d5.model_used,
    }, null, 2))
  }, 180000)
})
