import { useEffect, useState } from 'react'
import { useFavorites } from '@/hooks/useFavorites'
import { supabase } from '@/lib/supabase/client'
import { Heart, HeartOff, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProductCard } from '@/components/ProductCard'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export default function Favorites() {
  const { favorites, removeFavorite, loading: favLoading, error } = useFavorites()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const fetchProducts = async (currentFavorites: string[]) => {
    if (currentFavorites.length === 0) {
      setProducts([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data, error: dbError } = await supabase
        .from('products')
        .select('*, manufacturers(name)')
        .in('id', currentFavorites)

      if (dbError) throw dbError
      setProducts(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!favLoading) {
      setProducts((prev) => {
        const newProducts = prev.filter((p) => favorites.includes(p.id))

        const hasMissing = favorites.some((id) => !prev.some((p) => p.id === id))
        if (hasMissing || (favorites.length > 0 && prev.length === 0)) {
          fetchProducts(favorites)
          return prev
        }

        if (newProducts.length !== prev.length) {
          return newProducts
        }

        return prev
      })
      if (favorites.length === 0) {
        setLoading(false)
      }
    }
  }, [favorites, favLoading])

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-[50vh]">
        <div className="bg-destructive/10 text-destructive p-4 rounded-full mb-4">
          <Heart className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-semibold mb-2">Erro ao carregar favoritos</h2>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          Ocorreu um problema ao buscar seus produtos favoritos. Por favor, tente novamente.
        </p>
        <Button onClick={() => window.location.reload()} className="gap-2">
          <RefreshCcw className="w-4 h-4" /> Tentar novamente
        </Button>
      </div>
    )
  }

  if (favLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Meus Favoritos</h1>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col h-full bg-card border rounded-lg overflow-hidden">
              <Skeleton className="h-[200px] w-full rounded-none" />
              <div className="p-5 flex flex-col flex-1 gap-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-6 w-1/3 mt-auto pt-1" />
              </div>
              <div className="p-5 pt-0 mt-auto flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (favorites.length === 0 || products.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8 animate-fade-in">
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-lg my-8">
          <HeartOff className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-xl font-medium mb-2">Nenhum favorito ainda</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Você não adicionou nenhum produto aos favoritos. Explore nosso catálogo e salve seus
            produtos preferidos aqui!
          </p>
          <Button asChild>
            <Link to="/search">Explorar Produtos</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Heart
            className={cn(
              'w-8 h-8',
              products.length > 0 ? 'fill-red-500 text-red-500' : 'text-primary fill-primary/20',
            )}
          />
          Meus Favoritos
        </h1>
        <Badge variant="secondary" className="text-sm">
          {products.length} {products.length === 1 ? 'produto' : 'produtos'}
        </Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isFavoritesPage={true}
            onRemove={async (id) => {
              await removeFavorite(id)
            }}
          />
        ))}
      </div>
    </div>
  )
}
