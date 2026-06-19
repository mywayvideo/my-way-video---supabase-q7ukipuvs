import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { adminOrdersService } from '@/services/adminOrdersService'
import { formatCurrency } from '@/utils/formatters'
import { supabase } from '@/lib/supabase/client'

const formatDate = (dateStr: string) => {
  if (!dateStr) return 'N/A'
  try {
    const d = new Date(dateStr)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const seconds = String(d.getSeconds()).padStart(2, '0')
    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`
  } catch (e) {
    return 'N/A'
  }
}

const safeFormatCurrency = (value: any) => {
  if (value === null || value === undefined) return '—'
  if (Number(value) === 0) return 'US$ 0.00'
  try {
    return formatCurrency(value, 'USD')
  } catch (e) {
    return `US$ ${Number(value).toFixed(2)}`
  }
}

const formatAddress = (address: any) => {
  if (!address) return 'N/A (Endereço não fornecido)'

  try {
    const street = address.street || 'N/A'
    const number = address.number || 'N/A'
    const complement = address.complement ? ` | ${address.complement}` : ''
    const city = address.city || 'N/A'
    const state = address.state || 'N/A'
    const zip = address.zip_code || 'N/A'
    const country = address.country || 'N/A'

    return `${street}, ${number}${complement} | ${city}, ${state} ${zip} | ${country}`
  } catch (e) {
    return 'N/A (Erro ao formatar endereço)'
  }
}

const getStatusBadge = (status: string) => {
  const s = status?.toUpperCase() || 'N/A'
  switch (s) {
    case 'PENDING':
    case 'PENDING_PAYMENT':
      return (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
          PENDING_PAYMENT
        </Badge>
      )
    case 'PAID':
      return (
        <Badge variant="outline" className="bg-green-100 text-green-800">
          PAID
        </Badge>
      )
    case 'CANCELLED':
      return <Badge variant="destructive">CANCELLED</Badge>
    case 'SHIPPED':
      return (
        <Badge variant="outline" className="bg-blue-100 text-blue-800">
          SHIPPED
        </Badge>
      )
    case 'DELIVERED':
      return (
        <Badge variant="outline" className="bg-purple-100 text-purple-800">
          DELIVERED
        </Badge>
      )
    default:
      return <Badge variant="secondary">{s}</Badge>
  }
}

export default function OrderDetailsDialog({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [details, setDetails] = useState<any>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [addresses, setAddresses] = useState<any>({ shipping: null, billing: null })
  const { toast } = useToast()

  useEffect(() => {
    if (open && orderId) {
      setLoading(true)
      adminOrdersService
        .getOrderDetails(orderId)
        .then(async (data) => {
          let shipping = Array.isArray(data.shipping_address)
            ? data.shipping_address[0]
            : data.shipping_address
          let billing = Array.isArray(data.billing_address)
            ? data.billing_address[0]
            : data.billing_address

          if (!shipping && data.shipping_address_id) {
            const { data: sData } = await supabase
              .from('customer_addresses')
              .select('*')
              .eq('id', data.shipping_address_id)
              .maybeSingle()
            if (sData) shipping = sData
          }
          if (!billing && data.billing_address_id) {
            const { data: bData } = await supabase
              .from('customer_addresses')
              .select('*')
              .eq('id', data.billing_address_id)
              .maybeSingle()
            if (bData) billing = bData
          }

          setAddresses({ shipping, billing })
          setDetails(data)
          setNotes(data.notes || '')
        })
        .catch(() => {
          toast({ title: 'Erro ao carregar detalhes', variant: 'destructive' })
        })
        .finally(() => setLoading(false))
    } else {
      setDetails(null)
      setAddresses({ shipping: null, billing: null })
    }
  }, [open, orderId, toast])

  const handleSaveNotes = async () => {
    if (!orderId) return
    try {
      await adminOrdersService.updateOrderNotes(orderId, notes)
      setDetails((prev: any) => ({ ...prev, notes }))
      toast({ title: 'Notas salvas com sucesso' })
    } catch (e) {
      toast({ title: 'Erro ao salvar notas', variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Pedido</DialogTitle>
        </DialogHeader>
        {loading || !details ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <section className="bg-muted/30 p-4 rounded-lg border">
                <h4 className="font-bold text-sm text-muted-foreground mb-3">
                  1. CABEÇALHO DO PEDIDO
                </h4>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-semibold">Número:</span> {details.order_number || 'N/A'}
                  </p>
                  <p>
                    <span className="font-semibold">Cliente:</span>{' '}
                    {details.customers?.full_name || 'N/A'}
                  </p>
                  <p>
                    <span className="font-semibold">Email:</span>{' '}
                    {details.customers?.email || 'N/A'}
                  </p>
                  <p>
                    <span className="font-semibold">Telefone:</span>{' '}
                    {details.customers?.phone || 'N/A'}
                  </p>
                </div>
              </section>

              <section className="bg-muted/30 p-4 rounded-lg border">
                <h4 className="font-bold text-sm text-muted-foreground mb-3">
                  2. RESUMO DO PEDIDO
                </h4>
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="font-semibold">Data:</span> {formatDate(details.created_at)}
                  </p>
                  <p>
                    <span className="font-semibold">Total:</span>{' '}
                    {safeFormatCurrency(details.total)}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Status:</span> {getStatusBadge(details.status)}
                  </div>
                  <p>
                    <span className="font-semibold">Método de Pagamento:</span>{' '}
                    {details.payment_method_type?.toUpperCase() || 'N/A'}
                  </p>
                </div>
              </section>

              <section className="bg-muted/30 p-4 rounded-lg border">
                <h4 className="font-bold text-sm text-muted-foreground mb-3">
                  3. ENDEREÇO DE ENTREGA
                </h4>
                <p className="text-sm text-foreground/80">
                  {formatAddress(addresses.shipping || details.payment_data?.shipping_address)}
                </p>
              </section>
            </div>

            <div className="space-y-6">
              <section className="bg-muted/30 p-4 rounded-lg border">
                <h4 className="font-bold text-sm text-muted-foreground mb-3">4. ITENS DO PEDIDO</h4>
                <div className="border rounded-md overflow-hidden bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Preço</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {details.order_items?.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell
                            className="font-medium max-w-[200px] truncate"
                            title={item.products?.name}
                          >
                            {item.product_id ? (
                              <a
                                href={`/product/${item.product_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                {item.products?.name || item.product_id}
                              </a>
                            ) : (
                              item.products?.name || item.product_id || 'N/A'
                            )}
                          </TableCell>
                          <TableCell className="text-right">{item.quantity || 0}</TableCell>
                          <TableCell className="text-right">
                            {safeFormatCurrency(item.unit_price)}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {safeFormatCurrency(item.total_price)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!details.order_items?.length && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                            Nenhum item encontrado
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>

              <section className="bg-muted/30 p-4 rounded-lg border">
                <h4 className="font-bold text-sm text-muted-foreground mb-3">5. OBSERVAÇÕES</h4>
                <div className="space-y-4">
                  <div className="text-sm bg-background p-3 rounded-md border min-h-[60px]">
                    {details.notes ? (
                      <p className="whitespace-pre-wrap">{details.notes}</p>
                    ) : (
                      <p className="text-muted-foreground italic">Sem observações</p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-border/50">
                    <Textarea
                      placeholder="Atualizar observações internas..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="bg-background"
                    />
                    <div className="flex justify-end mt-2">
                      <Button onClick={handleSaveNotes} size="sm" variant="secondary">
                        Salvar Notas
                      </Button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
