import React, { useMemo } from 'react'
import { ResponseFormatter as BaseResponseFormatter } from '@/components/AI/ResponseFormatter'

interface ResponseFormatterProps {
  message?: string
  content?: string
  stock?: any[]
  referenced_internal_products?: string[]
  products?: any[]
  [key: string]: any
}

export function ResponseFormatter(props: ResponseFormatterProps) {
  const {
    referenced_internal_products,
    stock,
    message,
    content,
    products: _propsProducts,
    ...rest
  } = props

  const textContent = message || content || ''

  const visibleProducts = useMemo(() => {
    const stockItems = Array.isArray(stock) ? stock : []
    const refIds = Array.isArray(referenced_internal_products) ? referenced_internal_products : []

    if (stockItems.length === 0) return []

    const lowerText = textContent.toLowerCase()

    const matches = stockItems.filter((p) => {
      const isReferenced = refIds.includes(p.id)
      const nameMatch = p.name && lowerText.includes(p.name.toLowerCase())
      const skuMatch = p.sku && lowerText.includes(p.sku.toLowerCase())
      const modelMatch = p.model && lowerText.includes(p.model.toLowerCase())

      return isReferenced || nameMatch || skuMatch || modelMatch
    })

    // Remove duplicates
    return matches.filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i)
  }, [referenced_internal_products, stock, textContent])

  return (
    <BaseResponseFormatter
      {...rest}
      message={textContent}
      content={textContent}
      stock={visibleProducts}
      referenced_internal_products={referenced_internal_products}
      products={visibleProducts}
    />
  )
}
