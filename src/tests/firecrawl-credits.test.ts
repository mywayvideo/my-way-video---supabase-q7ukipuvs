import { describe, it, expect, vi } from 'vitest'
import { firecrawlCreditsService } from '@/services/firecrawlCreditsService'

describe('firecrawlCreditsService', () => {
  it('fetches credits successfully through firecrawl-credits edge function', async () => {
    const mockCreditsData = {
      remainingCredits: 4500,
      planCredits: 5000,
      usedCredits: 500,
      percentUsed: 10,
      percentRemaining: 90,
      billingPeriodStart: '2025-02-01T00:00:00Z',
      billingPeriodEnd: '2025-02-28T23:59:59Z',
      fetchedAt: '2025-02-15T12:00:00Z',
    }

    const mockInvoke = vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: mockCreditsData,
      },
      error: null,
    })

    const { supabase } = await import('@/lib/supabase/client')
    const originalInvoke = supabase.functions.invoke
    supabase.functions.invoke = mockInvoke as any

    try {
      const result = await firecrawlCreditsService.getCredits()
      expect(mockInvoke).toHaveBeenCalledWith('firecrawl-credits', {
        method: 'GET',
      })
      expect(result.remainingCredits).toBe(4500)
      expect(result.planCredits).toBe(5000)
      expect(result.usedCredits).toBe(500)
      expect(result.percentRemaining).toBe(90)
    } finally {
      supabase.functions.invoke = originalInvoke
    }
  })

  it('handles error response from edge function with safe friendly message', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: {
            error: 'Permissão negada. Apenas administradores podem consultar créditos Firecrawl.',
          },
        },
      },
    })

    const { supabase } = await import('@/lib/supabase/client')
    const originalInvoke = supabase.functions.invoke
    supabase.functions.invoke = mockInvoke as any

    try {
      await expect(firecrawlCreditsService.getCredits()).rejects.toThrow(
        'Permissão negada. Apenas administradores podem consultar créditos Firecrawl.',
      )
    } finally {
      supabase.functions.invoke = originalInvoke
    }
  })

  it('gracefully identifies when edge function is not deployed (404 / NOT_FOUND)', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 404,
          json: {
            code: 'NOT_FOUND',
            message: 'Requested function was not found',
          },
        },
      },
    })

    const { supabase } = await import('@/lib/supabase/client')
    const originalInvoke = supabase.functions.invoke
    supabase.functions.invoke = mockInvoke as any

    try {
      await expect(firecrawlCreditsService.getCredits()).rejects.toThrow(
        'A edge function firecrawl-credits ainda não está publicada neste projeto Supabase',
      )
    } finally {
      supabase.functions.invoke = originalInvoke
    }
  })

  it('gracefully handles network level failure (Failed to fetch)', async () => {
    const mockInvoke = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const { supabase } = await import('@/lib/supabase/client')
    const originalInvoke = supabase.functions.invoke
    supabase.functions.invoke = mockInvoke as any

    try {
      await expect(firecrawlCreditsService.getCredits()).rejects.toThrow(
        'Função edge firecrawl-credits indisponível ou não publicada no projeto Supabase. Verifique se a função foi deployada.',
      )
    } finally {
      supabase.functions.invoke = originalInvoke
    }
  })

  it('calculates credit metrics accurately from raw plan and remaining values', () => {
    const planCredits = 10000
    const remainingCredits = 2500

    const used = Math.max(0, planCredits - remainingCredits)
    const percentUsed = Number(((used / planCredits) * 100).toFixed(1))
    const percentRemaining = Number(((remainingCredits / planCredits) * 100).toFixed(1))

    expect(used).toBe(7500)
    expect(percentUsed).toBe(75)
    expect(percentRemaining).toBe(25)
  })
})
