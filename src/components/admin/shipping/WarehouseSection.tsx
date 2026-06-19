import { useState, useRef } from 'react'
import { WarehouseLocation } from '@/hooks/useShippingConfig'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

interface Props {
  warehouse: WarehouseLocation
  setWarehouse: (w: WarehouseLocation) => void
  onSave: (w: WarehouseLocation) => Promise<boolean>
}

export function WarehouseSection({ warehouse, setWarehouse, onSave }: Props) {
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const handleCalculate = async () => {
    if (!warehouse.address) {
      toast({ title: 'Endereço não pode estar vazio.', variant: 'destructive' })
      return
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(warehouse.address)}`,
      )
      const data = await res.json()
      if (data && data.length > 0) {
        setWarehouse({
          ...warehouse,
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
        })
        toast({ title: 'Coordenadas calculadas com sucesso!' })
      } else {
        toast({
          title: 'Não foi possível encontrar as coordenadas para este endereço.',
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({ title: 'Erro ao processar. Tente novamente.', variant: 'destructive' })
    }
  }

  const handleSave = () => {
    if (
      warehouse.latitude < -90 ||
      warehouse.latitude > 90 ||
      warehouse.longitude < -180 ||
      warehouse.longitude > 180
    ) {
      toast({ title: 'Coordenadas inválidas.', variant: 'destructive' })
      return
    }
    if (!warehouse.address) {
      toast({ title: 'O endereço não pode ser vazio.', variant: 'destructive' })
      return
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    setIsSaving(true)

    timerRef.current = setTimeout(async () => {
      const success = await onSave(warehouse)
      setIsSaving(false)
      if (success) {
        toast({ title: 'Localizacao do warehouse atualizada com sucesso!' })
      } else {
        toast({ title: 'Erro ao processar. Tente novamente.', variant: 'destructive' })
      }
    }, 500)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Warehouse Location</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Address</Label>
          <Input
            value={warehouse.address}
            onChange={(e) => setWarehouse({ ...warehouse, address: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Latitude</Label>
            <Input
              type="number"
              step="0.0001"
              value={warehouse.latitude}
              onChange={(e) =>
                setWarehouse({ ...warehouse, latitude: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Longitude</Label>
            <Input
              type="number"
              step="0.0001"
              value={warehouse.longitude}
              onChange={(e) =>
                setWarehouse({ ...warehouse, longitude: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleCalculate}>
            Calcular Coordenadas
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            Salvar Localizacao
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
