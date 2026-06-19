import { cn } from '@/lib/utils'
import { HelpCircle } from 'lucide-react'

export function ProductPrice({
  originalPrice,
  discountedPrice,
  weight,
  discountPercentage,
  ruleName,
  className,
  size,
  currency,
  align = 'center',
  isRebateActive,
}: {
  originalPrice: number | null | undefined
  discountedPrice?: number | null | undefined
  weight?: number | null | undefined
  discountPercentage?: number | null
  ruleName?: string | null
  className?: string
  size?: 'sm' | 'default' | 'lg'
  currency?: string
  align?: 'left' | 'center' | 'right'
  isRebateActive?: boolean
}) {
  if (originalPrice === null || originalPrice === undefined || originalPrice <= 0) {
    return (
      <p
        className={cn(
          'text-[0.875rem] font-[600] text-foreground italic tracking-[0.05em] uppercase opacity-80 whitespace-nowrap flex items-center gap-1.5 w-full',
          align === 'center'
            ? 'justify-center text-center'
            : align === 'left'
              ? 'justify-start text-left'
              : 'justify-end text-right',
          className,
        )}
      >
        <HelpCircle className="w-[14px] h-[14px]" />
        Preço sob consulta
      </p>
    )
  }

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat(currency === 'BRL' ? 'pt-BR' : 'en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(val)
  }

  const showDiscount =
    discountedPrice !== null &&
    discountedPrice !== undefined &&
    discountedPrice < originalPrice &&
    discountedPrice > 0

  return (
    <div
      className={cn(
        'flex flex-col w-full animate-in fade-in zoom-in-[0.95] duration-500 opacity-100',
        align === 'center' ? 'items-center' : align === 'left' ? 'items-start' : 'items-end',
        className,
      )}
    >
      {showDiscount || isRebateActive ? (
        <>
          <div
            className={cn(
              'flex flex-wrap items-center gap-2 mb-1 w-full',
              align === 'center'
                ? 'justify-center'
                : align === 'left'
                  ? 'justify-start'
                  : 'justify-end',
            )}
          >
            <span className="text-[14px] line-through text-muted-foreground opacity-[0.85] font-medium leading-[1.4]">
              {formatPrice(originalPrice)}
            </span>
            {discountPercentage && discountPercentage > 0 ? (
              <span className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                {discountPercentage.toFixed(0)}% OFF
              </span>
            ) : null}
            {isRebateActive && (
              <span className="bg-amber-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider shadow-sm">
                REBATE
              </span>
            )}
          </div>
          <span
            className={cn(
              'font-extrabold text-green-500 leading-[1.2] bg-green-500/10 px-2 py-1 rounded-md shadow-sm w-fit',
              align === 'center' ? 'text-center' : align === 'left' ? 'text-left' : 'text-right',
              size === 'sm' ? 'text-[16px]' : size === 'lg' ? 'text-[26px]' : 'text-[22px]',
            )}
          >
            {formatPrice(discountedPrice ?? originalPrice)}
          </span>
          {originalPrice - discountedPrice! > 0 && (
            <div
              className={cn(
                'mt-1.5 flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-1 w-full',
                align === 'center'
                  ? 'items-center text-center'
                  : align === 'left'
                    ? 'items-start text-left'
                    : 'items-end text-right',
              )}
            >
              <span className="text-[12px] font-medium text-green-600 dark:text-green-400 animate-pulse">
                Economize {formatPrice(originalPrice - discountedPrice!)}
              </span>
              {ruleName && (
                <span
                  className={cn(
                    'text-[10px] text-muted-foreground italic',
                    align === 'center'
                      ? 'text-center'
                      : align === 'left'
                        ? 'text-left'
                        : 'text-right',
                  )}
                >
                  Desconto: {ruleName}
                  {size === 'lg' && ' (Melhor desconto aplicado)'}
                </span>
              )}
            </div>
          )}
        </>
      ) : (
        <span
          className={cn(
            'font-extrabold text-green-500 leading-[1.2] bg-green-500/10 px-2 py-1 rounded-md shadow-sm w-fit',
            align === 'center' ? 'text-center' : align === 'left' ? 'text-left' : 'text-right',
            size === 'sm' ? 'text-[16px]' : size === 'lg' ? 'text-[26px]' : 'text-[22px]',
          )}
        >
          {formatPrice(originalPrice)}
        </span>
      )}
    </div>
  )
}
