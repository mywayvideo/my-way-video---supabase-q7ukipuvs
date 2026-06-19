import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Edit, Trash2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Database } from '@/lib/supabase/types'
import { format } from 'date-fns'

type CacheEntry = Database['public']['Tables']['product_search_cache']['Row']

interface Props {
  entries: CacheEntry[]
  loading: boolean
  onEdit: (entry: CacheEntry) => void
  onDelete: (id: string) => void
}

export function AdminCacheTable({ entries, loading, onEdit, onDelete }: Props) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl bg-card border border-border/50" />
        ))}
        <p className="text-center text-sm text-muted-foreground animate-pulse mt-4">
          Processando sua pesquisa...
        </p>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-border/50 rounded-xl bg-card">
        <p className="text-muted-foreground">
          Nenhum produto em cache. Adicione um novo produto acima.
        </p>
      </div>
    )
  }

  const fmtMoney = (v: number | null, c: string | null) =>
    v != null
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: c || 'USD' }).format(v)
      : '-'

  const sourceLabels: Record<string, string> = {
    manual_entry: 'Manual',
    ai_generated: 'IA Gerado',
    web_search: 'Busca Web',
  }

  return (
    <>
      <div className="hidden md:block rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-muted/20">
            <TableRow>
              <TableHead className="w-1/4">Query</TableHead>
              <TableHead className="w-1/4">Produto</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Fonte</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="max-w-[200px] truncate font-medium" title={e.search_query}>
                  {e.search_query}
                </TableCell>
                <TableCell
                  className="max-w-[200px] truncate text-muted-foreground"
                  title={e.product_name}
                >
                  {e.product_name}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {fmtMoney(e.product_price, e.product_currency)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    {sourceLabels[e.source] || e.source}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {e.created_at ? format(new Date(e.created_at), 'dd/MM/yyyy') : '-'}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(e)}
                    className="hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(e.id)}
                    className="hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden flex flex-col gap-4">
        {entries.map((e) => (
          <Card key={e.id} className="p-5 flex flex-col gap-4 shadow-sm border-border/50">
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-base leading-tight truncate" title={e.product_name}>
                  {e.product_name}
                </p>
                <p className="text-xs text-muted-foreground mt-1.5 font-medium flex gap-1 items-center">
                  <span className="opacity-70 uppercase tracking-widest text-[9px]">Query:</span>
                  <span className="truncate">{e.search_query}</span>
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 bg-muted/50 text-[10px]">
                {sourceLabels[e.source] || e.source}
              </Badge>
            </div>
            <div className="flex justify-between items-end border-t border-border/50 pt-4">
              <div className="flex flex-col gap-1 text-xs">
                <span className="font-mono font-bold text-primary">
                  {fmtMoney(e.product_price, e.product_currency)}
                </span>
                <span className="text-muted-foreground">
                  {e.created_at ? format(new Date(e.created_at), 'dd/MM/yyyy') : '-'}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(e)} className="h-8">
                  Editar
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(e.id)}
                  className="h-8"
                >
                  Excluir
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}
