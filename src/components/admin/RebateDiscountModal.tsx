import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tag, Calendar, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'
import { ProductBatchItem } from '@/services/bhBatchUpdateService'
import { rebateDiscountService, ExistingRebateRule } from '@/services/rebateDiscountService'
import { toast } from '@/hooks/use-toast'

interface RebateDiscountModalProps {
  isOpen: boolean
  onClose: () => void
  product: ProductBatchItem | null
  existingRule: ExistingRebateRule | null
  onSuccess: () => void
}

export function RebateDiscountModal({
  isOpen,
  onClose,
  product,
  existingRule,
  onSuccess,
}: RebateDiscountModalProps) {
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage')
  const [discountValue, setDiscountValue] = useState<number>(0)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [rawEndDateHint, setRawEndDateHint] = useState<string>('')
  const [saving, setSaving] = useState<boolean>(false)

  useEffect(() => {
    if (!product || !isOpen) return

    const nowIso = new Date().toISOString().slice(0, 16)
    setStartDate(nowIso)

    const checkRes = product.checkResult
    const priceFull = checkRes?.price_full || product.price_usd || 0
    const priceWithRebate = checkRes?.price_with_rebate || checkRes?.price_bh || 0
    const savings =
      checkRes?.rebate_savings || (priceFull > priceWithRebate ? priceFull - priceWithRebate : 0)

    // Se já existe regra salva no banco para o produto
    if (existingRule) {
      setDiscountType(
        existingRule.discount_type === 'fixed' || existingRule.discount_type === 'fixed_amount'
          ? 'fixed'
          : 'percentage',
      )
      setDiscountValue(existingRule.discount_value || 0)
      if (existingRule.start_date) {
        setStartDate(new Date(existingRule.start_date).toISOString().slice(0, 16))
      }
      if (existingRule.end_date) {
        setEndDate(new Date(existingRule.end_date).toISOString().slice(0, 16))
      }
      setRawEndDateHint(checkRes?.rebate_end_date || '')
      return
    }

    // Pré-preenchimento derivado do rebate B&H
    if (priceFull > 0 && savings > 0) {
      const pct = Number(((savings / priceFull) * 100).toFixed(2))
      setDiscountType('percentage')
      setDiscountValue(pct)
    } else if (checkRes?.price_with_rebate && priceFull > checkRes.price_with_rebate) {
      const diff = priceFull - checkRes.price_with_rebate
      const pct = Number(((diff / priceFull) * 100).toFixed(2))
      setDiscountType('percentage')
      setDiscountValue(pct)
    } else {
      setDiscountType('percentage')
      setDiscountValue(0)
    }

    // Data de vigência vinda da B&H
    const rawDate = checkRes?.rebate_end_date || ''
    setRawEndDateHint(rawDate)

    if (checkRes?.rebate_end_date_iso) {
      try {
        setEndDate(new Date(checkRes.rebate_end_date_iso).toISOString().slice(0, 16))
      } catch {
        setEndDate('')
      }
    } else if (rawDate) {
      // Tentar converter data crua se possível
      const parsed = Date.parse(
        rawDate
          .replace(/^(offer\s+ends|ends|valid\s+thru|expires)\s*:?/i, '')
          .replace(/at\s+\d{1,2}(:\d{2})?\s*(am|pm)?\s*(et|est|edt)?/i, '')
          .trim(),
      )
      if (!isNaN(parsed)) {
        setEndDate(new Date(parsed).toISOString().slice(0, 16))
      } else {
        setEndDate('')
      }
    } else {
      setEndDate('')
    }
  }, [product, existingRule, isOpen])

  if (!product) return null

  const checkRes = product.checkResult
  const priceFull = checkRes?.price_full || product.price_usd || 0
  const savings = checkRes?.rebate_savings

  const handleSave = async () => {
    if (!discountValue || discountValue <= 0) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um valor de desconto maior que zero.',
        variant: 'destructive',
      })
      return
    }

    if (!endDate) {
      toast({
        title: 'Data de fim obrigatória',
        description: 'Informe a data e horário de término da vigência do rebate.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      await rebateDiscountService.saveRebateDiscount({
        productId: product.id,
        productName: product.name,
        discountType,
        discountValue,
        startDate: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
        endDate: new Date(endDate).toISOString(),
        isActive: true,
        existingDiscountId: existingRule?.id || null,
      })

      toast({
        title: existingRule ? 'Rebate Fabricante atualizado!' : 'Rebate Fabricante ativado!',
        description: `Regra de desconto criada no catálogo para "${product.name}". Preço base FOB US$ ${product.price_usd?.toFixed(2)} preservado.`,
      })

      onSuccess()
      onClose()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar rebate',
        description: err.message || 'Falha ao gravar regra na tabela discounts.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {existingRule ? 'Editar Rebate Fabricante' : 'Ativar Rebate Fabricante'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Cria regra na tabela de descontos em tempo de exibição, sem alterar o preço FOB
                base.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Dados do produto e rebate da B&H */}
          <div className="bg-muted/40 p-3 rounded-lg border border-border/50 space-y-2">
            <div className="font-medium text-foreground truncate" title={product.name}>
              {product.name}
            </div>
            <div className="flex items-center justify-between text-muted-foreground pt-1 border-t border-border/40">
              <span>SKU: {product.sku || '—'}</span>
              <span>Preço DB (FOB): US$ {product.price_usd?.toFixed(2) || '—'}</span>
            </div>
            {checkRes && (
              <div className="flex items-center justify-between bg-purple-500/10 text-purple-300 p-2 rounded border border-purple-500/20">
                <span>Instant Savings B&H:</span>
                <span className="font-bold">
                  {savings ? `US$ ${savings.toFixed(2)} off` : 'Ativo'}
                  {priceFull > 0 && savings
                    ? ` (~${((savings / priceFull) * 100).toFixed(1)}%)`
                    : ''}
                </span>
              </div>
            )}
            {rawEndDateHint && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>
                  Prazo B&H capturado: <strong className="text-purple-300">{rawEndDateHint}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Nome da Regra Fixa */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Nome da Regra</Label>
            <Input
              value="Rebate Fabricante"
              disabled
              className="h-8 text-xs font-semibold bg-muted/60 cursor-not-allowed"
            />
            <p className="text-[10px] text-muted-foreground">
              Nome fixo obrigatório pelo padrão de auditoria do sistema.
            </p>
          </div>

          {/* Tipo de Desconto */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Tipo de Cálculo</Label>
            <RadioGroup
              value={discountType}
              onValueChange={(v: 'percentage' | 'fixed') => setDiscountType(v)}
              className="flex items-center gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="percentage" id="r-percent" />
                <Label htmlFor="r-percent" className="text-xs cursor-pointer">
                  Percentual (%) (Padrão)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="fixed" id="r-fixed" />
                <Label htmlFor="r-fixed" className="text-xs cursor-pointer">
                  Valor Fixo (US$)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Valor do Desconto */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">
              {discountType === 'percentage'
                ? 'Percentual de Desconto (%)'
                : 'Valor do Desconto (US$)'}
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={discountValue || ''}
              onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
              placeholder={discountType === 'percentage' ? 'Ex: 15.00' : 'Ex: 200.00'}
              className="h-8 text-xs font-mono"
            />
          </div>

          {/* Vigência: Início e Fim */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">
                Início da Vigência
              </Label>
              <Input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                <span>Fim da Vigência *</span>
                {!endDate && <span className="text-[10px] text-amber-400">Obrigatório</span>}
              </Label>
              <Input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 text-xs font-mono border-purple-500/40"
              />
            </div>
          </div>

          {/* Aviso Vinculante */}
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded text-[11px] text-amber-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Regra Vinculante:</strong> Esta ação grava exclusivamente na tabela{' '}
              <code>discounts</code> com escopo para este produto. O <code>price_usd</code> original
              do produto permanece inalterado.
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={saving}
            className="h-8 text-xs"
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !discountValue || !endDate}
            className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white font-medium"
          >
            {saving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Gravando...
              </>
            ) : existingRule ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Salvar Alterações
              </>
            ) : (
              <>
                <Tag className="w-3.5 h-3.5 mr-1.5" />
                Ativar Rebate Fabricante
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
export default RebateDiscountModal
