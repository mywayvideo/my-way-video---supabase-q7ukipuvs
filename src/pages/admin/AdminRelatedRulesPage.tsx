import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import {
  relatedRulesService,
  RelatedProductRule,
  RelationType,
} from '@/services/relatedRulesService'
import { supabase } from '@/lib/supabase/client'
import {
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Sparkles,
  ArrowRight,
  ArrowLeftRight,
  Layers,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react'

interface CategoryItem {
  id: string
  name: string
}

export default function AdminRelatedRulesPage() {
  const [rules, setRules] = useState<RelatedProductRule[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<RelatedProductRule | null>(null)
  const [saving, setSaving] = useState(false)

  // Form fields
  const [origemId, setOrigemId] = useState('')
  const [alvoId, setAlvoId] = useState('')
  const [tipoRelacao, setTipoRelacao] = useState<RelationType>('essencial')
  const [prioridade, setPrioridade] = useState(1)
  const [maxSugestoes, setMaxSugestoes] = useState(3)
  const [bidirecional, setBidirecional] = useState(false)
  const [ativa, setAtiva] = useState(true)
  const [specKey, setSpecKey] = useState('')
  const [targetSpecKey, setTargetSpecKey] = useState('')
  const [specMatch, setSpecMatch] = useState<'equal' | 'contains' | 'any'>('equal')
  const [observacoes, setObservacoes] = useState('')

  const loadData = async () => {
    try {
      setLoading(true)
      const [catsRes, rulesData] = await Promise.all([
        supabase.from('categories').select('id, name').order('name', { ascending: true }),
        relatedRulesService.listRules(),
      ])

      if (catsRes.error) throw catsRes.error
      setCategories(catsRes.data || [])
      setRules(rulesData || [])
    } catch (err: any) {
      console.error('Erro ao carregar regras ou categorias:', err)
      toast({
        title: 'Erro ao carregar dados',
        description: err.message || 'Verifique se a migration de regras foi executada.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const getCategoryName = (id: string, fallbackRef?: { id: string; name: string }) => {
    if (fallbackRef?.name) return fallbackRef.name
    const found = categories.find((c) => c.id === id)
    return found ? found.name : id ? id.slice(0, 8) + '...' : '—'
  }

  const handleOpenCreate = () => {
    setEditingRule(null)
    setOrigemId(categories[0]?.id || '')
    setAlvoId(categories[1]?.id || '')
    setTipoRelacao('essencial')
    setPrioridade(rules.length + 1)
    setMaxSugestoes(3)
    setBidirecional(false)
    setAtiva(true)
    setSpecKey('battery_system')
    setTargetSpecKey('')
    setSpecMatch('equal')
    setObservacoes('')
    setIsDialogOpen(true)
  }

  const handleOpenEdit = (rule: RelatedProductRule) => {
    setEditingRule(rule)
    setOrigemId(rule.categoria_origem)
    setAlvoId(rule.categoria_alvo)
    setTipoRelacao(rule.tipo_relacao)
    setPrioridade(rule.prioridade)
    setMaxSugestoes(rule.max_sugestoes)
    setBidirecional(rule.bidirecional)
    setAtiva(rule.ativa)
    setSpecKey(rule.filtros_compatibilidade?.spec || '')
    setTargetSpecKey(rule.filtros_compatibilidade?.target_spec || '')
    setSpecMatch(rule.filtros_compatibilidade?.match || 'equal')
    setObservacoes(rule.observacoes || '')
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    if (!origemId || !alvoId) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Selecione a categoria de origem e de destino.',
        variant: 'destructive',
      })
      return
    }

    if (origemId === alvoId) {
      toast({
        title: 'Categorias idênticas',
        description: 'Origem e destino devem ser diferentes.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSaving(true)
      const filtros: any = {}
      if (specKey.trim()) {
        filtros.spec = specKey.trim()
        filtros.match = specMatch
        if (targetSpecKey.trim()) {
          filtros.target_spec = targetSpecKey.trim()
        }
      }

      if (editingRule) {
        await relatedRulesService.updateRule(editingRule.id, {
          categoria_origem: origemId,
          categoria_alvo: alvoId,
          tipo_relacao: tipoRelacao,
          prioridade: Number(prioridade),
          max_sugestoes: Number(maxSugestoes),
          filtros_compatibilidade: filtros,
          bidirecional,
          ativa,
          observacoes: observacoes.trim() || null,
        })
        toast({ title: 'Regra atualizada com sucesso!' })
      } else {
        await relatedRulesService.createRule({
          categoria_origem: origemId,
          categoria_alvo: alvoId,
          tipo_relacao: tipoRelacao,
          prioridade: Number(prioridade),
          max_sugestoes: Number(maxSugestoes),
          filtros_compatibilidade: filtros,
          bidirecional,
          ativa,
          observacoes: observacoes.trim() || null,
        })
        toast({ title: 'Regra criada com sucesso!' })
      }

      setIsDialogOpen(false)
      loadData()
    } catch (err: any) {
      console.error('Erro ao salvar regra:', err)
      toast({
        title: 'Erro ao salvar regra',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta regra de relacionamento?')) return
    try {
      await relatedRulesService.deleteRule(id)
      toast({ title: 'Regra removida.' })
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  const handleToggle = async (rule: RelatedProductRule) => {
    try {
      await relatedRulesService.toggleActive(rule.id, rule.ativa)
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, ativa: !r.ativa } : r)))
      toast({
        title: !rule.ativa ? 'Regra ativada' : 'Regra desativada',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar status',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  const getRelationBadge = (tipo: RelationType) => {
    switch (tipo) {
      case 'essencial':
        return <Badge className="bg-red-500/20 text-red-300 border-red-500/30">Essencial</Badge>
      case 'complemento':
        return (
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">Complemento</Badge>
        )
      case 'licenca':
        return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">Licença</Badge>
      case 'suporte':
        return (
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
            Suporte
          </Badge>
        )
      default:
        return <Badge variant="outline">{tipo}</Badge>
    }
  }

  return (
    <AdminLayout breadcrumb="Regras de Produtos Relacionados">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              Regras de Relacionamento Inteligente
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Controle declarativo entre categorias (ex.: Câmeras → Baterias/Lentes) com filtros de
              compatibilidade via spec_key.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button size="sm" onClick={handleOpenCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Regra
            </Button>
          </div>
        </div>

        {/* Guia Rápido */}
        <Card className="border-border/50 bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" /> Como funciona o Pipeline de 3 Camadas
            </CardTitle>
            <CardDescription className="text-xs">
              1. <strong>Extração</strong>: IA identifica atributos aplicáveis (ex.: lens_mount,
              battery_system) e grava em product_cache.
              <br />
              2. <strong>Pré-seleção SQL</strong>: O banco busca candidatos nas categorias alvo
              respeitando estas regras e cruzando specs iguais.
              <br />
              3. <strong>Ranqueamento IA</strong>: A OpenAI gpt-4o-mini recebe apenas os candidatos
              filtrados para ordenar e gerar justificativa com selo de confiança (Alta / Média /
              Baixa).
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Tabela de Regras */}
        <Card className="border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Prioridade</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="w-12 text-center"></TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Máx Sugestões</TableHead>
                  <TableHead>Filtro Compatibilidade</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Carregando regras...
                    </TableCell>
                  </TableRow>
                ) : rules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhuma regra cadastrada. Clique em "Nova Regra" ou execute a migration de
                      seed inicial.
                    </TableCell>
                  </TableRow>
                ) : (
                  rules.map((rule) => {
                    const origemName = getCategoryName(
                      rule.categoria_origem,
                      rule.categoria_origem_ref,
                    )
                    const alvoName = getCategoryName(rule.categoria_alvo, rule.categoria_alvo_ref)
                    const spec = rule.filtros_compatibilidade?.spec
                    const targetSpec = rule.filtros_compatibilidade?.target_spec
                    const match = rule.filtros_compatibilidade?.match

                    return (
                      <TableRow key={rule.id} className={rule.ativa ? '' : 'opacity-50'}>
                        <TableCell className="font-mono font-medium">#{rule.prioridade}</TableCell>
                        <TableCell className="font-semibold">{origemName}</TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {rule.bidirecional ? (
                            <span title="Bidirecional">
                              <ArrowLeftRight className="w-4 h-4 text-emerald-400 inline" />
                            </span>
                          ) : (
                            <span title="Unidirecional">
                              <ArrowRight className="w-4 h-4 text-muted-foreground inline" />
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold">{alvoName}</TableCell>
                        <TableCell>{getRelationBadge(rule.tipo_relacao)}</TableCell>
                        <TableCell className="font-mono text-center">
                          {rule.max_sugestoes}
                        </TableCell>
                        <TableCell className="text-xs">
                          {spec ? (
                            <span className="font-mono bg-muted px-2 py-0.5 rounded border">
                              {spec} {match === 'contains' ? '⊇' : '='} {targetSpec || spec}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">
                              Sem filtro (categoria ampla)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={rule.ativa} onCheckedChange={() => handleToggle(rule)} />
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(rule)}
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(rule.id)}
                            className="text-destructive hover:text-destructive"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Modal Criar / Editar */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Editar Regra de Relacionamento' : 'Nova Regra de Relacionamento'}
            </DialogTitle>
            <DialogDescription>
              Define o vínculo entre categorias para alimentar o motor determinístico + IA.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria Origem</Label>
                <Select value={origemId} onValueChange={setOrigemId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Categoria Alvo (Sugerida)</Label>
                <Select value={alvoId} onValueChange={setAlvoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de Relação</Label>
                <Select
                  value={tipoRelacao}
                  onValueChange={(val: RelationType) => setTipoRelacao(val)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="essencial">Essencial</SelectItem>
                    <SelectItem value="complemento">Complemento</SelectItem>
                    <SelectItem value="licenca">Licença</SelectItem>
                    <SelectItem value="suporte">Suporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={prioridade}
                  onChange={(e) => setPrioridade(Number(e.target.value))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Máx Sugestões</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={maxSugestoes}
                  onChange={(e) => setMaxSugestoes(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="border border-border/50 rounded-lg p-3 bg-muted/20 space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Filtro de Compatibilidade (Specs)
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Spec Origem</Label>
                  <Input
                    placeholder="battery_system, lens_mount..."
                    value={specKey}
                    onChange={(e) => setSpecKey(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">Tipo de Match</Label>
                  <Select
                    value={specMatch}
                    onValueChange={(v: 'equal' | 'contains' | 'any') => setSpecMatch(v)}
                  >
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equal">Igual (=)</SelectItem>
                      <SelectItem value="contains">Contém (⊇)</SelectItem>
                      <SelectItem value="any">Qualquer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Spec Destino (opcional)</Label>
                  <Input
                    placeholder="card_type..."
                    value={targetSpecKey}
                    onChange={(e) => setTargetSpecKey(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Deixe vazio para vincular por categoria sem filtro de spec (ex.: Tripés para
                Câmeras).
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-border/50 pt-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="bidirecional"
                  checked={bidirecional}
                  onCheckedChange={setBidirecional}
                />
                <Label htmlFor="bidirecional" className="cursor-pointer text-sm">
                  Bidirecional (A ↔ B)
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch id="ativa" checked={ativa} onCheckedChange={setAtiva} />
                <Label htmlFor="ativa" className="cursor-pointer text-sm">
                  Regra Ativa
                </Label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações / Descrição</Label>
              <Input
                placeholder="Ex.: Baterias compatíveis com o sistema da câmera..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editingRule ? 'Salvar Alterações' : 'Criar Regra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}
