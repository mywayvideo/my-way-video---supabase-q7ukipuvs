import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { Order, CancellationReason } from '@/types/order'

interface Props {
  order: Order | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => void
  loading: boolean
}

export function OrderCancelModal({ order, open, onOpenChange, onConfirm, loading }: Props) {
  const [reason, setReason] = useState<CancellationReason | ''>('')
  const [customReason, setCustomReason] = useState('')

  const handleConfirm = () => {
    const finalReason = reason === 'Outro' ? customReason : reason
    if (finalReason) {
      onConfirm(finalReason)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] w-[90vw] bg-background">
        <DialogHeader>
          <DialogTitle>Cancelar Pedido</DialogTitle>
          <DialogDescription>
            Motivo do cancelamento do pedido {order?.order_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Select
            disabled={loading}
            value={reason}
            onValueChange={(val: CancellationReason) => setReason(val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o motivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Mudei de ideia">Mudei de ideia</SelectItem>
              <SelectItem value="Encontrei preco melhor">Encontrei preço melhor</SelectItem>
              <SelectItem value="Nao preciso mais">Não preciso mais</SelectItem>
              <SelectItem value="Produto nao atende minhas necessidades">
                Produto não atende minhas necessidades
              </SelectItem>
              <SelectItem value="Outro">Outro</SelectItem>
            </SelectContent>
          </Select>

          {reason === 'Outro' && (
            <Textarea
              placeholder="Descreva o motivo (máx 500 caracteres)"
              maxLength={500}
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              disabled={loading}
              className="resize-none"
            />
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            className="min-h-11"
            onClick={handleConfirm}
            disabled={!reason || (reason === 'Outro' && !customReason) || loading}
          >
            {loading ? 'Cancelando...' : 'Confirmar Cancelamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
