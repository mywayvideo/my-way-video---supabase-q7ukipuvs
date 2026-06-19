import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CustomerAddressForm } from './CustomerAddressForm'
import { useAddressForm } from '@/hooks/useAddressForm'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Plus, Edit2, Trash2 } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: any
  setCustomer: (customer: any) => void
  onSave: (e: React.FormEvent) => void
}

function AddressManager({
  customerId,
  type,
}: {
  customerId: string
  type: 'shipping' | 'billing'
}) {
  const { addresses, isLoading, addAddress, updateAddress, deleteAddress } = useAddressForm(
    customerId,
    type,
  )
  const [editingAddress, setEditingAddress] = useState<any>(null)
  const [isAdding, setIsAdding] = useState(false)

  if (isLoading) return <div className="p-4 text-center text-sm">Carregando endereços...</div>

  if (isAdding || editingAddress) {
    const currentAddr = editingAddress || { country: 'Brasil' }
    return (
      <div className="space-y-4 border p-4 rounded-md bg-muted/20">
        <h4 className="font-medium text-sm">{isAdding ? 'Novo Endereço' : 'Editar Endereço'}</h4>
        <CustomerAddressForm
          type={type}
          address={currentAddr}
          onChange={(_, addr) => setEditingAddress(addr)}
        />
        <div className="flex items-center gap-2 mt-4 pt-2 border-t border-border/50">
          <Checkbox
            id={`default-addr-${type}`}
            checked={currentAddr.is_default || false}
            onCheckedChange={(c) => setEditingAddress({ ...currentAddr, is_default: !!c })}
          />
          <Label htmlFor={`default-addr-${type}`}>Definir como padrão</Label>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              setIsAdding(false)
              setEditingAddress(null)
            }}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={async () => {
              if (isAdding) {
                await addAddress(currentAddr)
              } else {
                await updateAddress(currentAddr.id, currentAddr)
              }
              setIsAdding(false)
              setEditingAddress(null)
            }}
          >
            Salvar Endereço
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {addresses.map((addr) => (
        <div
          key={addr.id}
          className="border p-4 rounded-md flex justify-between items-start bg-background"
        >
          <div className="space-y-1 text-sm flex-1">
            <p className="font-medium flex items-center gap-2">
              {addr.street}, {addr.number}
              {addr.is_default && (
                <Badge variant="secondary" className="text-xs font-normal">
                  Padrão
                </Badge>
              )}
            </p>
            {addr.complement && <p className="text-muted-foreground">{addr.complement}</p>}
            <p className="text-muted-foreground">
              {addr.neighborhood} - {addr.city}, {addr.state} - {addr.zip_code}
            </p>
            <p className="text-muted-foreground">{addr.country}</p>
          </div>
          <div className="flex gap-1 ml-4">
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className="h-8 w-8"
              onClick={() => setEditingAddress(addr)}
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className="h-8 w-8"
              onClick={() => deleteAddress(addr.id)}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
      {addresses.length === 0 && (
        <div className="text-center p-6 text-sm text-muted-foreground border border-dashed rounded-md">
          Nenhum endereço cadastrado.
        </div>
      )}
      <Button type="button" variant="outline" className="w-full" onClick={() => setIsAdding(true)}>
        <Plus className="w-4 h-4 mr-2" /> Adicionar Endereço
      </Button>
    </div>
  )
}

export function EditCustomerModal({ open, onOpenChange, customer, setCustomer, onSave }: Props) {
  if (!customer) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-6 pb-2">
          <SheetTitle>Editar Cliente</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 px-6">
          <div className="space-y-4 pb-6 mt-4">
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="basic">Básico</TabsTrigger>
                <TabsTrigger value="shipping">Entrega</TabsTrigger>
                <TabsTrigger value="billing">Cobrança</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4">
                <form onSubmit={onSave} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={customer.full_name || ''}
                      onChange={(e) => setCustomer({ ...customer, full_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      value={customer.email || ''}
                      onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CPF</Label>
                    <Input
                      value={customer.cpf || ''}
                      onChange={(e) => setCustomer({ ...customer, cpf: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input
                      value={customer.phone || ''}
                      onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Perfil</Label>
                    <Select
                      value={customer.role}
                      onValueChange={(v) => setCustomer({ ...customer, role: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="collaborator">Colaborador</SelectItem>
                        <SelectItem value="customer">Cliente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={customer.status}
                      onValueChange={(v) => setCustomer({ ...customer, status: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="pt-4">
                    <Button type="submit" className="w-full">
                      Salvar Alterações
                    </Button>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="shipping">
                <AddressManager customerId={customer.id} type="shipping" />
              </TabsContent>

              <TabsContent value="billing">
                <AddressManager customerId={customer.id} type="billing" />
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
