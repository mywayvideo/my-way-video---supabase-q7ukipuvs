import { useState, KeyboardEvent } from 'react'
import { Search, X, Sparkles, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface AIPromptProps {
  onSearch: (query: string) => void
  isExternalLoading?: boolean
  className?: string
}

export function AIPrompt({ onSearch, isExternalLoading, className }: AIPromptProps) {
  const [query, setQuery] = useState('')

  const handleSearch = () => {
    if (query.trim()) {
      onSearch(query.trim())
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSearch()
    }
  }

  return (
    <div className={cn('relative w-full max-w-4xl mx-auto', className)}>
      {/* Background Glow */}
      <div className="absolute -inset-3 bg-orange-500/20 blur-3xl rounded-[3rem] opacity-80 animate-pulse pointer-events-none" />

      {/* Prompt Area */}
      <div className="relative flex items-center bg-background/80 backdrop-blur-md border border-white/10 rounded-[2.5rem] overflow-hidden focus-within:border-orange-500/30 focus-within:ring-1 focus-within:ring-orange-500/30 transition-all duration-300 shadow-2xl">
        {/* Left Icon */}
        <div className="pl-6 pr-4 flex items-center justify-center text-orange-500 shrink-0">
          <Sparkles className="w-6 h-6" />
        </div>

        {/* Text Area */}
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="O que você está procurando para sua produção? Para consultar diretamente o nosso banco de dados, utilize a barra de pesquisa do cabeçalho"
          className="flex-1 bg-transparent border-none outline-none resize-none py-4 text-foreground placeholder:text-muted-foreground text-base leading-relaxed h-[84px] overflow-y-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          disabled={isExternalLoading}
        />

        {/* Right Actions */}
        <div className="pr-4 pl-2 flex items-center justify-center gap-3 shrink-0">
          {query && !isExternalLoading && (
            <button
              onClick={() => setQuery('')}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-white/10 shrink-0 flex items-center justify-center"
              type="button"
              aria-label="Limpar busca"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <Button
            onClick={handleSearch}
            disabled={isExternalLoading || !query.trim()}
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-8 h-12 flex items-center justify-center shrink-0 transition-all shadow-lg shadow-orange-500/25"
          >
            {isExternalLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Search className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
