import { calculateTotalUSDFromValues, calculateBRLFromUSD } from '@/utils/pricing-engine'

export interface PriceSettings {
  markup: number
  freight_per_kg_usd: number
  weight_margin: number
}

export interface ExchangeRateSettings {
  usd_to_brl: number
  spread_percentage: number
}

export function calculatePriceBRL(
  priceUsd: number | null | undefined,
  weight: number | null | undefined,
  discountPercentage: number | null | undefined,
  priceSettings: PriceSettings | null,
  exchangeRate: ExchangeRateSettings | null,
): number | null {
  if (!priceUsd || priceUsd <= 0 || !weight || weight <= 0 || !priceSettings || !exchangeRate) {
    return null
  }

  let effectivePriceUsd = priceUsd
  if (discountPercentage && discountPercentage > 0) {
    effectivePriceUsd = priceUsd * (1 - discountPercentage / 100)
  }

  const totalUSD = calculateTotalUSDFromValues(effectivePriceUsd, weight, priceSettings)
  if (totalUSD <= 0) return null

  const brlValue = calculateBRLFromUSD(totalUSD, exchangeRate)
  return Math.round(brlValue * 100) / 100
}
