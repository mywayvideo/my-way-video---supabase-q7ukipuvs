import { useState, useRef } from 'react'
import { ShippingRange } from '@/hooks/useShippingConfig'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Edit2, Trash2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface Props {
  ranges: ShippingRange[]
  setRanges: (r: ShippingRange[]) => void
  onSave: (r: ShippingRange[]) => Promise<boolean>
}

export function MiamiRangesSection({ ranges, setRanges, onSave }: Props) {
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [currentRange, setCurrentRange] = useState<ShippingRange>({
    id: '',
    min_km: 0,
    max_km: 0,
    cost_usd: 0,
  })

  const handleOpenNew = () => {
    setCurrentRange({ id: crypto.randomUUID(), min_km: 0, max_km: 0, cost_usd: 0 })
    setEditingId(null)
    setIsOpen(true)
  }

  const handleOpenEdit = (r: ShippingRange) => {
    setCurrentRange({ ...r })
    setEditingId(r.id)
    setIsOpen(true)
  }

  const handleDelete = (id: string) => {
    setRanges(ranges.filter((r) => r.id !== id))
  }

  const handleSaveModal = () => {
    if (currentRange.min_km < 0)
      return toast({ title: 'Distancia minima deve ser >= 0.', variant: 'destructive' })
    if (currentRange.max_km <= currentRange.min_km)
      return toast({ title: 'Distancia maxima deve ser maior que minima.', variant: 'destructive' })
    if (currentRange.cost_usd <= 0)
      return toast({ title: 'Custo deve ser > 0.', variant: 'destructive' })

    let newRanges = [...ranges]
    if (editingId) {
      newRanges = newRanges.map((r) => (r.id === editingId ? currentRange : r))
    } else {
      if (newRanges.length >= 6)
        return toast({ title: 'Maximo de 6 faixas atingido.', variant: 'destructive' })
      newRanges.push(currentRange)
    }

    newRanges.sort((a, b) => a.min_km - b.min_km)

    for (let i = 1; i < newRanges.length; i++) {
      if (newRanges[i].min_km < newRanges[i - 1].max_km) {
        return toast({ title: 'Faixas nao podem se sobrepor.', variant: 'destructive' })
      }
    }

    setRanges(newRanges)
    setIsOpen(false)
  }

  const handleSaveAll = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setIsSaving(true)

    timerRef.current = setTimeout(async () => {
      const payload = ranges.map(({ id, ...rest }) => rest)
      const success = await onSave(payload as any)
      setIsSaving(false)
      if (success) {
        toast({ title: 'Faixas de distancia atualizadas com sucesso!' })
      } else {
        toast({ title: 'Erro ao processar. Tente novamente.', variant: 'destructive' })
      }
    }, 500)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Frete Local (Miami)</CardTitle>
        <Button onClick={handleOpenNew} disabled={ranges.length >= 6}>
          Adicionar Faixa
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dist. Minima (km)</TableHead>
                <TableHead>Dist. Maxima (km)</TableHead>
                <TableHead>Custo (USD)</TableHead>
                <TableHead className="w-[100px]">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranges.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">
                    Nenhuma faixa configurada.
                  </TableCell>
                </TableRow>
              ) : (
                ranges.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.min_km}</TableCell>
                    <TableCell>{r.max_km}</TableCell>
                    <TableCell>{r.cost_usd}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button size="icon" variant="ghost" onClick={() => handleOpenEdit(r)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleDelete(r.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <Button onClick={handleSaveAll} disabled={isSaving}>
          Salvar Faixas
        </Button>

        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{editingId ? 'Editar Faixa' : 'Nova Faixa'}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Distancia Minima (km)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={currentRange.min_km}
                  onChange={(e) =>
                    setCurrentRange({ ...currentRange, min_km: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Distancia Maxima (km)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={currentRange.max_km}
                  onChange={(e) =>
                    setCurrentRange({ ...currentRange, max_km: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Custo (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={currentRange.cost_usd}
                  onChange={(e) =>
                    setCurrentRange({ ...currentRange, cost_usd: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <Button className="w-full" onClick={handleSaveModal}>
                Aplicar
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  )
}
