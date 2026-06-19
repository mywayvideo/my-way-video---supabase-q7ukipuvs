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

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: any
  setCustomer: (customer: any) => void
  onSave: (e: React.FormEvent) => void
}

export function CreateCustomerModal({ open, onOpenChange, customer, setCustomer, onSave }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Novo Cliente</SheetTitle>
        </SheetHeader>
        <div className="mt-6">
          <form onSubmit={onSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                required
                value={customer.full_name}
                onChange={(e) => setCustomer({ ...customer, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                required
                type="email"
                value={customer.email}
                onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input
                required
                type="password"
                minLength={8}
                value={customer.password}
                onChange={(e) => setCustomer({ ...customer, password: e.target.value })}
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
            <Button type="submit" className="w-full">
              Criar Cliente
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
