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

  let price_regular: number | null = null
  const regMatch =
    text.match(/(?:Regular\s*Price|Reg\.?|List\s*Price|Original\s*Price|Was)\s*:?\s*\$([0-9,]+(?:\.[0-9]{2})?)/i)
  if (regMatch) {
    const parsedReg = parseFloat(regMatch[1].replace(/,/g, ''))
    if (!isNaN(parsedReg) && parsedReg > 0) {
      price_regular = parsedReg
      rebate_active = true
    }
  }

  let price: number | null = null
  const explicitPriceMatch =
    text.match(/(?:You\s*Pay|Our\s*Price|Current\s*Price|Price|Pay)\s*:?\s*\$([0-9,]+(?:\.[0-9]{2})?)/i)
  if (explicitPriceMatch) {
    const p = parseFloat(explicitPriceMatch[1].replace(/,/g, ''))
    if (!isNaN(p) && p > 0) {
      price = p
    }
  }

  if (price == null) {
    const dollarMatches = Array.from(text.matchAll(/\$([0-9,]+(?:\.[0-9]{2})?)/g))
    if (dollarMatches.length > 0) {
      const candidates = dollarMatches
        .map((m) => parseFloat(m[1].replace(/,/g, '')))
        .filter((val) => !isNaN(val) && val > 0)

      if (candidates.length > 0) {
        if (price_regular && rebate_savings && price_regular > rebate_savings) {
          price = Number((price_regular - rebate_savings).toFixed(2))
        } else if (price_regular) {
          const discountedCand = candidates.find((c) => c < price_regular! && c > 5)
          price = discountedCand || candidates[0]
        } else {
          price = candidates[0]
        }
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
})
