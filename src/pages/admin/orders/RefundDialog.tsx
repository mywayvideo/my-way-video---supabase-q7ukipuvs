import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AdminOrder } from '@/types/admin-order'

interface Props {
  order: AdminOrder | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onProcess: (order: AdminOrder, data: any) => Promise<void>
}

export default function RefundDialog({ order, open, onOpenChange, onProcess }: Props) {
  const [formData, setFormData] = useState({
    reason: '',
    amount: '',
    bankHolderName: '',
    bankAccountNumber: '',
    bankRoutingNumber: '',
    bankName: '',
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && order) {
      setFormData({
        reason: '',
        amount: String(order.total_amount),
        bankHolderName: '',
        bankAccountNumber: '',
        bankRoutingNumber: '',
        bankName: '',
      })
    }
  }, [open, order])

  const handleSubmit = async () => {
    if (!order) return
    try {
      setLoading(true)
      await onProcess(order, formData)
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  const isValid =
    formData.reason &&
    formData.amount &&
    formData.bankHolderName &&
    formData.bankAccountNumber &&
    formData.bankRoutingNumber &&
    formData.bankName

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Processar Devolução</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Motivo (obrigatório)</Label>
            <Textarea
              disabled={loading}
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Valor do Reembolso</Label>
              <Input
                disabled={loading}
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Nome do Banco</Label>
              <Input
                disabled={loading}
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Nome do Titular da Conta</Label>
            <Input
              disabled={loading}
              value={formData.bankHolderName}
              onChange={(e) => setFormData({ ...formData, bankHolderName: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Número da Conta</Label>
              <Input
                disabled={loading}
                value={formData.bankAccountNumber}
                onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Agência / Routing</Label>
              <Input
                disabled={loading}
                value={formData.bankRoutingNumber}
                onChange={(e) => setFormData({ ...formData, bankRoutingNumber: e.target.value })}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !isValid}>
            Processar Devolução
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
