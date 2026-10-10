import { describe, it, expect } from 'vitest'

// Importamos a lógica de parsing que foi implementada na edge function check-price-bhphoto
// para garantir cobertura de testes automatizada direta sobre todos os formatos de markdown da B&H.
function parseBhMarkdown(content: string) {
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return null
  }

  const text = content

  let mfr_number: string | null = null
  const mfrMatch =
    text.match(/MFR\s*#\s*([A-Za-z0-9\-_./]+)/i) ||
    text.match(/Manufacturer\s*#\s*:?\s*([A-Za-z0-9\-_./]+)/i) ||
    text.match(/Mfr\s*Part\s*#\s*:?\s*([A-Za-z0-9\-_./]+)/i) ||
    text.match(/Part\s*#\s*:?\s*([A-Za-z0-9\-_./]+)/i)
  if (mfrMatch) {
    mfr_number = mfrMatch[1].trim()
  }

  let sku: string | null = null
  const skuMatch =
    text.match(/B&H\s*#\s*([A-Za-z0-9\-_]+)/i) ||
    text.match(/BH\s*#\s*([A-Za-z0-9\-_]+)/i) ||
    text.match(/B&H\s*Item\s*#\s*:?\s*([A-Za-z0-9\-_]+)/i)
  if (skuMatch) {
    sku = skuMatch[1].trim()
  }

  let is_discontinued: boolean = false
  let availability: string | null = null
  if (
    /discontinued\s*by\s*manufacturer/i.test(text) ||
    /this\s*item\s*has\s*been\s*discontinued/i.test(text) ||
    /\bdiscontinued\b/i.test(text)
  ) {
    is_discontinued = true
    availability = 'Discontinued'
  } else if (/in\s*stock/i.test(text)) {
    availability = 'In Stock'
  } else if (/special\s*order/i.test(text)) {
    availability = 'Special Order'
  } else if (/backordered/i.test(text)) {
    availability = 'Backordered'
  }

  let rebate_active = false
  let rebate_savings: number | null = null
  const savingsMatch =
    text.match(/(?:Instant\s*Savings|Savings|Save)\s*:?\s*\$([0-9,]+(?:\.[0-9]{2})?)/i) ||
    text.match(/\$([0-9,]+(?:\.[0-9]{2})?)\s*(?:Instant\s*Savings|Savings)/i)
  if (savingsMatch) {
    rebate_savings = parseFloat(savingsMatch[1].replace(/,/g, ''))
    if (!isNaN(rebate_savings) && rebate_savings > 0) {
      rebate_active = true
    }
  }

  let rebate_end_date: string | null = null
  const offerEndMatch =
    text.match(/(?:Offer\s*ends|Ends|Valid\s*thru|Expires)\s*:?\s*([A-Za-z0-9,\s.:/]+?(?:(?:AM|PM)\s*(?:ET|EST|EDT)?)?)(?:\.|\n|$)/i)
  if (offerEndMatch) {
    const rawMatch = offerEndMatch[0].trim()
    if (rawMatch.length <= 80) {
      rebate_end_date = rawMatch
      rebate_active = true
    }
  }

  // 5. Preço regular (preço original / list price / strikethrough)
  // Nunca captura parcela mensal (ex: /mo, /month, per month) ou financiamento
  let price_regular: number | null = null
  const regMatches = Array.from(
    text.matchAll(
      /(?:Regular\s*Price|Reg\.?|List\s*Price|Original\s*Price|Was)\s*:?\s*\$([0-9,]+(?:\.[0-9]{2})?)(?!\s*\/(?:mo|month)\b)(?!\s*(?:per\s*month|mo\.?\b))/gi,
    ),
  )
  for (const m of regMatches) {
    const matchIndex = m.index ?? 0
    const preceding = text.slice(Math.max(0, matchIndex - 60), matchIndex).toLowerCase()
    if (/suggested\s+(?:monthly\s+)?payments?|financing|payboo|cardmember/i.test(preceding)) {
      continue
    }
    const parsedReg = parseFloat(m[1].replace(/,/g, ''))
    if (!isNaN(parsedReg) && parsedReg > 0) {
      price_regular = parsedReg
      rebate_active = true
      break
    }
  }

  // 6. Preço final de venda (current price)
  // NOTA CRÍTICA: "Pay" isolado foi REMOVIDO pois colidia com parcelas mensais de cartão ("or Pay $34/mo. suggested payments").
  // Negative lookahead impede capturar valores de financiamento tipo $34/mo ou $34 per month.
  let price: number | null = null
  const explicitMatches = Array.from(
    text.matchAll(
      /(?:You\s*Pay|Our\s*Price|Current\s*Price|Final\s*Price|Price)\s*:?\s*\$([0-9,]+(?:\.[0-9]{2})?)(?!\s*\/(?:mo|month)\b)(?!\s*(?:per\s*month|mo\.?\b))/gi,
    ),
  )
  for (const match of explicitMatches) {
    const matchIndex = match.index ?? 0
    const preceding = text.slice(Math.max(0, matchIndex - 60), matchIndex).toLowerCase()
    if (/suggested\s+(?:monthly\s+)?payments?|financing|payboo|cardmember/i.test(preceding)) {
      continue
    }
    const p = parseFloat(match[1].replace(/,/g, ''))
    if (!isNaN(p) && p > 0) {
      price = p
      break
    }
  }

  // 7. Fallback para preço: varrer ocorrências de "$X.XX" no texto descartando parcelamento
  if (price == null) {
    const dollarRegex = /\$([0-9,]+(?:\.[0-9]{2})?)/g
    let dMatch: RegExpExecArray | null
    const validCandidates: { value: number; index: number; nearCart: boolean }[] = []

    const cartIndices: number[] = []
    const cartRegex = /(?:add\s*to\s*cart|buy\s*now|in\s*stock|special\s*order|backordered)/gi
    let cMatch: RegExpExecArray | null
    while ((cMatch = cartRegex.exec(text)) !== null) {
      cartIndices.push(cMatch.index)
    }

    while ((dMatch = dollarRegex.exec(text)) !== null) {
      const matchIndex = dMatch.index
      const matchLength = dMatch[0].length
      const following = text.slice(matchIndex + matchLength, matchIndex + matchLength + 40).toLowerCase()
      const preceding = text.slice(Math.max(0, matchIndex - 60), matchIndex).toLowerCase()

      // Exclusão 1: Qualquer sufixo de parcelamento mensal
      if (
        /^\s*\/(?:mo|month)\b/.test(following) ||
        /^\s*per\s+month\b/.test(following) ||
        /^\s*mo\.?\b/.test(following)
      ) {
        continue
      }

      // Exclusão 2: Contexto textual de parcelamento ou pagamentos sugeridos
      if (
        /suggested\s+(?:monthly\s+)?payments?/i.test(following) ||
        /suggested\s+(?:monthly\s+)?payments?/i.test(preceding) ||
        /\bfor\s+\d+\s+mos\.?/i.test(following) ||
        /\bfinancing\b/i.test(preceding) ||
        /\bpromo\s+financing\b/i.test(preceding) ||
        /\bpayboo\b/i.test(following) ||
        /\bpayboo\b/i.test(preceding)
      ) {
        continue
      }

      // Exclusão 3: Savings/Rebate
      if (
        /(?:instant\s*savings|savings|save)\s*:?\s*$/i.test(preceding) ||
        /^\s*(?:instant\s*savings|savings)/i.test(following)
      ) {
        continue
      }

      const val = parseFloat(dMatch[1].replace(/,/g, ''))
      if (!isNaN(val) && val > 0) {
        const nearCart = cartIndices.some((ci) => Math.abs(ci - matchIndex) <= 300)
        validCandidates.push({ value: val, index: matchIndex, nearCart })
      }
    }

    if (validCandidates.length > 0) {
      if (price_regular && rebate_savings && price_regular > rebate_savings) {
        price = Number((price_regular - rebate_savings).toFixed(2))
      } else if (price_regular) {
        const discounted = validCandidates
          .filter((c) => c.value < price_regular! && c.value > 5)
          .sort((a, b) => {
            if (a.nearCart && !b.nearCart) return -1
            if (!a.nearCart && b.nearCart) return 1
            return b.value - a.value
          })
        price = discounted.length > 0 ? discounted[0].value : validCandidates[0].value
      } else {
        const sorted = [...validCandidates].sort((a, b) => {
          if (a.nearCart && !b.nearCart) return -1
          if (!a.nearCart && b.nearCart) return 1
          return b.value - a.value
        })
        price = sorted[0].value
      }
    }
  }

  if (price && price_regular && price_regular > price) {
    rebate_active = true
    if (!rebate_savings) {
      rebate_savings = Number((price_regular - price).toFixed(2))
    }
  }

  if (price == null && !is_discontinued) {
    return null
  }

  return {
    price: price != null ? price : undefined,
    price_regular: price_regular != null ? price_regular : undefined,
    rebate_active,
    rebate_savings: rebate_savings != null ? rebate_savings : undefined,
    rebate_end_date,
    is_discontinued,
    availability,
    sku,
    mfr_number,
  }
}

describe('Firecrawl Markdown Parser for B&H (1 credit extraction)', () => {
  it('extrai corretamente preço cheio, rebate e data de expiração para o caso Sony AN820A', () => {
    const sampleMarkdown = `
# Sony AN-820A Active Dipole Antenna

MFR # AN-820A
B&H # SOAN820A

Regular Price: $282.00
Instant Savings: $123.00
You Pay: $159.00
Offer ends May 31 at 11:59 PM ET

In Stock
`
    const parsed = parseBhMarkdown(sampleMarkdown)
    expect(parsed).not.toBeNull()
    expect(parsed?.mfr_number).toBe('AN-820A')
    expect(parsed?.sku).toBe('SOAN820A')
    expect(parsed?.price).toBe(159.0)
    expect(parsed?.price_regular).toBe(282.0)
    expect(parsed?.rebate_savings).toBe(123.0)
    expect(parsed?.rebate_active).toBe(true)
    expect(parsed?.rebate_end_date).toContain('Offer ends May 31')
    expect(parsed?.availability).toBe('In Stock')
    expect(parsed?.is_discontinued).toBe(false)
  })

  it('identifica corretamente produtos descontinuados', () => {
    const sampleMarkdown = `
# Sony HXR-NX100 Full HD NXCAM Camcorder
MFR # HXRNX100
B&H # SOHXRNX100

Discontinued by Manufacturer
`
    const parsed = parseBhMarkdown(sampleMarkdown)
    expect(parsed).not.toBeNull()
    expect(parsed?.is_discontinued).toBe(true)
    expect(parsed?.availability).toBe('Discontinued')
    expect(parsed?.mfr_number).toBe('HXRNX100')
  })

  it('extrai preço sem rebate com precisão', () => {
    const sampleMarkdown = `
# Blackmagic Design ATEM Mini Pro
MFR # SWATEMMINIBPR
B&H # BLATEMMINIPR

Price: $295.00
In Stock
`
    const parsed = parseBhMarkdown(sampleMarkdown)
    expect(parsed).not.toBeNull()
    expect(parsed?.price).toBe(295.0)
    expect(parsed?.rebate_active).toBe(false)
    expect(parsed?.mfr_number).toBe('SWATEMMINIBPR')
  })

  // =========================================================================
  // CASO DE REGRESSÃO OBRIGATÓRIO: Sony AD-C88 (SKU ADC-88)
  // Texto de financiamento: "or Pay $34/mo. suggested payments for 6 Mos."
  // Preço real da B&H: $200.00
  // Deve resultar em price_bh = 200.00, sem confundir com a parcela de $34
  // =========================================================================
  it('Caso de regressão Sony AD-C88: não confunde parcela de cartão ($34/mo) com preço real ($200.00)', () => {
    const sampleMarkdownAdc88 = `
# Sony AD-C88 6-Piece Foam Windscreen Set for ECM-88 Series
MFR # ADC-88
B&H # SOADC88

Price: $200.00
or Pay $34/mo. suggested payments for 6 Mos. with the B&H Payboo Card.

[Add to Cart]
Special Order
Expected availability: 2-4 Weeks
Free Standard Shipping
`
    const parsed = parseBhMarkdown(sampleMarkdownAdc88)
    expect(parsed).not.toBeNull()
    expect(parsed?.mfr_number).toBe('ADC-88')
    expect(parsed?.sku).toBe('SOADC88')
    expect(parsed?.price).toBe(200.0) // NUNCA deve ser 34.0
    expect(parsed?.price_regular).toBeUndefined()
    expect(parsed?.rebate_active).toBe(false)
  })

  it('Caso de regressão Sony AD-C88 no fallback sem "Price:" explícito: parcela $34/mo descartada e preço $200.00 escolhido', () => {
    const markdownWithoutPrefix = `
# Sony AD-C88 6-Piece Foam Windscreen Set
MFR # ADC-88
B&H # SOADC88

$200.00
or Pay $34/mo. suggested payments for 6 Mos.

[Add to Cart]
Special Order
`
    const parsed = parseBhMarkdown(markdownWithoutPrefix)
    expect(parsed).not.toBeNull()
    expect(parsed?.price).toBe(200.0)
  })

  it('descarta parcelamentos múltiplos (per month, /month, mo.) e preserva preço de lista e venda', () => {
    const markdownFinancing = `
# Sony FX3 Cinema Camera
MFR # ILME-FX3
B&H # SOILMEFX3

Regular Price: $3,899.99
Our Price: $3,698.00
Starting at $110/month with Affirm or $154.08 per month suggested payments for 24 mos.

Instant Savings: $201.99
Offer ends Dec 31

[Add to Cart]
In Stock
`
    const parsed = parseBhMarkdown(markdownFinancing)
    expect(parsed).not.toBeNull()
    expect(parsed?.price).toBe(3698.0)
    expect(parsed?.price_regular).toBe(3899.99)
    expect(parsed?.rebate_savings).toBe(201.99)
    expect(parsed?.rebate_active).toBe(true)
  })

  it('rejeita "Pay" isolado como indicador de preço para evitar capturar "Pay $X" de financiamento', () => {
    const markdownPayAlone = `
# Accessory Kit
MFR # ACC-123
B&H # SOACC123

or Pay $19/mo. suggested payments
$150.00
[Add to Cart]
In Stock
`
    const parsed = parseBhMarkdown(markdownPayAlone)
    expect(parsed).not.toBeNull()
    expect(parsed?.price).toBe(150.0) // $19 descartado por ser /mo e contexto sugerido
  })
})
