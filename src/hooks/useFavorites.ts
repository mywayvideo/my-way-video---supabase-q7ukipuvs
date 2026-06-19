import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuthContext } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { create } from 'zustand'

interface FavoritesStore {
  favorites: string[]
  setFavorites: (favorites: string[]) => void
  addFav: (id: string) => void
  removeFav: (id: string) => void
}

const useFavoritesStore = create<FavoritesStore>((set) => ({
  favorites: [],
  setFavorites: (favorites) => set({ favorites }),
  addFav: (id) => set((state) => ({ favorites: Array.from(new Set([...state.favorites, id])) })),
  removeFav: (id) => set((state) => ({ favorites: state.favorites.filter((f) => f !== id) })),
}))

let hasFetched = false
let lastUserId: string | null | undefined = undefined
let activeChannel: any = null

export function useFavorites() {
  const { currentUser: user } = useAuthContext()
  const { favorites, setFavorites, addFav, removeFav } = useFavoritesStore()
  const [loading, setLoading] = useState(!hasFetched)
  const [error, setError] = useState<string | null>(null)

  const syncLocalToSupabase = useCallback(async () => {
    if (!user) return
    const local = localStorage.getItem('my-way-favorites')
    if (local) {
      try {
        const localFavorites: string[] = JSON.parse(local)
        if (localFavorites.length > 0) {
          const { data: existing } = await supabase
            .from('favorites')
            .select('product_id')
            .eq('user_id', user.id)
          const existingIds = existing?.map((f) => f.product_id) || []

          const toInsert = localFavorites
            .filter((id) => !existingIds.includes(id))
            .map((id) => ({ user_id: user.id, product_id: id }))

          if (toInsert.length > 0) {
            await supabase.from('favorites').insert(toInsert)
            toast.success('Favoritos sincronizados!')
          }
        }
        localStorage.removeItem('my-way-favorites')
      } catch (e) {
        console.error('Error syncing favorites', e)
      }
    }
  }, [user])

  useEffect(() => {
    let isMounted = true

    const loadFavorites = async () => {
      const currentUserId = user ? user.id : null
      if (hasFetched && lastUserId === currentUserId) {
        if (isMounted) setLoading(false)
        return
      }

      setLoading(true)
      try {
        if (user) {
          await syncLocalToSupabase()
          const { data, error } = await supabase
            .from('favorites')
            .select('product_id')
            .eq('user_id', user.id)

          if (error) throw error
          setFavorites(data.map((f) => f.product_id))
        } else {
          const local = localStorage.getItem('my-way-favorites')
          if (local) {
            setFavorites(JSON.parse(local))
          } else {
            setFavorites([])
          }
        }
        hasFetched = true
        lastUserId = currentUserId
      } catch (err: any) {
        if (isMounted) setError(err.message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadFavorites()

    if (user && (!activeChannel || lastUserId !== user.id)) {
      if (activeChannel) {
        supabase.removeChannel(activeChannel)
      }
      activeChannel = supabase
        .channel(`public:favorites-global-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'favorites', filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              addFav(payload.new.product_id)
            } else if (payload.eventType === 'DELETE') {
              removeFav(payload.old.product_id)
            }
          },
        )
        .subscribe()
    } else if (!user && activeChannel) {
      supabase.removeChannel(activeChannel)
      activeChannel = null
    }

    return () => {
      isMounted = false
    }
  }, [user, syncLocalToSupabase, setFavorites, addFav, removeFav])

  const addFavorite = async (productId: string) => {
    if (user) {
      addFav(productId) // Optimistic update
      try {
        const { error } = await supabase
          .from('favorites')
          .insert({ user_id: user.id, product_id: productId })
        if (error && error.code !== '23505') {
          // removeFav(productId) // Rollback
          throw error
        }
        toast.success('Adicionado aos favoritos!')
      } catch (err: any) {
        // Silently fail to keep optimistic UI as requested
      }
    } else {
      addFav(productId)
      const newFavs = Array.from(new Set([...favorites, productId]))
      localStorage.setItem('my-way-favorites', JSON.stringify(newFavs))
      toast.success('Adicionado aos favoritos!')
    }
  }

  const removeFavorite = async (productId: string) => {
    if (user) {
      removeFav(productId) // Optimistic update
      try {
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', productId)
        if (error) {
          // addFav(productId) // Rollback
          throw error
        }
        toast.success('Removido dos favoritos!')
      } catch (err: any) {
        // Silently fail to keep optimistic UI as requested
      }
    } else {
      removeFav(productId)
      const newFavs = favorites.filter((id) => id !== productId)
      localStorage.setItem('my-way-favorites', JSON.stringify(newFavs))
      toast.success('Removido dos favoritos!')
    }
  }

  const isFavorite = (productId: string) => favorites.includes(productId)

  const getFavoritesList = () => favorites

  return {
    favorites,
    isFavorite,
    addFavorite,
    removeFavorite,
    loading,
    error,
    syncLocalToSupabase,
    getFavoritesList,
  }
}
