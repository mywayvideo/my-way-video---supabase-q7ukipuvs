export interface PriceSettings {
  exchange_rate: number
  exchange_spread: number
  price_per_kg: number
  percentage_value: number
  additional_weight_kg: number
}

export function calculatePriceBRL(
  priceUsd: number | null | undefined,
  weight: number | null | undefined,
  discountPercentage: number | null | undefined,
  settings: PriceSettings | null,
): number | null {
  if (!priceUsd || priceUsd <= 0 || !weight || weight <= 0 || !settings) {
    return null
  }

  const { exchange_rate, exchange_spread, price_per_kg, percentage_value, additional_weight_kg } =
    settings

  let priceUsdAfterDiscount = priceUsd
  if (discountPercentage && discountPercentage > 0) {
    priceUsdAfterDiscount = priceUsd * (1 - discountPercentage / 100)
  }

  const weightInKg = weight / 2.204
  const totalWeightKg = weightInKg + additional_weight_kg
  const freightUsd = totalWeightKg * price_per_kg
  const percentageCharge = (priceUsdAfterDiscount * percentage_value) / 100
  const totalUsd = priceUsdAfterDiscount + freightUsd + percentageCharge

  const effectiveExchangeRate = exchange_rate + exchange_spread
  const priceBrlFinal = totalUsd * effectiveExchangeRate

  return Math.round(priceBrlFinal * 100) / 100
}
