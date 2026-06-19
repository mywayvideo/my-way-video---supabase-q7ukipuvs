import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { AdminLayout } from '@/components/admin/AdminLayout'
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
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Search, Plus, Edit, Trash2, Loader2, ChevronLeft, ChevronRight, Bot } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { format } from 'date-fns'

interface AVProKeyword {
  keyword: string
  category: string | null
  weight: number
  is_blocking: boolean
  added_by: string
  updated_at: string
}

export default function AdminAVProKeywordsPage() {
  const { toast } = useToast()
  const location = useLocation()
  const [keywords, setKeywords] = useState<AVProKeyword[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const itemsPerPage = 10

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingKeyword, setEditingKeyword] = useState<AVProKeyword | null>(null)
  const [formData, setFormData] = useState({
    keyword: '',
    category: '',
    weight: 1.0,
    is_blocking: false,
  })

  const [deleteKeyword, setDeleteKeyword] = useState<string | null>(null)

  const fetchKeywords = async () => {
    setIsLoading(true)
    let query = supabase.from('avpro_keywords').select('*', { count: 'exact' })

    if (search) {
      query = query.ilike('keyword', `%${search}%`)
    }

    const from = (page - 1) * itemsPerPage
    const to = from + itemsPerPage - 1

    query = query.range(from, to).order('updated_at', { ascending: false })

    const { data, count, error } = await query

    if (error) {
      toast({
        title: 'Erro ao carregar keywords',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      setKeywords(data as AVProKeyword[])
      setTotalCount(count || 0)
    }

    setIsLoading(false)
  }

  useEffect(() => {
    fetchKeywords()
  }, [page, search])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const openCreateDialog = () => {
    setEditingKeyword(null)
    setFormData({
      keyword: '',
      category: '',
      weight: 1.0,
      is_blocking: false,
    })
    setIsDialogOpen(true)
  }

  const openEditDialog = (kw: AVProKeyword) => {
    setEditingKeyword(kw)
    setFormData({
      keyword: kw.keyword,
      category: kw.category || '',
      weight: kw.weight,
      is_blocking: kw.is_blocking,
    })
    setIsDialogOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.keyword.trim()) {
      toast({
        title: 'Campo obrigatório',
        description: 'Keyword é obrigatória.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    if (editingKeyword) {
      const { error } = await supabase
        .from('avpro_keywords')
        .update({
          category: formData.category || null,
          weight: formData.weight,
          is_blocking: formData.is_blocking,
        })
        .eq('keyword', editingKeyword.keyword)

      if (error) {
        toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' })
      } else {
        toast({ title: 'Sucesso', description: 'Keyword atualizada com sucesso.' })
        setIsDialogOpen(false)
        fetchKeywords()
      }
    } else {
      const { error } = await supabase.from('avpro_keywords').insert([
        {
          keyword: formData.keyword.toLowerCase().trim(),
          category: formData.category || null,
          weight: formData.weight,
          is_blocking: formData.is_blocking,
          added_by: 'admin',
        },
      ])

      if (error) {
        toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' })
      } else {
        toast({ title: 'Sucesso', description: 'Keyword criada com sucesso.' })
        setIsDialogOpen(false)
        fetchKeywords()
      }
    }

    setIsSubmitting(false)
  }

  const handleDelete = async () => {
    if (!deleteKeyword) return

    const { error } = await supabase.from('avpro_keywords').delete().eq('keyword', deleteKeyword)

    if (error) {
      toast({ title: 'Erro ao deletar', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Sucesso', description: 'Keyword deletada com sucesso.' })
      setDeleteKeyword(null)
      fetchKeywords()
    }
  }

  const tabs = [
    { name: 'Contexto Institucional', href: '/admin/ai' },
    { name: 'Provedores', href: '/admin/ai-providers' },
    { name: 'Configurações Globais', href: '/admin/ai-settings' },
    { name: 'Cache de Produtos', href: '/admin/product-cache' },
    { name: 'Dicionário AVPRO', href: '/admin/avpro-keywords' },
  ]

  return (
    <AdminLayout breadcrumb="IA & Inteligência Artificial">
      <div className="flex flex-col space-y-6 animate-fade-in">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-3 text-foreground">
            <div className="bg-primary/10 p-2 rounded-lg text-primary">
              <Bot className="w-6 h-6" />
            </div>
            IA & Inteligência Artificial
          </h1>
          <p className="text-muted-foreground mt-2">
            Gerencie os agentes de IA, provedores e a base de conhecimento.
          </p>
        </div>

        <div className="flex overflow-x-auto pb-2 mb-6 border-b border-border/50 gap-2">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={tab.href}
              className={cn(
                'px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 rounded-t-lg',
                location.pathname === tab.href
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border/50 hover:bg-muted/50',
              )}
            >
              {tab.name}
            </Link>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Dicionário AVPRO</h2>
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" /> Nova Keyword
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4 bg-card p-4 rounded-lg border border-border/50">
          <form onSubmit={handleSearch} className="flex flex-1 items-center gap-2 max-w-sm">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar keywords..."
                className="pl-8"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
          </form>
        </div>

        <div className="border border-border/50 rounded-md bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Peso</TableHead>
                <TableHead>Blocking</TableHead>
                <TableHead>Adicionado Por</TableHead>
                <TableHead>Atualizado Em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : keywords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    Nenhuma keyword encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                keywords.map((kw) => (
                  <TableRow key={kw.keyword}>
                    <TableCell className="font-medium">{kw.keyword}</TableCell>
                    <TableCell>{kw.category || '-'}</TableCell>
                    <TableCell>{kw.weight}</TableCell>
                    <TableCell>
                      {kw.is_blocking ? (
                        <Badge variant="destructive">Sim</Badge>
                      ) : (
                        <Badge variant="secondary">Não</Badge>
                      )}
                    </TableCell>
                    <TableCell>{kw.added_by}</TableCell>
                    <TableCell>{format(new Date(kw.updated_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(kw)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteKeyword(kw.keyword)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalCount > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Mostrando {(page - 1) * itemsPerPage + 1} até{' '}
              {Math.min(page * itemsPerPage, totalCount)} de {totalCount} resultados
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page * itemsPerPage >= totalCount || isLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editingKeyword ? 'Editar Keyword' : 'Nova Keyword'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="keyword">Keyword</Label>
                <Input
                  id="keyword"
                  value={formData.keyword}
                  onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
                  placeholder="Ex: camera, lente, etc."
                  disabled={!!editingKeyword}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Categoria</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Ex: Equipamento"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="weight">Peso (Weight)</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.1"
                  value={formData.weight}
                  onChange={(e) =>
                    setFormData({ ...formData, weight: parseFloat(e.target.value) || 0 })
                  }
                  required
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="is_blocking">Keyword de Bloqueio</Label>
                  <p className="text-sm text-muted-foreground">
                    Impede resultados se acionada (ex: palavras ofensivas).
                  </p>
                </div>
                <Switch
                  id="is_blocking"
                  checked={formData.is_blocking}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_blocking: checked })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteKeyword} onOpenChange={(open) => !open && setDeleteKeyword(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Keyword</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a keyword "{deleteKeyword}"? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  )
}
