import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Loader2 } from 'lucide-react'

interface CategoryModalProps {
  onCategoryAdded?: (category: { id: string; name: string }) => void
  trigger?: React.ReactNode
}

export function CategoryModal({ onCategoryAdded, trigger }: CategoryModalProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAdd = async () => {
    if (!name.trim()) return
    setLoading(true)

    try {
      // 1. Check for existing category (case-insensitive) to prevent duplicates
      const { data: existing, error: searchError } = await supabase
        .from('categories')
        .select('id, name')
        .ilike('name', name.trim())
        .maybeSingle()

      if (searchError) throw searchError

      if (existing) {
        toast({
          title: 'Erro',
          description: 'Esta categoria ja existe.',
          variant: 'destructive',
        })
        setLoading(false)
        return
      }

      // 2. Insert new category safely wrapped in try/catch for RLS failures
      const { data: newCat, error: insertError } = await supabase
        .from('categories')
        .insert({ name: name.trim() })
        .select()
        .single()

      if (insertError) throw insertError

      toast({
        title: 'Sucesso',
        description: 'Categoria adicionada com sucesso.',
      })

      if (onCategoryAdded && newCat) {
        onCategoryAdded(newCat)
      }

      setOpen(false)
      setName('')
    } catch (error: any) {
      console.error('Error adding category:', error)
      toast({
        title: 'Erro',
        description: 'Erro ao adicionar categoria. Verifique suas permissoes.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" type="button">
            <Plus className="w-4 h-4 mr-2" />
            Nova Categoria
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Categoria</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">Nome da Categoria</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Câmeras"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAdd()
                }
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleAdd} disabled={loading || !name.trim()}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
