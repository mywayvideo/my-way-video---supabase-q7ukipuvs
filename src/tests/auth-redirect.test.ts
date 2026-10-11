import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getDashboardPathForRole,
  resolveDashboardRouteForUserId,
  ADMIN_DASHBOARD_PATH,
  CUSTOMER_DASHBOARD_PATH,
} from '@/utils/auth-redirect'
import { supabase } from '@/lib/supabase/client'

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('Auth Redirect Logic (Admin vs Customer)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getDashboardPathForRole', () => {
    it('returns /dashboard-admin when role is admin', () => {
      expect(getDashboardPathForRole('admin')).toBe(ADMIN_DASHBOARD_PATH)
      expect(getDashboardPathForRole('admin')).toBe('/dashboard-admin')
    })

    it('returns /dashboard when role is customer or any other role', () => {
      expect(getDashboardPathForRole('customer')).toBe(CUSTOMER_DASHBOARD_PATH)
      expect(getDashboardPathForRole('client')).toBe(CUSTOMER_DASHBOARD_PATH)
      expect(getDashboardPathForRole('user')).toBe(CUSTOMER_DASHBOARD_PATH)
      expect(getDashboardPathForRole(null)).toBe(CUSTOMER_DASHBOARD_PATH)
      expect(getDashboardPathForRole(undefined)).toBe(CUSTOMER_DASHBOARD_PATH)
    })
  })

  describe('resolveDashboardRouteForUserId', () => {
    it('redirects admin to /dashboard-admin', async () => {
      const maybeSingleMock = vi.fn().mockResolvedValue({
        data: { role: 'admin' },
        error: null,
      })
      const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock })
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any)

      const route = await resolveDashboardRouteForUserId('admin-user-id-123')

      expect(supabase.from).toHaveBeenCalledWith('customers')
      expect(selectMock).toHaveBeenCalledWith('role')
      expect(eqMock).toHaveBeenCalledWith('user_id', 'admin-user-id-123')
      expect(route).toBe('/dashboard-admin')
    })

    it('redirects customer/regular user to /dashboard', async () => {
      const maybeSingleMock = vi.fn().mockResolvedValue({
        data: { role: 'customer' },
        error: null,
      })
      const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock })
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any)

      const route = await resolveDashboardRouteForUserId('customer-user-id-456')

      expect(supabase.from).toHaveBeenCalledWith('customers')
      expect(selectMock).toHaveBeenCalledWith('role')
      expect(eqMock).toHaveBeenCalledWith('user_id', 'customer-user-id-456')
      expect(route).toBe('/dashboard')
    })

    it('falls back to /dashboard if customer profile does not exist or has null role', async () => {
      const maybeSingleMock = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      })
      const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock })
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any)

      const route = await resolveDashboardRouteForUserId('unknown-user-id')
      expect(route).toBe('/dashboard')
    })

    it('falls back to /dashboard on database error without throwing', async () => {
      const maybeSingleMock = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database query failed' },
      })
      const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock })
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any)

      const route = await resolveDashboardRouteForUserId('error-user-id')
      expect(route).toBe('/dashboard')
    })
  })
})
