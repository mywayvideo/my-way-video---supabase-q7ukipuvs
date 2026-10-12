import { useState, useCallback, useRef, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Loader2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface NcmTaxInfo {
  ncm: string
  ncm_descricao_full: string | null
  ncm_descricao: string | null
  ii_rate: number | null
  ipi_rate: number | null
  pis_rate: number | null
  cofins_rate: number | null
}

// Cache em memória compartilhado por toda a sessão do app
const taxRatesCache = new Map<string, NcmTaxInfo | null>()

/**
 * Limpa apenas dígitos do NCM
 */
export function cleanNcm(code?: string | number | null): string {
  if (code === null || code === undefined) return ''
  return String(code).replace(/\D/g, '').trim()
}

/**
 * Formata NCM no padrão oficial aprovado: "XXXX.XX.XX" (ex.: "9007.10.00")
 */
export function formatNcmDisplayCode(code?: string | number | null): string {
  if (code === null || code === undefined) return ''
  const digits = cleanNcm(code)
  if (!digits) return String(code).trim()
  const p1 = digits.slice(0, 4)
  const p2 = digits.slice(4, 6)
  const p3 = digits.slice(6, 8)
  let res = p1
  if (p2) res += '.' + p2
  if (p3) res += '.' + p3
  return res
}

/**
 * Formata taxa percentual (ex: 10.8 -> "10,8%", 0 -> "0%")
 */
export function formatTaxPercentValue(val?: number | null): string {
  if (val === null || val === undefined || isNaN(Number(val))) {
    return '0%'
  }
  const num = Number(val)
  return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`
}

/**
 * Busca dados fiscais do NCM na tabela imp_sim_tax_rates com cache de sessão.
 */
export async function fetchNcmTaxRates(ncmCode: string): Promise<NcmTaxInfo | null> {
  const digits = cleanNcm(ncmCode)
  if (!digits || digits.length < 4) return null

  if (taxRatesCache.has(digits)) {
    return taxRatesCache.get(digits) ?? null
  }

  try {
    // 1. Tentar match exato de 8 dígitos
    const { data, error } = await supabase
      .from('imp_sim_tax_rates')
      .select('ncm, ncm_descricao_full, ncm_descricao, ii_rate, ipi_rate, pis_rate, cofins_rate')
      .eq('ncm', digits)
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn('Erro ao consultar alíquotas NCM:', error.message)
      return null
    }

    if (data) {
      const record: NcmTaxInfo = {
        ncm: data.ncm,
        ncm_descricao_full: data.ncm_descricao_full,
        ncm_descricao: data.ncm_descricao,
        ii_rate: data.ii_rate !== null ? Number(data.ii_rate) : null,
        ipi_rate: data.ipi_rate !== null ? Number(data.ipi_rate) : null,
        pis_rate: data.pis_rate !== null ? Number(data.pis_rate) : null,
        cofins_rate: data.cofins_rate !== null ? Number(data.cofins_rate) : null,
      }
      taxRatesCache.set(digits, record)
      return record
    }

    // 2. Se não encontrou exato e tem 8 dígitos, tenta prefixo
    taxRatesCache.set(digits, null)
    return null
  } catch (err) {
    console.warn('Falha na busca on-demand de NCM:', err)
    return null
  }
}

interface NcmTaxTooltipProps {
  ncm?: string | number | null
  children?: ReactNode
  className?: string
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  showIcon?: boolean
}

export function NcmTaxTooltip({
  ncm,
  children,
  className,
  align = 'center',
  side = 'top',
  showIcon = false,
}: NcmTaxTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [data, setData] = useState<NcmTaxInfo | null>(null)
  const hoverTimeoutRef = useRef<any>(null)

  const digits = cleanNcm(ncm)
  const formattedCode = formatNcmDisplayCode(ncm)

  const loadData = useCallback(async () => {
    if (!digits) return
    if (taxRatesCache.has(digits)) {
      setData(taxRatesCache.get(digits) ?? null)
      return
    }
    setIsLoading(true)
    const res = await fetchNcmTaxRates(digits)
    setData(res)
    setIsLoading(false)
  }, [digits])

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open) {
      loadData()
    }
  }

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(true)
      loadData()
    }, 120) // pequeno debounce para suavidade no hover
  }

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(false)
    }, 150)
  }

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    }
  }, [])

  if (!formattedCode) {
    return <span className={className}>—</span>
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <div
        className="inline-flex items-center"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 font-mono text-inherit underline-offset-4 hover:underline hover:text-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-500/50 rounded transition-colors cursor-pointer text-left',
              className,
            )}
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen((prev) => !prev)
              if (!isOpen) loadData()
            }}
            title="Clique ou passe o mouse para ver alíquotas de importação"
          >
            {children || <span>{formattedCode}</span>}
            {showIcon && <Info className="w-3.5 h-3.5 opacity-60 hover:opacity-100" />}
          </button>
        </PopoverTrigger>
      </div>

      <PopoverContent
        side={side}
        align={align}
        sideOffset={6}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="w-80 p-3 bg-zinc-950 border border-zinc-800 text-zinc-100 shadow-xl rounded-xl z-50 text-xs animate-in fade-in zoom-in-95"
      >
        <div className="space-y-2.5">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">
                NCM
              </span>
              <span className="font-mono font-bold text-sm text-white">{formattedCode}</span>
            </div>
            <span className="text-[10px] text-zinc-400">Alíquotas de Importação</span>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-4 space-y-2">
              <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
              <span className="text-zinc-400 text-[11px]">Consultando alíquotas...</span>
            </div>
          ) : data ? (
            <div className="space-y-2.5">
              {/* Descrição do NCM */}
              <div className="text-[11px] text-zinc-300 line-clamp-3 leading-relaxed bg-zinc-900/60 p-2 rounded border border-zinc-800/50">
                {data.ncm_descricao_full || data.ncm_descricao || 'Sem descrição cadastrada.'}
              </div>

              {/* Grid das alíquotas */}
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                <div className="flex flex-col items-center p-1.5 rounded bg-zinc-900/90 border border-zinc-800 text-center">
                  <span className="text-[10px] font-bold text-zinc-400">II</span>
                  <span className="font-mono font-semibold text-emerald-400 text-xs">
                    {formatTaxPercentValue(data.ii_rate)}
                  </span>
                </div>
                <div className="flex flex-col items-center p-1.5 rounded bg-zinc-900/90 border border-zinc-800 text-center">
                  <span className="text-[10px] font-bold text-zinc-400">IPI</span>
                  <span className="font-mono font-semibold text-sky-400 text-xs">
                    {formatTaxPercentValue(data.ipi_rate)}
                  </span>
                </div>
                <div className="flex flex-col items-center p-1.5 rounded bg-zinc-900/90 border border-zinc-800 text-center">
                  <span className="text-[10px] font-bold text-zinc-400">PIS</span>
                  <span className="font-mono font-semibold text-amber-400 text-xs">
                    {formatTaxPercentValue(data.pis_rate)}
                  </span>
                </div>
                <div className="flex flex-col items-center p-1.5 rounded bg-zinc-900/90 border border-zinc-800 text-center">
                  <span className="text-[10px] font-bold text-zinc-400">COFINS</span>
                  <span className="font-mono font-semibold text-purple-400 text-xs">
                    {formatTaxPercentValue(data.cofins_rate)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-3 text-center text-zinc-400 text-[11px]">
              NCM sem alíquotas cadastradas
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
