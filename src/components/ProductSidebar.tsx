import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function ProductSidebar() {
  const [searchTerm, setSearchTerm] = useState('')
  const navigate = useNavigate()

  const handleSearch = () => {
    if (searchTerm.trim()) {
      navigate(`/search-results?q=${encodeURIComponent(searchTerm.trim())}`)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="w-full h-full bg-card border-r border-border p-4 flex flex-col gap-4">
      <div className="space-y-4">
        <h3 className="font-semibold text-sm tracking-widest uppercase text-muted-foreground">
          Buscar na Base MY WAY
        </h3>
        <div className="relative flex items-center">
          <Input
            type="text"
            placeholder="Ex: Câmera Sony..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pr-10"
          />
          <Search className="absolute right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Placeholder para lista de resultados em tempo real */}
      </div>

      <div className="pt-4 border-t border-border mt-auto">
        <Button className="w-full font-medium" onClick={handleSearch} disabled={!searchTerm.trim()}>
          Ver todos os resultados
        </Button>
      </div>
    </div>
  )
}
