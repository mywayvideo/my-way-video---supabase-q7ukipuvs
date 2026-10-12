import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  clearOrphanSession,
  validateServerUser,
  SESSION_EXPIRED_MESSAGE,
  markSessionExpiredNotice,
  consumeSessionExpiredNotice,
} from '@/utils/session-utils'
import {
  cleanNcm,
  formatNcmDisplayCode,
  formatTaxPercentValue,
  fetchNcmTaxRates,
} from '@/components/NcmTaxTooltip'
import { supabase } from '@/lib/supabase/client'

describe('Correção 1: Gestão de Sessão Órfã e Validação com Timeout', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('clearOrphanSession deve remover chaves sb-* e auth tokens do localStorage', async () => {
    localStorage.setItem('sb-access-token', 'fake-jwt-token')
    localStorage.setItem('sb-refresh-token', 'fake-refresh-token')
    localStorage.setItem('custom-app-auth-token', 'auth-val')
    localStorage.setItem('unrelated-key', 'keep-me')

    await clearOrphanSession()

    expect(localStorage.getItem('sb-access-token')).toBeNull()
    expect(localStorage.getItem('sb-refresh-token')).toBeNull()
    expect(localStorage.getItem('custom-app-auth-token')).toBeNull()
    expect(localStorage.getItem('unrelated-key')).toBe('keep-me')
  })

  it('markSessionExpiredNotice e consumeSessionExpiredNotice controlam a notificação de expiração', () => {
    expect(consumeSessionExpiredNotice()).toBe(false)
    markSessionExpiredNotice()
    expect(consumeSessionExpiredNotice()).toBe(true)
    // Consumido uma vez, na segunda deve ser falso
    expect(consumeSessionExpiredNotice()).toBe(false)
  })

  it('validateServerUser limpa sessão órfã quando o servidor rejeita com erro', async () => {
    localStorage.setItem('sb-token', 'corrupted')
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValueOnce({
      data: { user: null },
      error: {
        name: 'AuthSessionMissingError',
        message: 'Invalid JWT / session missing',
        status: 401,
      } as any,
    })

    const result = await validateServerUser(2000)

    expect(result.user).toBeNull()
    expect(result.error).toBeTruthy()
    expect(result.error?.message).toContain('Invalid JWT')
    // Verifica que limpou localStorage
    expect(localStorage.getItem('sb-token')).toBeNull()
  })

  it('validateServerUser limpa sessão quando ocorre timeout', async () => {
    localStorage.setItem('sb-token', 'hanging-request')
    // Mock que nunca resolve
    vi.spyOn(supabase.auth, 'getUser').mockImplementationOnce(
      () => new Promise(() => {}), // never resolves
    )

    const result = await validateServerUser(50) // 50ms timeout para teste ágil

    expect(result.timedOut).toBe(true)
    expect(result.user).toBeNull()
    expect(localStorage.getItem('sb-token')).toBeNull()
  })

  it('validateServerUser mantém usuário quando o servidor responde com sucesso', async () => {
    const mockUser = { id: 'usr-123', email: 'user@example.com' } as any
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    })

    const result = await validateServerUser(2000)

    expect(result.timedOut).toBe(false)
    expect(result.error).toBeNull()
    expect(result.user?.id).toBe('usr-123')
  })
})

describe('Correção 2: Tooltip e Alíquotas de Importação no Campo NCM', () => {
  it('cleanNcm extrai apenas dígitos do código NCM', () => {
    expect(cleanNcm('9007.10.00')).toBe('90071000')
    expect(cleanNcm('8543-70.99')).toBe('85437099')
    expect(cleanNcm(null)).toBe('')
    expect(cleanNcm(undefined)).toBe('')
  })

  it('formatNcmDisplayCode formata rigorosamente no padrão XXXX.XX.XX (9007.10.00)', () => {
    expect(formatNcmDisplayCode('90071000')).toBe('9007.10.00')
    expect(formatNcmDisplayCode('9007.10.00')).toBe('9007.10.00')
    expect(formatNcmDisplayCode('85437099')).toBe('8543.70.99')
  })

  it('formatTaxPercentValue formata alíquotas percentuais corretamente', () => {
    expect(formatTaxPercentValue(10.8)).toBe('10,8%')
    expect(formatTaxPercentValue(6.5)).toBe('6,5%')
    expect(formatTaxPercentValue(2.1)).toBe('2,1%')
    expect(formatTaxPercentValue(9.65)).toBe('9,65%')
    expect(formatTaxPercentValue(0)).toBe('0%')
    expect(formatTaxPercentValue(null)).toBe('0%')
  })

  it('fetchNcmTaxRates busca na tabela imp_sim_tax_rates e armazena em cache', async () => {
    const mockRecord = {
      ncm: '90071000',
      ncm_descricao_full: 'Câmeras cinematográficas para filmes de largura inferior a 16 mm',
      ncm_descricao: 'Câmeras',
      ii_rate: 10.8,
      ipi_rate: 6.5,
      pis_rate: 2.1,
      cofins_rate: 9.65,
    }

    const maybeSingleSpy = vi.fn().mockResolvedValue({ data: mockRecord, error: null })
    const limitSpy = vi.fn().mockReturnValue({ maybeSingle: maybeSingleSpy })
    const eqSpy = vi.fn().mockReturnValue({ limit: limitSpy })
    const selectSpy = vi.fn().mockReturnValue({ eq: eqSpy })
    vi.spyOn(supabase, 'from').mockReturnValue({ select: selectSpy } as any)

    const result = await fetchNcmTaxRates('9007.10.00')
    expect(result).not.toBeNull()
    expect(result?.ncm).toBe('90071000')
    expect(result?.ii_rate).toBe(10.8)
    expect(result?.ncm_descricao_full).toContain('Câmeras cinematográficas')

    // Segunda chamada deve vir do cache (sem disparar nova query)
    const cachedResult = await fetchNcmTaxRates('90071000')
    expect(cachedResult).toEqual(result)
    expect(selectSpy).toHaveBeenCalledTimes(1)
  })
})
