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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Search, Plus, MoreHorizontal, ShieldAlert, Edit, Trash2, ShoppingCart } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function DashboardAdminCustomers(props: any) {
  const {
    customers,
    total,
    page,
    setPage,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    isLoading,
    loading,
    handleEditCustomer,
    handleDeleteCustomer,
    handleReset2FA,
    handleCreateCustomer,
  } = props

  const isDataLoading = isLoading || loading

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca'
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy HH:mm', { locale: ptBR })
    } catch {
      return 'Data inválida'
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar clientes..."
              className="pl-8"
              value={searchTerm || ''}
              onChange={(e) => setSearchTerm && setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={statusFilter || 'all'} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => handleCreateCustomer && handleCreateCustomer()}>
          <Plus className="w-4 h-4 mr-2" /> Novo Cliente
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome / Email</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data de Cadastro</TableHead>
              <TableHead>Último Acesso</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isDataLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Carregando clientes...
                </TableCell>
              </TableRow>
            ) : customers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum cliente encontrado.
                </TableCell>
              </TableRow>
            ) : (
              customers?.map((customer: any) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <div className="font-medium">{customer.full_name || 'Sem nome'}</div>
                    <div className="text-sm text-muted-foreground">{customer.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        customer.role === 'admin'
                          ? 'default'
                          : customer.role === 'collaborator'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {customer.role === 'admin'
                        ? 'Admin'
                        : customer.role === 'collaborator'
                          ? 'Colaborador'
                          : 'Cliente'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={customer.status === 'ativo' ? 'secondary' : 'destructive'}
                      className={
                        customer.status === 'ativo'
                          ? 'bg-green-500/10 text-green-600 hover:bg-green-500/20'
                          : ''
                      }
                    >
                      {customer.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(customer.created_at)}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {formatDate(customer.last_login)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => handleEditCustomer && handleEditCustomer(customer)}
                        >
                          <Edit className="w-4 h-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            to={`/admin/checkout-assistido/${customer.id}`}
                            className="flex items-center cursor-pointer w-full"
                          >
                            <ShoppingCart className="w-4 h-4 mr-2" /> Checkout Assistido
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleReset2FA && handleReset2FA(customer)}
                        >
                          <ShieldAlert className="w-4 h-4 mr-2" /> Resetar 2FA
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDeleteCustomer && handleDeleteCustomer(customer.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-between items-center text-sm text-muted-foreground">
        <div>Total de {total || 0} clientes</div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage && setPage(Math.max(1, (page || 1) - 1))}
            disabled={!page || page === 1}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage && setPage((page || 1) + 1)}
            disabled={!customers || customers.length < 10}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  )
}
