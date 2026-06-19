import React, { useState, useEffect, useRef } from 'react'
import { Sparkles, CheckCircle2, AlertTriangle, AlertCircle, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useCart } from '@/hooks/useCart'
import { ResponseFormatter } from '@/components/ResponseFormatter'
import { AILoader } from '@/components/AI/AILoader'

interface Product {
  id: string
  name: string
  description?: string
  price_usd?: number
  image_url?: string
}

interface AIResult {
  message?: string
  confidence_level?: 'high' | 'medium' | 'low'
  referenced_internal_products?: Product[]
  should_show_whatsapp_button?: boolean
  whatsapp_reason?: string
  is_intermediate?: boolean
  products?: any[]
}

interface AISearchResultsProps {
  isLoading: boolean
  result?: AIResult | null
  error?: string | null
  className?: string
  isAdmin?: boolean
}

export function AISearchResults({
  isLoading,
  result,
  error,
  className,
  isAdmin,
}: AISearchResultsProps) {
  const { addItem } = useCart()
  const containerRef = useRef<HTMLDivElement>(null)
  const prevLoadingRef = useRef(isLoading)

  useEffect(() => {
    if (
      (isLoading && !prevLoadingRef.current) ||
      (!isLoading && prevLoadingRef.current && result)
    ) {
      setTimeout(() => {
        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    }
    prevLoadingRef.current = isLoading
  }, [isLoading, result])

  if (isLoading && (!result || !result.is_intermediate)) {
    return (
      <div
        ref={containerRef}
        id="ai-search-results"
        className={cn('scroll-mt-32 relative w-full py-16', className)}
      >
        <div className="relative z-10 flex flex-col items-center justify-center space-y-6">
          <AILoader size="large" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        ref={containerRef}
        className={cn(
          'scroll-mt-32 rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-red-500',
          className,
        )}
      >
        <div className="flex items-center space-x-2">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (!result) return null

  const confidenceColor =
    result.confidence_level === 'high'
      ? 'text-green-400 bg-green-400/10 border-green-400/20 shadow-[0_0_10px_rgba(34,197,94,0.2)]'
      : result.confidence_level === 'medium'
        ? 'text-amber-400 bg-amber-400/10 border-amber-400/20 shadow-[0_0_10px_rgba(251,191,36,0.2)]'
        : 'text-red-400 bg-red-400/10 border-red-400/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]'

  return (
    <div
      ref={containerRef}
      className={cn(
        'scroll-mt-32 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl',
        className,
      )}
    >
      <div className="mb-6 flex flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-slate-100 truncate">
            Consultor Técnico IA
          </h3>
        </div>

        {result.confidence_level && (
          <div
            className={cn(
              'inline-flex shrink-0 items-center space-x-1.5 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wider',
              confidenceColor,
              !isAdmin && 'px-2',
            )}
            title={!isAdmin ? `Confiança: ${result.confidence_level}` : undefined}
          >
            {result.confidence_level === 'high' ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            {isAdmin && (
              <span className="hidden sm:inline">Confiança: {result.confidence_level}</span>
            )}
          </div>
        )}
      </div>

      <div
        className={cn(
          'text-slate-300 leading-relaxed',
          result.is_intermediate && 'flex justify-center py-8',
        )}
      >
        {result.is_intermediate ? (
          <AILoader size="default" />
        ) : (
          <ResponseFormatter
            content={(result.message || '')
              .replace(/realizando busca profunda my way/gi, '')
              .trim()}
            products={
              typeof result.referenced_internal_products?.[0] === 'object'
                ? (result.referenced_internal_products as any[])
                : undefined
            }
            referenced_internal_products={
              typeof result.referenced_internal_products?.[0] === 'string'
                ? (result.referenced_internal_products as string[])
                : undefined
            }
          />
        )}
      </div>

      {result.should_show_whatsapp_button && !result.is_intermediate && (
        <div className="mt-6 rounded-lg border border-green-500/20 bg-green-500/10 p-4">
          <div className="flex flex-col items-center justify-between space-y-4 sm:flex-row sm:space-y-0">
            <div className="text-sm text-green-400">
              <span className="font-semibold block mb-1">Recomendação do Consultor:</span>
              {result.whatsapp_reason ||
                'Este projeto requer análise detalhada por um especialista.'}
            </div>
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white sm:w-auto shrink-0"
              onClick={() => {
                const text = encodeURIComponent(
                  `Olá! Gostaria de falar com um especialista sobre o seguinte resultado da IA:\n\n${result.message?.substring(0, 150)}...`,
                )
                window.open(`https://wa.me/5511999999999?text=${text}`, '_blank')
              }}
            >
              Falar com Especialista
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
