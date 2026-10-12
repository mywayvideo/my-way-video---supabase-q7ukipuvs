import React, { useState, useEffect, useRef, useId } from 'react'
import { Input } from '@/components/ui/input'
import { NcmTaxTooltip } from '@/components/NcmTaxTooltip'
import {
  searchNcmAutocomplete,
  validateNcmExists,
  formatNcmCode,
  NcmAutocompleteOption,
} from '@/services/ncmService'
import { cleanNcmDigits } from '@/components/admin/NcmSuggestDialog'
import { Loader2, Check, AlertCircle, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface NcmAutocompleteFieldProps {
  /**
   * Valor atual do formulário (pode vir como 8 dígitos limpos '90071000' ou formatado '9007.10.00')
   */
  value?: string | null
  /**
   * Disparado quando o valor muda. Passa o valor limpo (ou formatado dependendo da preferência)
   * e o status de validação.
   */
  onChange?: (val: string) => void
  onBlur?: () => void
  disabled?: boolean
  error?: string
  id?: string
  className?: string
  /**
   * Notifica componente pai sobre status de validação de NCM em tempo real
   */
  onValidationChange?: (isValid: boolean, errorMsg?: string | null) => void
}

export function NcmAutocompleteField({
  value = '',
  onChange,
  onBlur,
  disabled = false,
  error,
  id,
  className,
  onValidationChange,
}: NcmAutocompleteFieldProps) {
  const generatedId = useId()
  const inputId = id || generatedId

  // O input text exibe para o usuário
  const [inputValue, setInputValue] = useState<string>(() => {
    return value ? formatNcmCode(value) : ''
  })

  // Sugestões do dropdown
  const [suggestions, setSuggestions] = useState<NcmAutocompleteOption[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  // Status de validação local
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isValidNcm, setIsValidNcm] = useState<boolean>(true)

  // Flag para saber se o usuário interagiu / digitou
  const [isTouched, setIsTouched] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceTimerRef = useRef<any>(null)
  const validationTimerRef = useRef<any>(null)

  // Atualiza inputValue se a prop externa `value` mudar (ex.: carregamento do produto, sugestão de IA ou reset)
  useEffect(() => {
    const formatted = value ? formatNcmCode(value) : ''
    setInputValue(formatted)

    // Se o valor inicial for válido (ex.: 0000.00.00 ou produto existente), limpa erros de validação
    const digits = cleanNcmDigits(value)
    if (digits === '00000000' || digits.length === 8) {
      setValidationError(null)
      setIsValidNcm(true)
      onValidationChange?.(true, null)
    }
  }, [value])

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Executa busca com debounce (~250-300ms)
  const triggerSearch = (query: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    const trimmed = query.trim()
    const digits = trimmed.replace(/\D/g, '')

    // Se a query for muito curta (menos de 2 dígitos e menos de 2 letras), limpa
    if (digits.length < 2 && trimmed.length < 2) {
      setSuggestions([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchNcmAutocomplete(trimmed, 15)
        setSuggestions(results)
        setIsOpen(true)
        setHighlightedIndex(-1)
      } catch (err) {
        console.warn('Erro ao buscar NCM:', err)
        setSuggestions([])
      } finally {
        setIsLoading(false)
      }
    }, 280)
  }

  // Validação estrita: o código digitado DEVE existir na base imp_sim_tax_rates, exceto 0000.00.00
  const triggerValidation = (raw: string) => {
    if (validationTimerRef.current) {
      clearTimeout(validationTimerRef.current)
    }

    const digits = cleanNcmDigits(raw)

    // Se vazio, comportamento padrão do form
    if (!digits) {
      setValidationError(null)
      setIsValidNcm(true)
      onValidationChange?.(true, null)
      return
    }

    // Exceção 0000.00.00 é sempre válida
    if (digits === '00000000') {
      setValidationError(null)
      setIsValidNcm(true)
      onValidationChange?.(true, null)
      return
    }

    // Se ainda está digitando e não tem 8 dígitos, avisa que precisa de 8 dígitos ou seleção da lista
    if (digits.length < 8) {
      const msg = 'Digite 8 dígitos ou selecione um NCM válido da lista.'
      setValidationError(msg)
      setIsValidNcm(false)
      onValidationChange?.(false, msg)
      return
    }

    // Com 8 dígitos, valida se existe no banco
    setIsValidating(true)
    validationTimerRef.current = setTimeout(async () => {
      try {
        const exists = await validateNcmExists(digits)
        if (exists) {
          setValidationError(null)
          setIsValidNcm(true)
          onValidationChange?.(true, null)
        } else {
          const msg = 'Selecione um NCM da lista — o código digitado não existe na base.'
          setValidationError(msg)
          setIsValidNcm(false)
          onValidationChange?.(false, msg)
        }
      } catch {
        // Fallback em caso de erro de rede
        setValidationError(null)
        setIsValidNcm(true)
        onValidationChange?.(true, null)
      } finally {
        setIsValidating(false)
      }
    }, 250)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setIsTouched(true)

    // Se o usuário digitou apenas dígitos ou pontos, mantemos a formatação dinâmica se for numérico puro
    const digits = cleanNcmDigits(raw)
    const isOnlyNumbersAndDots = /^[\d\s.]+$/.test(raw)

    let nextDisplay = raw
    if (isOnlyNumbersAndDots) {
      nextDisplay = formatNcmCode(digits)
    }

    setInputValue(nextDisplay)

    // Armazena no formulário pai: se for 8 dígitos ou números, passa os dígitos limpos
    const valueToEmit = digits.length > 0 ? digits : raw.trim()
    onChange?.(valueToEmit)

    // Dispara busca para abrir o dropdown
    triggerSearch(raw)

    // Dispara validação
    triggerValidation(raw)
  }

  const handleSelectOption = (option: NcmAutocompleteOption) => {
    const formatted = formatNcmCode(option.ncm)
    setInputValue(formatted)
    onChange?.(option.ncm)

    setValidationError(null)
    setIsValidNcm(true)
    onValidationChange?.(true, null)

    setIsOpen(false)
    setSuggestions([])
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && inputValue.trim().length >= 2) {
        triggerSearch(inputValue)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault()
        handleSelectOption(suggestions[highlightedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
    }
  }

  const handleInputBlur = () => {
    onBlur?.()
    // Pequeno timeout para permitir o clique nas opções do dropdown antes de fechar
    setTimeout(() => {
      setIsOpen(false)
      // Validação final ao sair do campo
      if (isTouched) {
        triggerValidation(inputValue)
      }
    }, 200)
  }

  const currentDigits = cleanNcmDigits(inputValue || value)
  const isEightDigits = currentDigits.length === 8
  const isZeroNcm = currentDigits === '00000000'
  const displayError = error || (isTouched ? validationError : null)

  return (
    <div ref={containerRef} className="relative w-full space-y-1">
      <div className="relative flex items-center">
        <Input
          id={inputId}
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleInputBlur}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true)
            else if (inputValue.trim().length >= 2) triggerSearch(inputValue)
          }}
          placeholder="0000.00.00 ou busque por nome"
          maxLength={30}
          disabled={disabled}
          autoComplete="off"
          className={cn(
            'font-mono pr-20 transition-colors',
            displayError && 'border-destructive focus-visible:ring-destructive',
            !displayError && isEightDigits && isValidNcm && 'border-emerald-500/50',
            className,
          )}
        />

        {/* Indicadores à direita do input */}
        <div className="absolute right-2 flex items-center gap-1.5 pointer-events-auto">
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}

          {/* Botão limpar quando preenchido */}
          {!disabled && inputValue && !isLoading && (
            <button
              type="button"
              onClick={() => {
                setInputValue('')
                onChange?.('')
                setSuggestions([])
                setIsOpen(false)
                setValidationError(null)
                setIsValidNcm(true)
                onValidationChange?.(true, null)
                inputRef.current?.focus()
              }}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded focus:outline-none"
              title="Limpar campo NCM"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Tooltip de alíquotas de importação funcionando normalmente sobre o código escolhido */}
          {isEightDigits && !isZeroNcm && (
            <span className="inline-flex items-center">
              <NcmTaxTooltip ncm={currentDigits} showIcon side="right" align="center" />
            </span>
          )}

          {/* Ícone de status de validação */}
          {isEightDigits && !isLoading && !isValidating && (
            <>
              {isValidNcm && !displayError ? (
                <span title="NCM validado na base oficial">
                  <Check className="w-4 h-4 text-emerald-500" />
                </span>
              ) : (
                <span title="Código sem correspondência na base">
                  <AlertCircle className="w-4 h-4 text-destructive" />
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mensagem de erro de validação inline */}
      {displayError && (
        <p className="text-xs font-medium text-destructive flex items-center gap-1 mt-1 animate-in fade-in">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{displayError}</span>
        </p>
      )}

      {/* Dropdown de sugestões do Autocomplete */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-xl z-50 max-h-72 overflow-y-auto divide-y divide-border/60 animate-in fade-in zoom-in-95"
          role="listbox"
        >
          {suggestions.length > 0 ? (
            <div>
              <div className="px-3 py-1.5 bg-muted/40 text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Search className="w-3 h-3" />
                  Resultados em imp_sim_tax_rates ({suggestions.length})
                </span>
                <span className="text-[10px]">Use ↑↓ e Enter</span>
              </div>
              {suggestions.map((item, index) => {
                const isSelected = highlightedIndex === index
                return (
                  <div
                    key={`${item.ncm}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(e) => {
                      e.preventDefault() // Impede blur antes de executar
                      handleSelectOption(item)
                    }}
                    className={cn(
                      'p-2.5 cursor-pointer text-xs transition-colors flex flex-col gap-0.5',
                      isSelected ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/70',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-primary text-sm tracking-wide">
                        {item.ncm_formatted}
                      </span>

                      {/* Resumo de alíquotas se disponíveis */}
                      {(item.ii_rate !== undefined || item.ipi_rate !== undefined) && (
                        <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                          {item.ii_rate !== null && item.ii_rate !== undefined && (
                            <span className="text-emerald-500 font-semibold">
                              II: {item.ii_rate}%
                            </span>
                          )}
                          {item.ipi_rate !== null && item.ipi_rate !== undefined && (
                            <span className="text-sky-500 font-semibold">
                              IPI: {item.ipi_rate}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {item.ncm_descricao_full || 'Sem descrição cadastrada'}
                    </p>
                  </div>
                )
              })}
            </div>
          ) : (
            !isLoading && (
              <div className="p-3 text-center text-xs text-muted-foreground space-y-1">
                <p>Nenhum NCM encontrado para a busca.</p>
                <p className="text-[10px]">
                  Tente digitar o código (ex.: 9007) ou uma palavra-chave (ex.: câmera, objetiva).
                </p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
