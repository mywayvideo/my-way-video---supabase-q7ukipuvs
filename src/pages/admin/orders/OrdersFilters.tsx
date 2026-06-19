import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GetOrdersFilters } from '@/services/adminOrdersService'

interface Props {
  filters: GetOrdersFilters
  setFilters: (f: GetOrdersFilters) => void
  onApply: () => void
}

export default function OrdersFilters({ filters, setFilters, onApply }: Props) {
  const [local, setLocal] = useState<GetOrdersFilters>(filters)

  const handleApply = () => {
    setFilters({ ...local, page: 1 })
  }

  const handleClear = () => {
    const cleared = { page: 1, limit: 10 }
    setLocal(cleared)
    setFilters(cleared)
  }

  return (
    <div className="bg-card border rounded-lg p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Select
          value={local.status || 'ALL'}
          onValueChange={(v) => setLocal({ ...local, status: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="pending_payment">Pendente</SelectItem>
            <SelectItem value="paid">Pago</SelectItem>
            <SelectItem value="shipped">Enviado</SelectItem>
            <SelectItem value="delivered">Entregue</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Buscar cliente ou email..."
          value={local.search || ''}
          onChange={(e) => setLocal({ ...local, search: e.target.value })}
        />

        <div className="flex gap-2">
          <Input
            type="date"
            title="Data Inicial"
            value={local.startDate || ''}
            onChange={(e) => setLocal({ ...local, startDate: e.target.value })}
          />
          <Input
            type="date"
            title="Data Final"
            value={local.endDate || ''}
            onChange={(e) => setLocal({ ...local, endDate: e.target.value })}
          />
        </div>

        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Min USD"
            value={local.minAmount || ''}
            onChange={(e) => setLocal({ ...local, minAmount: Number(e.target.value) || undefined })}
          />
          <Input
            type="number"
            placeholder="Max USD"
            value={local.maxAmount || ''}
            onChange={(e) => setLocal({ ...local, maxAmount: Number(e.target.value) || undefined })}
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleApply} className="flex-1">
            Aplicar
          </Button>
          <Button variant="outline" onClick={handleClear} className="flex-1">
            Limpar
          </Button>
        </div>
      </div>
    </div>
  )
}
