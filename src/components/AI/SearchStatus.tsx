import { cn } from '@/lib/utils'

interface SearchStatusProps {
  hasNabIntelligence?: boolean
  className?: string
}

export function SearchStatus({ hasNabIntelligence, className }: SearchStatusProps) {
  if (!hasNabIntelligence) return null

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-orange-500/50 bg-orange-500/20 px-3 py-1 text-xs font-bold text-orange-200 shadow-[0_0_12px_rgba(249,115,22,0.4)]">
        🔥 COBERTURA AO VIVO - NAB 2026
      </span>
    </div>
  )
}
