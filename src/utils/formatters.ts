export function formatCurrency(value: number | null | undefined, currency: string = 'USD'): string {
  try {
    if (value === null || value === undefined) return '—'
    if (value === 0) return currency === 'USD' ? 'US$ 0.00' : 'R$ 0,00'

    const numValue = Number(value)
    if (isNaN(numValue)) return `US$ ${value}`

    if (currency === 'USD') {
      const formatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      return `US$ ${formatter.format(numValue)}`
    } else if (currency === 'BRL') {
      const formatter = new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      return `R$ ${formatter.format(numValue)}`
    }

    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(numValue)
  } catch (error) {
    return `US$ ${value}`
  }
}
