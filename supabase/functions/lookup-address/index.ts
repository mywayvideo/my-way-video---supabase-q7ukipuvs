import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const cep_or_zip: string | undefined = body?.cep_or_zip
    const country: string | undefined = body?.country

    if (!cep_or_zip) {
      return new Response(
        JSON.stringify({ success: false, error: 'CEP ou ZIP não fornecido' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const cleanZip = cep_or_zip.replace(/\D/g, '')
    const isBrazil = country?.toLowerCase().includes('brasil') ||
      country?.toLowerCase() === 'br' ||
      country?.toLowerCase() === 'brazil' ||
      cleanZip.length === 8

    const notFoundResponse = (message: string) =>
      new Response(
        JSON.stringify({ success: false, error: message }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )

    let result: Record<string, unknown> = {
      success: true,
      street: '',
      neighborhood: '',
      city: '',
      state: '',
      country: country || (isBrazil ? 'Brasil' : 'USA'),
      latitude: null,
      longitude: null,
    }

    if (isBrazil) {
      const response = await fetch(`https://viacep.com.br/ws/${cleanZip}/json/`)
      if (!response.ok) {
        return notFoundResponse('Erro ao consultar ViaCEP')
      }

      const data = await response.json()
      if (data.erro) {
        return notFoundResponse('CEP não encontrado')
      }

      result = {
        success: true,
        street: data.logradouro || '',
        neighborhood: data.bairro || '',
        city: data.localidade || '',
        state: data.uf || '',
        country: 'Brasil',
        latitude: null,
        longitude: null,
      }
    } else {
      const response = await fetch(`https://api.zippopotam.us/us/${cleanZip}`)
      if (response.ok) {
        const data = await response.json()
        const place = data.places && data.places[0]
        if (place) {
          result = {
            success: true,
            street: '',
            neighborhood: '',
            city: place['place name'] || '',
            state: place['state abbreviation'] || '',
            country: 'USA',
            latitude: place['latitude'] ? parseFloat(place['latitude']) : null,
            longitude: place['longitude'] ? parseFloat(place['longitude']) : null,
          }
        } else {
          return notFoundResponse('ZIP code não encontrado')
        }
      } else if (response.status === 404) {
        return notFoundResponse('ZIP code não encontrado')
      } else {
        return notFoundResponse('Erro ao consultar ZIP code')
      }
    }

    if (!result.city && !result.state) {
      return notFoundResponse('Local não encontrado para o código informado')
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno do servidor',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
