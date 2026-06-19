interface ProductPricingData {
  price_usd?: number | string | null
  price_usa?: number | string | null
  price_usa_rebate?: number | string | null
  date_rebate?: string | Date | null
}

export const calculateFinalPrice = (p?: ProductPricingData | null): number => {
  if (!p) return 0

  const basePrice = Number(p.price_usd) || Number(p.price_usa) || 0

  const rebate = Number(p.price_usa_rebate) || 0

  if (rebate <= 0) {
    return basePrice
  }

  // Rebate sem validade
  if (!p.date_rebate) {
    return rebate
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rebateDate = new Date(p.date_rebate)
  rebateDate.setHours(0, 0, 0, 0)

  return today <= rebateDate ? rebate : basePrice
}
