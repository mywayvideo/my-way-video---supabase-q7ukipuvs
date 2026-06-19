import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { useDebounce } from '@/hooks/use-debounce'
import { Database } from '@/lib/supabase/types'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, HardDrive, ArrowLeft } from 'lucide-react'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { AdminCacheTable } from '@/components/AdminCacheTable'
import { AdminCacheForm, ProductCacheFormValues } from '@/components/AdminCacheForm'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type CacheEntry = Database['public']['Tables']['product_search_cache']['Row']
const PAGE_SIZE = 20

export default function AdminProductCache() {
  const [entries, setEntries] = useState<CacheEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [formLoading, setFormLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const [editingEntry, setEditingEntry] = useState<CacheEntry | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const navigate = useNavigate()

  const fetchData = async () => {
    setLoading(true)
    try {
      let q = supabase.from('product_search_cache').select('*', { count: 'exact' })
      if (debouncedSearch) {
        q = q.or(`product_name.ilike.%${debouncedSearch}%,search_query.ilike.%${debouncedSearch}%`)
      }
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, count, error } = await q
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error
      setEntries(data || [])
      if (count !== null) setTotal(count)
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao carregar produtos. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [page, debouncedSearch])

  const handleAdd = async (values: ProductCacheFormValues) => {
    setFormLoading(true)
    try {
      const payload = {
        ...values,
        product_price: values.product_price || null,
        product_specs: values.product_specs ? JSON.parse(values.product_specs) : null,
        created_by_admin: true,
      }
      const { error } = await supabase.from('product_search_cache').insert([payload])
      if (error) throw error
      toast({ title: 'Sucesso', description: 'Produto adicionado ao cache com sucesso!' })
      fetchData()
    } catch (err) {
      toast({
        title: 'Erro',
        description: 'Falha ao salvar produto no servidor.',
        variant: 'destructive',
      })
    } finally {
      setFormLoading(false)
    }
  }

  const handleUpdate = async (values: ProductCacheFormValues) => {
    if (!editingEntry) return
    setFormLoading(true)
    try {
      const payload = {
        ...values,
        product_price: values.product_price || null,
        product_specs: values.product_specs ? JSON.parse(values.product_specs) : null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase
        .from('product_search_cache')
        .update(payload)
        .eq('id', editingEntry.id)
      if (error) throw error
      toast({ title: 'Sucesso', description: 'Produto atualizado com sucesso!' })
      setEditingEntry(null)
      fetchData()
    } catch (err) {
      toast({ title: 'Erro', description: 'Falha ao atualizar produto.', variant: 'destructive' })
    } finally {
      setFormLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      const { error } = await supabase.from('product_search_cache').delete().eq('id', deletingId)
      if (error) throw error
      toast({ title: 'Sucesso', description: 'Produto removido do cache.' })
      fetchData()
    } catch (error) {
      toast({ title: 'Erro', description: 'Erro ao remover.', variant: 'destructive' })
    } finally {
      setDeletingId(null)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1

  return (
    <div className="container mx-auto px-4 py-8 animate-fade-in max-w-7xl min-h-[70vh]">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        <Breadcrumb className="m-0">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/admin">Admin</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Product Cache</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3 text-foreground">
          <div className="bg-primary/10 p-2 rounded-lg text-primary">
            <HardDrive className="w-6 h-6" />
          </div>
          Cache de Produtos para Pesquisa de IA
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl">
          Gerencie os resultados cacheados para respostas rápidas e otimizadas da IA.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        <Card className="p-6 xl:sticky xl:top-24 shadow-sm border-border/50 col-span-1">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            Adicionar Novo Produto
          </h2>
          <AdminCacheForm onSubmit={handleAdd} loading={formLoading} />
        </Card>

        <div className="xl:col-span-2 flex flex-col gap-6">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10 bg-card border-border/50 shadow-sm h-11"
              placeholder="Buscar por nome do produto ou query..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <AdminCacheTable
            entries={entries}
            loading={loading}
            onEdit={setEditingEntry}
            onDelete={setDeletingId}
          />

          {totalPages > 1 && (
            <Pagination className="mt-4">
              <PaginationContent>
                <PaginationItem>
                  {page > 1 && (
                    <PaginationPrevious
                      onClick={() => setPage((p) => p - 1)}
                      className="cursor-pointer hover:bg-muted"
                    />
                  )}
                </PaginationItem>
                <PaginationItem>
                  <span className="px-4 text-sm font-medium">
                    Página {page} de {totalPages}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  {page < totalPages && (
                    <PaginationNext
                      onClick={() => setPage((p) => p + 1)}
                      className="cursor-pointer hover:bg-muted"
                    />
                  )}
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      </div>

      <Dialog open={!!editingEntry} onOpenChange={(o) => !o && setEditingEntry(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-card border-border/50">
          <DialogHeader>
            <DialogTitle>Editar Produto em Cache</DialogTitle>
          </DialogHeader>
          {editingEntry && (
            <AdminCacheForm
              initialData={editingEntry}
              onSubmit={handleUpdate}
              onCancel={() => setEditingEntry(null)}
              loading={formLoading}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O item será removido permanentemente do cache.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
