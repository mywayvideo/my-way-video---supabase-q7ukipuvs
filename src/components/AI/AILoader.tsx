import { cn } from '@/lib/utils'
import { Sparkles } from 'lucide-react'

interface AILoaderProps {
  className?: string
  size?: 'small' | 'default' | 'large'
}

export function AILoader({ className, size = 'default' }: AILoaderProps) {
  const containerSizeClasses = {
    small: 'w-16 h-16',
    default: 'w-24 h-24',
    large: 'w-32 h-32',
  }

  const iconSizeClasses = {
    small: 'w-5 h-5',
    default: 'w-8 h-8',
    large: 'w-10 h-10',
  }

  return (
    <div className={cn('flex items-center justify-center w-full', className)}>
      <div className={cn('relative flex items-center justify-center', containerSizeClasses[size])}>
        {/* Outer glow aura */}
        <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/20 via-yellow-500/20 to-transparent rounded-full blur-xl animate-pulse" />

        {/* Orbiting rings */}
        <div className="absolute inset-0 rounded-full border-[2px] border-orange-500/20 border-t-orange-500/80 animate-[spin_3s_linear_infinite]" />

        <div className="absolute inset-[15%] rounded-full border-[2px] border-yellow-500/20 border-r-yellow-500/80 animate-[spin_2s_linear_infinite_reverse]" />

        <div className="absolute inset-[30%] rounded-full border-[2px] border-white/20 border-b-white/80 animate-[spin_1.5s_linear_infinite]" />

        {/* Inner pulsing core */}
        <div className="relative flex items-center justify-center rounded-full shadow-[0_0_25px_rgba(249,115,22,0.4)] z-10 w-[45%] h-[45%] bg-black">
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-orange-500/20 to-yellow-500/20 backdrop-blur-md animate-pulse" />
          <Sparkles
            className={cn('text-yellow-500 animate-pulse relative z-20', iconSizeClasses[size])}
          />
        </div>
      </div>
    </div>
  )
}
