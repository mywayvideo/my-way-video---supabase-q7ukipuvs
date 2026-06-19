import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { customerService } from '@/services/customerService'
import { useAuthContext } from '@/contexts/AuthContext'
import { Customer, Order, Favorite, CartItem, DiscountRuleCustomer } from '@/types/customer'

export function useCustomerDashboard() {
  const { currentUser: authUser, loading: authLoading } = useAuthContext()
  const navigate = useNavigate()

  const [user, setUser] = useState<Customer | null>(null)
  const [activeTab, setActiveTab] = useState('resumo')
  const [orders, setOrders] = useState<Order[]>([])
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [discounts, setDiscounts] = useState<DiscountRuleCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (authLoading) return

    if (!authUser) {
      setLoading(false)
      setError('NOT_LOGGED_IN')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const profile = await customerService.fetchCustomerData(authUser.id)
      setUser(profile)
      if (profile) {
        const [ords, favs, crts, discs] = await Promise.all([
          customerService.fetchOrders(profile.id, 1, 10),
          customerService.fetchFavorites(profile.id),
          customerService.fetchCartItems(profile.id),
          customerService.fetchDiscounts(profile.id),
        ])
        setOrders(ords)
        setFavorites(favs)
        setCart(crts)
        setDiscounts(discs)
      }
    } catch (err: any) {
      console.error(err)
      if (err.message === 'NOT_LOGGED_IN') {
        setError('NOT_LOGGED_IN')
      } else if (err.message === 'PGRST116') {
        setError('PGRST116')
      } else if (err.message === '403') {
        setError('403')
      } else {
        setError('Erro ao carregar dados. Tente novamente.')
      }
    } finally {
      setLoading(false)
    }
  }, [authUser, authLoading, navigate])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (error === 'NOT_LOGGED_IN') {
      toast.error('Você precisa estar logado para acessar o painel.')
      navigate('/login', { replace: true })
    }
  }, [error, navigate])

  return {
    user,
    activeTab,
    setActiveTab,
    orders,
    favorites,
    cart,
    discounts,
    loading,
    error,
    refresh: loadData,
  }
}
