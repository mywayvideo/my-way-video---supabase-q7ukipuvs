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
      return new Response(JSON.stringify({ error: 'CEP ou ZIP não fornecido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cleanZip = cep_or_zip.replace(/\D/g, '')
    const isBrazil =
      country?.toLowerCase().includes('brasil') ||
      country?.toLowerCase() === 'br' ||
      country?.toLowerCase() === 'brazil' ||
      cleanZip.length === 8

    let result: Record<string, unknown> = {
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
        return new Response(JSON.stringify({ error: 'Erro ao consultar ViaCEP' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const data = await response.json()
      if (data.erro) {
        return new Response(JSON.stringify({ error: 'CEP não encontrado' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      result = {
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
            street: '',
            neighborhood: '',
            city: place['place name'] || '',
            state: place['state abbreviation'] || '',
            country: 'USA',
            latitude: place['latitude'] ? parseFloat(place['latitude']) : null,
            longitude: place['longitude'] ? parseFloat(place['longitude']) : null,
          }
        }
      } else if (response.status === 404) {
        return new Response(JSON.stringify({ error: 'ZIP code não encontrado' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (!result.city && !result.state) {
      return new Response(
        JSON.stringify({ error: 'Local não encontrado para o código informado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Erro interno do servidor',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
