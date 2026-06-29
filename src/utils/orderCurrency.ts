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
