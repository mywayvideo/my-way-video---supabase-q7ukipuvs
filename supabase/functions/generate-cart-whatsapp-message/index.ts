import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { cartItems, subtotal, total, userEmail, userName } = body

    // Validation
    if (
      !Array.isArray(cartItems) ||
      typeof subtotal !== 'number' ||
      typeof total !== 'number' ||
      typeof userEmail !== 'string' ||
      typeof userName !== 'string'
    ) {
      return new Response(JSON.stringify({ error: 'Campos obrigatorios ausentes.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    for (const item of cartItems) {
      if (
        typeof item.productName !== 'string' ||
        typeof item.quantity !== 'number' ||
        typeof item.unitPrice !== 'number' ||
        typeof item.itemTotal !== 'number'
      ) {
        return new Response(JSON.stringify({ error: 'Campos obrigatorios ausentes.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Generate Message
    let message = 'Ola! Gostaria de ajuda com meu carrinho de compras.\n\n'
    message += 'Itens no carrinho:\n'

    for (const item of cartItems) {
      message += `- ${item.productName} x ${item.quantity} = R$ ${item.itemTotal}\n`
    }

    message += `\nSubtotal: R$ ${subtotal}\n`
    message += `Total: R$ ${total}\n\n`
    message += `Meu email: ${userEmail}\n`
    message += `Meu nome: ${userName}\n\n`
    message += 'Obrigado!'

    // Return Response
    return new Response(JSON.stringify({ message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error generating WhatsApp message:', error)
    return new Response(JSON.stringify({ error: 'Erro ao gerar mensagem.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
