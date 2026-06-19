import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HeartOff, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { useAuthContext } from '@/contexts/AuthContext'
import { ProductCard } from '@/components/ProductCard'

export function FavoritesTab({
  customerId,
  onRefresh,
}: {
  customerId: string
  onRefresh?: () => void
}) {
  const { currentUser: user } = useAuthContext()
  const { toast } = useToast()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const navigate = useNavigate()

  const fetchFavorites = useCallback(async () => {
    if (!user) return
    setError(false)
    try {
      const { data, error: err } = await supabase
        .from('favorites')
        .select(`id, product_id, products (*, manufacturers(name))`)
        .eq('user_id', user.id)

      if (err) throw err

      const formatted = (data as any[]).map((d) => d.products).filter(Boolean)

      setItems(formatted)
    } catch (e) {
      setError(true)
      toast({
        description: 'Não foi possível carregar seus favoritos.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [user, toast])

  useEffect(() => {
    if (user) fetchFavorites()
  }, [user, fetchFavorites])

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('favorites_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'favorites', filter: `user_id=eq.${user.id}` },
        () => fetchFavorites(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, fetchFavorites])

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col h-full border rounded-lg overflow-hidden">
            <Skeleton className="h-[200px] w-full rounded-none" />
            <div className="p-5 flex flex-col gap-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-8 w-1/3 mx-auto mt-4" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-lg">
        <AlertCircle className="w-12 h-12 text-destructive mb-4 opacity-50" />
        <h3 className="text-xl font-medium mb-2">Erro ao carregar favoritos</h3>
        <p className="text-muted-foreground mb-6 max-w-sm">
          Não foi possível carregar seus favoritos. Tente novamente.
        </p>
        <Button onClick={fetchFavorites} variant="outline">
          Tentar Novamente
        </Button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-lg">
        <HeartOff className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
        <h3 className="text-xl font-medium mb-2">Você ainda não tem favoritos</h3>
        <p className="text-muted-foreground mb-6 max-w-sm">
          Explore nosso catálogo e salve seus produtos preferidos aqui!
        </p>
        <Button onClick={() => navigate('/search')}>Explorar Produtos</Button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
