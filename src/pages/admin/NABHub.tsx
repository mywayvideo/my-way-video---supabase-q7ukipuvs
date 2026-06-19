import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Trash2, Edit2, Link as LinkIcon, FileText, Sparkles } from 'lucide-react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  getIntelligences,
  updateIntelligenceStatus,
  updateIntelligenceSummary,
  deleteIntelligence,
} from '@/services/intelligence'

import { supabase } from '@/lib/supabase/client'

export default function NABHub() {
  const [intelligences, setIntelligences] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('Salvando Informação...')
  const [isFetching, setIsFetching] = useState(true)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [content, setContent] = useState('')
  const [activeProvider, setActiveProvider] = useState<string>('')

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [editedSummary, setEditedSummary] = useState('')
  const [isSavingSummary, setIsSavingSummary] = useState(false)

  const { toast } = useToast()

  const fetchActiveProvider = async () => {
    try {
      const { data } = await supabase
        .schema('public')
        .from('ai_providers')
        .select('provider_name, model_id')
        .eq('is_active', true)
        .order('priority_order', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (data) {
        const providerName =
          data.provider_name.charAt(0).toUpperCase() + data.provider_name.slice(1)
        setActiveProvider(`${providerName} (${data.model_id})`)
      }
    } catch (e) {
      console.error('Failed to fetch AI provider', e)
    }
  }

  const fetchIntelligences = async () => {
    setIsFetching(true)
    try {
      const data = await getIntelligences()
      setIntelligences(data || [])
    } catch (error) {
      console.error(error)
    } finally {
      setIsFetching(false)
    }
  }

  useEffect(() => {
    fetchIntelligences()
    fetchActiveProvider()
  }, [])

  const handleIngest = async () => {
    if (!title.trim() && !url.trim() && !content.trim()) {
      toast({
        title: 'Aviso',
        description: 'O título, URL ou conteúdo manual são obrigatórios.',
        variant: 'destructive',
      })
      return
    }

    if (!url.trim() && !content.trim()) {
      toast({
        title: 'Aviso',
        description: 'Forneça uma URL ou conteúdo manual para a IA processar.',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    setLoadingMessage('Processando com IA...')

    try {
      const { data, error } = await supabase.functions.invoke('process-knowledge', {
        body: {
          title: title.trim() || undefined,
          url: url.trim() || undefined,
          raw_content: content.trim() || undefined,
        },
      })

      if (error) throw error

      if (data?.error) {
        throw new Error(data.error)
      }

      toast({
        title: 'Sucesso',
        description: 'Informação processada e salva na base de conhecimento',
      })

      setTitle('')
      setUrl('')
      setContent('')
      fetchIntelligences()
    } catch (error: any) {
      console.error(error)
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao processar informações com IA',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'published' ? 'draft' : 'published'
    try {
      await updateIntelligenceStatus(id, newStatus)
      fetchIntelligences()
    } catch (error) {
      console.error(error)
      toast({
        title: 'Erro',
        description: 'Falha ao atualizar status',
        variant: 'destructive',
      })
    }
  }

  const handleEditClick = (item: any) => {
    setEditingItem(item)
    setEditedSummary(item.ai_summary || '')
    setIsEditDialogOpen(true)
  }

  const handleSaveSummary = async () => {
    if (!editingItem) return
    setIsSavingSummary(true)
    try {
      await updateIntelligenceSummary(editingItem.id, editedSummary)
      toast({
        title: 'Sucesso',
        description: 'Resumo atualizado com sucesso.',
      })
      setIsEditDialogOpen(false)
      fetchIntelligences()
    } catch (error) {
      console.error(error)
      toast({
        title: 'Erro',
        description: 'Falha ao atualizar resumo',
        variant: 'destructive',
      })
    } finally {
      setIsSavingSummary(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteIntelligence(id)
      fetchIntelligences()
    } catch (error) {
      console.error(error)
      toast({
        title: 'Erro',
        description: 'Falha ao deletar registro',
        variant: 'destructive',
      })
    }
  }

  return (
    <AdminLayout breadcrumb="Market Intelligence">
      <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-primary">
                Market Intelligence
              </h1>
              {activeProvider && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <p className="text-sm font-medium text-emerald-600">Usando: {activeProvider}</p>
                </div>
              )}
            </div>
          </div>
          <p className="text-muted-foreground mt-2">
            Gerencie o conhecimento de IA sobre atualizações de mercado e lançamentos.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <Card className="border-primary/20 shadow-lg">
            <CardHeader className="bg-primary/5 border-b border-primary/10">
              <CardTitle className="text-xl">Nova Ingestão de Conhecimento</CardTitle>
              <CardDescription>
                Adicione novas fontes ou notas manuais para a IA processar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Título (Opcional)</label>
                <Input
                  placeholder="Ex: Lançamento de Mercado - Nova Câmera XYZ"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-background"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-muted-foreground" /> URL da Fonte
                </label>
                <Input
                  placeholder="https://..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="bg-background"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" /> Notas e Insights Manuais
                </label>
                <Textarea
                  placeholder="Insira as especificações técnicas, novidades e informações detalhadas..."
                  className="min-h-[180px] bg-background resize-y"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>

              <Button
                onClick={handleIngest}
                disabled={isLoading}
                className="w-full mt-4 h-12 text-md font-semibold bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-white border-0 shadow-md transition-all"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    {loadingMessage}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    Alimentar Cérebro da IA
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-muted shadow-md">
            <CardHeader className="bg-muted/30 border-b">
              <CardTitle className="text-xl">Knowledge Feed</CardTitle>
              <CardDescription>Gerencie as informações já integradas.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isFetching ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : intelligences.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Nenhuma inteligência coletada ainda.
                </div>
              ) : (
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {intelligences.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors"
                    >
                      <div className="space-y-1.5 overflow-hidden pr-4 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-sm truncate" title={item.title}>
                            {item.title}
                          </p>
                          <span className="text-xs text-muted-foreground shrink-0">
                            • {new Date(item.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span
                            className={`px-2.5 py-0.5 rounded-full font-medium ${item.status === 'published' ? 'bg-green-500/10 text-green-600 border border-green-500/20' : 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/20'}`}
                          >
                            {item.status === 'published' ? 'Publicado' : 'Rascunho'}
                          </span>
                          {item.source_url && (
                            <a
                              href={item.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate max-w-[200px] hover:underline hover:text-primary transition-colors"
                            >
                              {item.source_url}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Switch
                          checked={item.status === 'published'}
                          onCheckedChange={() => handleToggleStatus(item.id, item.status)}
                          title={item.status === 'published' ? 'Despublicar' : 'Publicar'}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditClick(item)}
                          className="h-8 w-8 hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors"
                          title="Editar Resumo"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(item.id)}
                          className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Resumo da IA</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              className="min-h-[300px] text-sm resize-y"
              value={editedSummary}
              onChange={(e) => setEditedSummary(e.target.value)}
              placeholder="O resumo da IA aparecerá aqui..."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isSavingSummary}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveSummary} disabled={isSavingSummary}>
              {isSavingSummary && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}
