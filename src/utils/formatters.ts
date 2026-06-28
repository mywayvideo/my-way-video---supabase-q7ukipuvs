function normalizeSupabaseDate(dateStr: string): string {
  if (dateStr.includes('Z') || /[+-]\d{2}:\d{2}$/.test(dateStr)) {
    return dateStr
  }
  return dateStr.replace(' ', 'T') + 'Z'
}

export function formatOrderDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--'
  const date = new Date(normalizeSupabaseDate(dateStr))
  if (isNaN(date.getTime())) return '--'
  return date.toLocaleDateString('pt-BR')
}

export function formatOrderDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '--'
  const date = new Date(normalizeSupabaseDate(dateStr))
  if (isNaN(date.getTime())) return '--'
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

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
