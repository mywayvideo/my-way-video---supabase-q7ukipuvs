import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { cep_or_zip, country } = await req.json()

    if (!cep_or_zip) {
      return new Response(JSON.stringify({ error: 'CEP ou ZIP não fornecido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cleanZip = cep_or_zip.replace(/\D/g, '')

    let result: any = {
      street: '',
      neighborhood: '',
      city: '',
      state: '',
      country: country || 'USA',
      latitude: null,
      longitude: null,
    }

    if (country?.toLowerCase() === 'brasil' || country?.toLowerCase() === 'brazil') {
      const response = await fetch(`https://viacep.com.br/ws/${cleanZip}/json/`)
      if (!response.ok) {
        return new Response(JSON.stringify({ error: 'Erro ao consultar ViaCEP' }), {
          status: 400,
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
      // US Zipcode lookup
      const response = await fetch(`https://api.zippopotam.us/us/${cleanZip}`)
      if (response.ok) {
        const data = await response.json()
        const place = data.places && data.places[0]
        if (place) {
          result.city = place['place name'] || ''
          result.state = place['state abbreviation'] || ''
          result.latitude = parseFloat(place['latitude'])
          result.longitude = parseFloat(place['longitude'])
        }
      }
    }

    // Try to get precise lat/lng using Google Geocoding API if not found or if we want exact
    const apiKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY')
    if (apiKey) {
      try {
        const addrStr = `${result.street}, ${result.city}, ${result.state} ${cleanZip} ${result.country}`
        const geoRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addrStr)}&key=${apiKey}`,
        )
        if (geoRes.ok) {
          const geoData = await geoRes.json()
          if (geoData.status === 'OK' && geoData.results?.[0]?.geometry?.location) {
            result.latitude = geoData.results[0].geometry.location.lat
            result.longitude = geoData.results[0].geometry.location.lng

            // Also refine street/city if empty
            if (!result.street || !result.city) {
              const components = geoData.results[0].address_components
              for (const comp of components) {
                if (comp.types.includes('route') && !result.street) result.street = comp.long_name
                if (comp.types.includes('locality') && !result.city) result.city = comp.long_name
                if (comp.types.includes('administrative_area_level_1') && !result.state)
                  result.state = comp.short_name
              }
            }
          }
        }
      } catch (e) {
        console.error('Geocoding fallback failed', e)
      }
    }

    if (!result.city && !result.state) {
      return new Response(JSON.stringify({ error: 'Local não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
