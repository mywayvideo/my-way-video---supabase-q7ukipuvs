import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Discount } from '@/types/discount'
import { getBestDiscount, DiscountCalculation } from '@/services/discountApplicationService'
import { useAuthContext } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'

// Global state cache to prevent redundant fetches
let globalDiscounts: Discount[] = []
let isFetching = false
let fetchPromise: Promise<void> | null = null
const listeners = new Set<() => void>()

const notifyListeners = () => listeners.forEach((l) => l())

const fetchDiscounts = async () => {
  if (isFetching) return fetchPromise
  isFetching = true
  fetchPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('discounts')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true })

      if (!error && data) {
        globalDiscounts = data as Discount[]
        notifyListeners()
      }
    } catch (err) {
      console.error('Error fetching discounts:', err)
    } finally {
      isFetching = false
    }
  })()
  return fetchPromise
}

export function useApplyDiscount(
  productId?: string,
  originalPrice?: number | null,
  costPrice?: number | null,
  originalPriceNat?: number | null,
  costPriceNat?: number | null,
) {
  const { currentUser: user } = useAuthContext()
  const [discounts, setDiscounts] = useState<Discount[]>(globalDiscounts)

  const [isRealtimeActive, setIsRealtimeActive] = useState(true)
  const [realtimeAttempts, setRealtimeAttempts] = useState(0)

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const realtimeSubscriptionRef = useRef<any>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isUnsubscribingRef = useRef(false)
  const hasShownToastRef = useRef(false)

  useEffect(() => {
    let debounceTimer: NodeJS.Timeout
    let isMounted = true

    const handleUpdate = () => setDiscounts([...globalDiscounts])
    listeners.add(handleUpdate)

    if (globalDiscounts.length === 0) {
      fetchDiscounts().catch((err) => console.error('Error in initial fetch:', err))
    }

    const safeUnsubscribe = () => {
      if (isUnsubscribingRef.current || !realtimeSubscriptionRef.current) return
      isUnsubscribingRef.current = true
      try {
        if (typeof realtimeSubscriptionRef.current.unsubscribe === 'function') {
          realtimeSubscriptionRef.current.unsubscribe()
        }
        supabase.removeChannel(realtimeSubscriptionRef.current)
      } catch (err) {
        console.error('Realtime unsubscribe error:', err)
      } finally {
        realtimeSubscriptionRef.current = null
        isUnsubscribingRef.current = false
      }
    }

    const startPolling = () => {
      if (pollingIntervalRef.current) return
      console.log('Polling active: fetching discounts every 5 seconds.')

      pollingIntervalRef.current = setInterval(async () => {
        try {
          const { data, error } = await supabase
            .from('discounts')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: true })

          if (error) throw error
          if (data) {
            globalDiscounts = data as Discount[]
            notifyListeners()
          }
        } catch (err) {
          console.error('Polling failed:', err)
          if (!hasShownToastRef.current && isMounted) {
            hasShownToastRef.current = true
            toast({
              title: 'Erro',
              description: 'Erro ao sincronizar descontos. Tente recarregar.',
              variant: 'destructive',
            })
          }
        }
      }, 5000)

      scheduleReconnection()
    }

    const stopPolling = () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }

    const scheduleReconnection = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMounted) {
          console.log('Attempting to reconnect to Realtime...')
          setRealtimeAttempts((prev) => prev + 1)
          setupSubscription(true)
        }
      }, 30000)
    }

    const handleSubscriptionError = (isReconnecting = false) => {
      safeUnsubscribe()

      if (isMounted) {
        setIsRealtimeActive(false)
        if (!isReconnecting) {
          console.log('Realtime failed, switching to polling.')
          startPolling()
        } else {
          scheduleReconnection()
        }
      }
    }

    const setupSubscription = (isReconnecting = false) => {
      try {
        const channel = supabase.channel(
          `public:discounts:${Math.random().toString(36).substring(7)}`,
        )

        realtimeSubscriptionRef.current = channel
          .on('postgres_changes', { event: '*', schema: 'public', table: 'discounts' }, () => {
            clearTimeout(debounceTimer)
            debounceTimer = setTimeout(() => {
              fetchDiscounts().catch((err) => console.error('Error in Realtime fetch:', err))
            }, 300)
          })
          .subscribe((status, err) => {
            if (!isMounted) return

            if (status === 'SUBSCRIBED') {
              if (isReconnecting) {
                console.log('Realtime reconnected, stopping polling.')
              } else {
                console.log('Realtime connected successfully')
              }
              setIsRealtimeActive(true)
              setRealtimeAttempts(0)
              stopPolling()
            }
            if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
              if (!isReconnecting) {
                console.error('Realtime failed:', err || status)
              }
              handleSubscriptionError(isReconnecting)
            }
          })
      } catch (err) {
        console.error('Realtime setup failed:', err)
        handleSubscriptionError(isReconnecting)
      }
    }

    setupSubscription()

    return () => {
      isMounted = false
      listeners.delete(handleUpdate)
      if (debounceTimer) clearTimeout(debounceTimer)

      safeUnsubscribe()
      stopPolling()

      realtimeSubscriptionRef.current = null
      pollingIntervalRef.current = null
      reconnectTimeoutRef.current = null
    }
  }, [])

  const userRole = user?.app_metadata?.role || user?.user_metadata?.role || 'customer'

  const calculate = useCallback(
    (pId: string, pPrice: number, cPrice: number): DiscountCalculation => {
      try {
        return getBestDiscount(discounts, pId, user?.id || null, userRole, pPrice, cPrice)
      } catch (error) {
        console.error('Error calculating discount:', error)
        return {
          originalPrice: pPrice,
          discountedPrice: pPrice,
          discountPercentage: 0,
          ruleName: null,
          discountType: null,
        }
      }
    },
    [discounts, user?.id, userRole],
  )

  const result = useMemo(() => {
    const usdResult =
      !productId || originalPrice == null || originalPrice <= 0
        ? {
            originalPrice: originalPrice || 0,
            discountedPrice: originalPrice || 0,
            discountPercentage: 0,
            ruleName: null,
            discountType: null,
          }
        : calculate(productId, originalPrice, costPrice || 0)

    const natResult =
      !productId || originalPriceNat == null || originalPriceNat <= 0
        ? {
            originalPrice: originalPriceNat || 0,
            discountedPrice: originalPriceNat || 0,
            discountPercentage: 0,
            ruleName: null,
          }
        : calculate(productId, originalPriceNat, costPriceNat || 0)

    return {
      ...usdResult,
      originalPriceNat: natResult.originalPrice,
      discountedPriceNat: natResult.discountedPrice,
      discountPercentageNat: natResult.discountPercentage,
      ruleNameNat: natResult.ruleName,
    }
  }, [productId, originalPrice, costPrice, originalPriceNat, costPriceNat, calculate])

  return {
    ...result,
    calculateDiscount: calculate,
  }
}
