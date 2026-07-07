import { calculateFinalPrice } from './pricing'
import {
  calculateTotalUSDFromValues,
  calculateBRLFromUSD,
  type PriceSettingsData,
  type ExchangeRateData,
} from './pricing-engine'

export type Destination = 'brasil' | 'usa'

export const safeNum = (val: any) => parseFloat(String(val).replace(/[^\d.-]/g, '')) || 0

export function getEligibilityAndPrice(
  product: any,
  destination: Destination,
  exchangeRate: ExchangeRateData | null,
  priceSettings: PriceSettingsData | null,
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
      currency = 'BRL'
      rule = 'A'
      const natCurrency = product?.price_nationalized_currency || 'BRL'
      if (natCurrency === 'USD' && exchangeRate) {
        price = calculateBRLFromUSD(price_nationalized_sales, exchangeRate)
      } else if (natCurrency === 'USD') {
        price = 0
      } else {
        price = price_nationalized_sales
      }
    } else if (price_usa > 0 && weight > 0 && priceSettings && exchangeRate) {
      eligible = true
      currency = 'BRL'
      rule = 'B'
      const totalUSD = calculateTotalUSDFromValues(price_usa, weight, priceSettings)
      price = calculateBRLFromUSD(totalUSD, exchangeRate)
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
