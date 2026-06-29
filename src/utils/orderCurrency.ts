export function getDeliveryCountry(order: any, fetchedShipping?: any): string | null {
  const addr = fetchedShipping || order?.payment_data?.shipping_address
  if (addr?.country) return addr.country
  if (order?.delivery_address_country) return order.delivery_address_country
  if (order?.payment_data?.shipping_address?.country) {
    return order.payment_data.shipping_address.country
  }
  return null
}

export function isBrazilDelivery(country: string | null): boolean {
  if (!country) return false
  const normalized = country.toLowerCase().trim()
  return normalized === 'brasil' || normalized === 'brazil' || normalized === 'br'
}

export function formatCurrencyByCountry(value: any, country: string | null): string {
  const isBrazil = isBrazilDelivery(country)
  const prefix = isBrazil ? 'R$' : 'US$'
  const locale = isBrazil ? 'pt-BR' : 'en-US'
  try {
    return `${prefix} ${Number(value || 0).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  } catch {
    return `${prefix} ${value}`
  }
}

export function formatUSDCurrency(value: any): string {
  try {
    return `US$ ${Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  } catch {
    return `US$ ${value}`
  }
}

export function getShippingCost(order: any): number {
  if (order?.shipping_cost != null) return Number(order.shipping_cost)
  const pdShipping = order?.payment_data?.shipping_cost
  if (pdShipping != null) return Number(pdShipping)
  const pdFreight = order?.payment_data?.freight
  if (pdFreight != null) return Number(pdFreight)
  return 0
}

export function calculateSummarySubtotal(order: any, country: string | null): number {
  const isBrazil = isBrazilDelivery(country)
  if (isBrazil) {
    const total = Number(order?.total ?? 0)
    const shipping = getShippingCost(order)
    return total - shipping
  }
  return Number(order?.subtotal ?? 0)
}

export function isBrazilOrder(order: any, country: string | null): boolean {
  if (isBrazilDelivery(country)) return true
  const shippingMethod = (order?.shipping_method || '').toLowerCase()
  return shippingMethod.includes('brazil') || shippingMethod.includes('brasil')
}

export function formatShippingDisplay(order: any, country: string | null): string {
  const shippingCost = getShippingCost(order)
  if (shippingCost === 0 || isBrazilOrder(order, country)) {
    return 'incluso'
  }
  return formatCurrencyByCountry(shippingCost, country)
}

export interface ItemPriceInfo {
  price: number
  currencyCode: string | null
  isNationalized: boolean
}

export function resolveItemPriceInfo(item: any, country: string | null): ItemPriceInfo {
  const product = item?.products
  const isBrazil = isBrazilDelivery(country)
  const nationalizedSales = Number(product?.price_nationalized_sales ?? 0)
  const priceUsd = Number(product?.price_usd ?? 0)
  const nationalizedCurrency = product?.price_nationalized_currency ?? null

  if (isBrazil && nationalizedSales > 0) {
    return { price: nationalizedSales, currencyCode: nationalizedCurrency, isNationalized: true }
  }

  if (!isBrazil && priceUsd > 0) {
    return { price: priceUsd, currencyCode: 'USD', isNationalized: false }
  }

  if (priceUsd <= 0 && nationalizedSales > 0) {
    return { price: nationalizedSales, currencyCode: nationalizedCurrency, isNationalized: true }
  }

  return { price: Number(item?.unit_price ?? 0), currencyCode: null, isNationalized: false }
}

export function isItemNationalized(item: any, country: string | null): boolean {
  return resolveItemPriceInfo(item, country).isNationalized
}

export function formatItemUnitPrice(item: any, country: string | null): string {
  const info = resolveItemPriceInfo(item, country)
  if (info.isNationalized) {
    return formatCurrencyByCountry(info.price, 'Brazil')
  }
  return formatCurrencyByCountry(info.price, null)
}

export function getItemUnitPriceValue(item: any, country: string | null): number {
  return resolveItemPriceInfo(item, country).price
}

export function formatItemTotalPrice(item: any, country: string | null): string {
  const info = resolveItemPriceInfo(item, country)
  const qty = Number(item?.quantity ?? 1)
  const total = info.price * qty
  if (info.isNationalized) {
    return formatCurrencyByCountry(total, 'Brazil')
  }
  return formatCurrencyByCountry(total, null)
}

export function getItemTotalPriceValue(item: any, country: string | null): number {
  const info = resolveItemPriceInfo(item, country)
  const qty = Number(item?.quantity ?? 1)
  return info.price * qty
}
