import { useSearchParams } from 'react-router-dom'
import { useToast } from '@/hooks/use-toast'
import { useSearchStore } from '@/stores/useSearchStore'

const useSearchState = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()
  const setStoreState = useSearchStore((state) => state.setStoreState)
  const clearStoreState = useSearchStore((state) => state.clearStoreState)

  const searchQuery = searchParams.get('q') || ''

  let aiResponse = ''
  let productResults: any[] = []

  try {
    const stored = localStorage.getItem('myway-search-state')
    if (stored) {
      const parsed = JSON.parse(stored)
      aiResponse = parsed.response || ''
      productResults = parsed.products || []
    }
  } catch (e) {
    console.error('Error parsing search state:', e)
  }

  const saveSearchState = (
    query: string,
    response: string | null = null,
    products: any[] = [],
    type: 'ai' | 'database' = 'database',
    dbResults: any[] = [],
    shouldShowWhatsapp: boolean = false,
  ) => {
    try {
      const encoded = encodeURIComponent(query)
      setSearchParams({ q: encoded })

      const stateObj = {
        query,
        response,
        products,
        type,
        dbResults,
        shouldShowWhatsapp,
        timestamp: Date.now(),
      }

      localStorage.setItem('myway-search-state', JSON.stringify(stateObj))

      setStoreState({
        searchQuery: query,
        aiResponse: response,
        productResults: products,
        searchType: type,
        dbResults: dbResults,
        shouldShowWhatsapp,
        searchTimestamp: stateObj.timestamp,
        isSearchActive: true,
      })
    } catch (error) {
      console.error('Error saving search state:', error)
      toast({
        title: 'Erro ao salvar busca',
        description: 'Não foi possível salvar a busca localmente.',
        variant: 'destructive',
      })
    }
  }

  const restoreSearchState = () => {
    try {
      const stored = localStorage.getItem('myway-search-state')
      if (stored) {
        const parsed = JSON.parse(stored)
        setStoreState({
          searchQuery: parsed.query || '',
          aiResponse: parsed.response || null,
          productResults: parsed.products || [],
          searchType: parsed.type || 'database',
          dbResults: parsed.dbResults || [],
          shouldShowWhatsapp: parsed.shouldShowWhatsapp || false,
          searchTimestamp: parsed.timestamp || 0,
          isSearchActive: true,
        })
        return parsed
      }
      return null
    } catch (error) {
      console.error('Error restoring search state:', error)
      return null
    }
  }

  const clearSearchState = () => {
    try {
      setSearchParams({})
      localStorage.removeItem('myway-search-state')
      clearStoreState()
    } catch (error) {
      console.error('Error clearing search state:', error)
    }
  }

  return {
    searchQuery,
    aiResponse,
    productResults,
    saveSearchState,
    restoreSearchState,
    clearSearchState,
  }
}

// Polyfill getState for backwards compatibility with any unlisted external service files
// This prevents the "useSearchState.getState is not a function" error globally.
;(useSearchState as any).getState = () => {
  console.warn(
    'Warning: useSearchState.getState() is deprecated. Use useSearchStore.getState() instead.',
  )
  return useSearchStore.getState()
}

export default useSearchState
export { useSearchState }
