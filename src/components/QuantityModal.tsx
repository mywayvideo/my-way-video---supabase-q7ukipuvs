import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Minus, Plus } from 'lucide-react'
import { useCart } from '@/hooks/useCart'
import { toast } from 'sonner'

interface QuantityModalProps {
  product: any
  onClose: () => void
  onSuccess?: () => void
}

export function QuantityModal({ product, onClose, onSuccess }: QuantityModalProps) {
  const [qty, setQty] = useState(1)
  const { addToCart } = useCart()
  const [loading, setLoading] = useState(false)

  const handleAdd = async () => {
    if (qty < 1 || qty > 50) {
      toast.error('Quantidade inválida')
      return
    }
    setLoading(true)
    try {
      await addToCart(product.id, qty)
      toast.success('Adicionado ao carrinho!')
      if (onSuccess) onSuccess()
      onClose()
    } catch (e: any) {
      toast.error('Erro ao adicionar ao carrinho.', {
        action: { label: 'Tentar Novamente', onClick: () => handleAdd() },
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Selecione a Quantidade</DialogTitle>
          <DialogDescription className="sr-only">
            Selecione a quantidade para adicionar ao carrinho.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-6 py-4">
          {product.image_url && (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-32 h-32 object-contain bg-muted/10 rounded-md p-2"
            />
          )}
          <h3 className="font-medium text-center line-clamp-2">{product.name}</h3>

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQty(Math.max(1, qty - 1))}
              disabled={qty <= 1}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <span className="text-2xl font-bold w-12 text-center">{qty}</span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQty(Math.min(50, qty + 1))}
              disabled={qty >= 50}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleAdd} disabled={loading}>
            {loading ? 'Adicionando...' : 'Adicionar ao Carrinho'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
