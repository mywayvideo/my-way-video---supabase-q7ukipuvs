import { calculateFinalPrice } from './pricing'

export type Destination = 'brasil' | 'usa'

export const safeNum = (val: any) => parseFloat(String(val).replace(/[^\d.-]/g, '')) || 0

export function getEligibilityAndPrice(
  product: any,
  destination: Destination,
  exchangeRate: number,
  shippingSettings: { pricePerKg: number; percentageValue: number; additionalWeightKg: number },
) {
  let eligible = false
  let price = 0
  let reason = ''
  let rule = ''
  let currency = 'USD'

  const price_usa = calculateFinalPrice(product)
  const weight = safeNum(product?.weight)
  const price_nationalized_sales = safeNum(product?.price_nationalized_sales)

  if (destination === 'brasil') {
    if (price_nationalized_sales > 0) {
      eligible = true
      currency = product?.price_nationalized_currency || 'BRL'
      price =
        currency === 'USD' ? price_nationalized_sales * exchangeRate : price_nationalized_sales
      currency = 'BRL' // After conversion, it's always BRL
      rule = 'A'
    } else if (price_usa > 0 && weight > 0) {
      eligible = true
      currency = 'BRL'
      rule = 'B'
      const pricePerKg = safeNum(shippingSettings?.pricePerKg)
      const percentageValue = safeNum(shippingSettings?.percentageValue)
      const additionalWeightKg = safeNum(shippingSettings?.additionalWeightKg)

      const weight_kg = weight / 2.204
      const total_weight = weight_kg + additionalWeightKg
      const freight_usd = total_weight * pricePerKg
      const percentage_charge_usd = (price_usa * percentageValue) / 100

      const total_usd = price_usa + freight_usd + percentage_charge_usd
      price = total_usd * exchangeRate
    } else {
      eligible = false
      reason = 'Indisponível para o destino'
    }
  } else {
    if (price_usa > 0) {
      eligible = true
      price = price_usa
      currency = 'USD'
      rule = 'C'
    } else {
      eligible = false
      reason = 'Indisponível para o destino'
    }
  }

  return { eligible, price, reason, rule, currency }
}
