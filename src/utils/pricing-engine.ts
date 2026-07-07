import { calculateFinalPrice } from './pricing'

export const LBS_TO_KG_RATIO = 2.20462

export interface PriceSettingsData {
  markup: number
  freight_per_kg_usd: number
  weight_margin: number
  exchange_rate: number
  exchange_spread: number
}

export interface ExchangeRateData {
  usd_to_brl: number
  spread_percentage: number
}

export function calculateWeightKG(weightLbs: number, weightMarginLbs: number = 0): number {
  return (weightLbs + weightMarginLbs) / LBS_TO_KG_RATIO
}

export function calculateShippingCostUSD(
  weightLbs: number,
  freightPerKgUsd: number,
  weightMarginLbs: number = 0,
): number {
  if (weightLbs <= 0 || freightPerKgUsd <= 0) return 0
  const weightKG = calculateWeightKG(weightLbs, weightMarginLbs)
  return weightKG * freightPerKgUsd
}

export function calculateTotalUSD(
  product: any,
  settings: Pick<PriceSettingsData, 'markup' | 'freight_per_kg_usd' | 'weight_margin'>,
): number {
  const priceUSD = calculateFinalPrice(product)
  if (priceUSD <= 0) return 0

  const weightLbs = Number(product?.weight) || 0
  if (weightLbs <= 0) return 0

  const shipping = calculateShippingCostUSD(
    weightLbs,
    settings.freight_per_kg_usd,
    settings.weight_margin,
  )

  if (settings.markup <= 0) return 0
  return (priceUSD + shipping) / settings.markup
}

export function calculateTotalUSDFromValues(
  priceUSD: number,
  weightLbs: number,
  settings: Pick<PriceSettingsData, 'markup' | 'freight_per_kg_usd' | 'weight_margin'>,
): number {
  if (priceUSD <= 0 || weightLbs <= 0) return 0

  const shipping = calculateShippingCostUSD(
    weightLbs,
    settings.freight_per_kg_usd,
    settings.weight_margin,
  )

  if (settings.markup <= 0) return 0
  return (priceUSD + shipping) / settings.markup
}

export function calculateBRLFromUSD(totalUSD: number, exchangeRate: ExchangeRateData): number {
  if (totalUSD <= 0) return 0
  return totalUSD * (exchangeRate.usd_to_brl * (1 + exchangeRate.spread_percentage / 100))
}

export function calculateTotalBRL(
  product: any,
  priceSettings: PriceSettingsData,
  exchangeRate: ExchangeRateData,
): number {
  const totalUSD = calculateTotalUSD(product, priceSettings)
  return calculateBRLFromUSD(totalUSD, exchangeRate)
}
