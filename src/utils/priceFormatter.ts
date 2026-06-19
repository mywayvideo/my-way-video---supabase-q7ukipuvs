export interface FormattedPrice {
  text: string
  isPlaceholder: boolean
}

export function formatPrice(price?: number | null): FormattedPrice {
  if (price === null || price === undefined || price < 0.01) {
    return { text: 'PREÇO SOB CONSULTA', isPlaceholder: true }
  }
  return {
    text:
      'US$ ' +
      price.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    isPlaceholder: false,
  }
}

export function formatPriceBRL(price?: number | null): FormattedPrice {
  if (price === null || price === undefined || price < 0.01) {
    return { text: 'PREÇO SOB CONSULTA', isPlaceholder: true }
  }
  return {
    text:
      'R$ ' +
      price.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    isPlaceholder: false,
  }
}
