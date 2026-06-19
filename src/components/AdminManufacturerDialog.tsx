import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (id: string) => void
}

export function AdminManufacturerDialog({ open, onOpenChange, onSuccess }: Props) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    const { data, error } = await supabase
      .from('manufacturers')
      .insert([{ name: name.trim() }])
      .select()
      .single()

    setLoading(false)
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    } else if (data) {
      toast({ title: 'Sucesso', description: 'Fabricante adicionado.' })
      onSuccess(data.id)
      setName('')
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-white/10">
        <DialogHeader>
          <DialogTitle>Novo Fabricante</DialogTitle>
          <DialogDescription>Adicione uma nova marca ou fabricante ao sistema.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mfg_name">Nome do Fabricante</Label>
            <Input
              id="mfg_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Blackmagic Design"
              className="bg-background/50 border-white/10"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90">
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
