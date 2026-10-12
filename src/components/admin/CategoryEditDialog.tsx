import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Plus, X, Loader2, AlertCircle, Info, Check } from 'lucide-react'
import { CategorySummaryGroup, categoryService } from '@/services/categoryService'
import {
  isValidNcmPrefix,
  formatNcmPrefixDisplay,
  getNcmPrefixHint,
  normalizeNcmDigits,
} from '@/services/categoryTriageService'
import { toast } from '@/hooks/use-toast'

interface CategoryEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: CategorySummaryGroup | null
  onSaved: () => void
}

export function CategoryEditDialog({
  open,
  onOpenChange,
  category,
  onSaved,
}: CategoryEditDialogProps) {
  const isEditing = Boolean(category?.id)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [acceptableNcms, setAcceptableNcms] = useState<string[]>([])
  const [ncmInput, setNcmInput] = useState('')
  const [ncmError, setNcmError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Sincronizar estado inicial ao abrir modal
  React.useEffect(() => {
    if (open) {
      if (category) {
        setName(category.name || '')
        setDescription(category.description || '')
        setIsActive(category.is_active !== false)
        setAcceptableNcms(category.acceptable_ncms || [])
      } else {
        setName('')
        setDescription('')
        setIsActive(true)
        setAcceptableNcms([])
      }
      setNcmInput('')
      setNcmError(null)
      setSaving(false)
    }
  }, [open, category])

  const handleAddNcm = () => {
    const raw = ncmInput.trim()
    if (!raw) return

    const digits = normalizeNcmDigits(raw)
    if (!isValidNcmPrefix(digits)) {
      setNcmError('Prefixo NCM deve ter 4, 6 ou 8 dígitos (ex: 9002, 9002.11 ou 9002.11.00)')
      return
    }

    const formatted = formatNcmPrefixDisplay(digits)
    if (acceptableNcms.includes(formatted)) {
      setNcmError('Este prefixo já foi adicionado')
      return
    }

    setAcceptableNcms([...acceptableNcms, formatted])
    setNcmInput('')
    setNcmError(null)
  }

  const handleRemoveNcm = (prefix: string) => {
    setAcceptableNcms(acceptableNcms.filter((p) => p !== prefix))
  }

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome da categoria.',
        variant: 'destructive',
      })
      return
    }

    // Se houver texto digitado no campo NCM que é válido, adiciona antes de salvar
    let finalNcms = [...acceptableNcms]
    if (ncmInput.trim()) {
      const digits = normalizeNcmDigits(ncmInput)
      if (isValidNcmPrefix(digits)) {
        const formatted = formatNcmPrefixDisplay(digits)
        if (!finalNcms.includes(formatted)) {
          finalNcms.push(formatted)
        }
      }
    }

    setSaving(true)
    try {
      if (isEditing && category) {
        await categoryService.updateCategory(category.id, {
          name: trimmedName,
          description: description.trim() || null,
          acceptable_ncms: finalNcms,
          is_active: isActive,
        })
        toast({
          title: 'Categoria atualizada',
          description: `A categoria "${trimmedName}" foi atualizada com sucesso.`,
        })
      } else {
        await categoryService.createCategory({
          name: trimmedName,
          description: description.trim() || null,
          acceptable_ncms: finalNcms,
        })
        toast({
          title: 'Categoria criada',
          description: `A categoria "${trimmedName}" foi cadastrada com sucesso.`,
        })
      }
      onOpenChange(false)
      onSaved()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar categoria',
        description: err.message || 'Ocorreu um erro ao salvar.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
          <DialogDescription>
            Defina o nome canônico e configure os prefixos de NCM aceitáveis para a regra de
            validação automática da categoria.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="cat-name" className="text-sm font-semibold">
              Nome da Categoria <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cat-name"
              placeholder="Ex: Audio, Networking & Storage, Converters..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc" className="text-sm font-semibold">
              Descrição (opcional)
            </Label>
            <Textarea
              id="cat-desc"
              rows={2}
              placeholder="Breve descrição dos equipamentos e finalidade desta categoria"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Ativo/Inativo (se editando) */}
          {isEditing && (
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="space-y-0.5">
                <Label htmlFor="cat-active" className="text-sm font-medium cursor-pointer">
                  Categoria Ativa no Catálogo
                </Label>
                <p className="text-xs text-muted-foreground">
                  Categorias desativadas não aparecem para novos cadastros ou filtros de clientes.
                </p>
              </div>
              <Switch
                id="cat-active"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={saving}
              />
            </div>
          )}

          {/* NCMs Aceitáveis */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">NCMs Aceitáveis da Família</Label>
              <span className="text-xs text-muted-foreground">
                {acceptableNcms.length} prefixo(s) definido(s)
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Aceita prefixo de <strong>4, 6 ou 8 dígitos</strong> (ex:{' '}
              <code className="bg-muted px-1 py-0.5 rounded">9002</code>,{' '}
              <code className="bg-muted px-1 py-0.5 rounded">8543.70</code> ou{' '}
              <code className="bg-muted px-1 py-0.5 rounded">8543.70.35</code>). Produtos com NCM
              que não iniciam com nenhum destes prefixos receberão o badge de fora do padrão.
            </p>

            {/* Input de prefixo com hint dinâmico */}
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <Input
                  placeholder="Digite prefixo (ex: 8528.52 ou 9002)"
                  value={ncmInput}
                  onChange={(e) => {
                    setNcmInput(e.target.value)
                    setNcmError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddNcm()
                    }
                  }}
                  disabled={saving}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleAddNcm}
                  disabled={saving || !ncmInput.trim()}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar
                </Button>
              </div>

              {/* Hint do que cobre */}
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/40 p-2 rounded">
                <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <span>{getNcmPrefixHint(ncmInput)}</span>
              </div>

              {ncmError && (
                <div className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{ncmError}</span>
                </div>
              )}
            </div>

            {/* Lista de tags/badges dos prefixos adicionados */}
            <div className="flex flex-wrap gap-1.5 pt-2 min-h-[40px] p-2 rounded-md border bg-card">
              {acceptableNcms.length === 0 ? (
                <span className="text-xs text-muted-foreground italic self-center">
                  Nenhum prefixo restritivo definido (todos os NCMs serão considerados neutros).
                </span>
              ) : (
                acceptableNcms.map((prefix) => (
                  <Badge
                    key={prefix}
                    variant="outline"
                    className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-xs font-mono bg-primary/5 hover:bg-primary/10 border-primary/20"
                  >
                    <span>{prefix}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveNcm(prefix)}
                      className="text-muted-foreground hover:text-destructive rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-1.5" />
                {isEditing ? 'Salvar Alterações' : 'Criar Categoria'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
