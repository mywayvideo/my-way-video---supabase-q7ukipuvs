import { create } from 'zustand'

export interface SearchStoreState {
  searchQuery: string
  aiResponse: string | null
  productResults: any[]
  searchTimestamp: number
  isSearchActive: boolean
  searchType: 'ai' | 'database'
  dbResults: any[]
  shouldShowWhatsapp: boolean
  setStoreState: (state: Partial<SearchStoreState>) => void
  clearStoreState: () => void
}

const useSearchStore = create<SearchStoreState>((set) => ({
  searchQuery: '',
  aiResponse: null,
  productResults: [],
  searchTimestamp: 0,
  isSearchActive: false,
  searchType: 'ai',
  dbResults: [],
  shouldShowWhatsapp: false,
  setStoreState: (state) => set((prev) => ({ ...prev, ...state })),
  clearStoreState: () =>
    set({
      searchQuery: '',
      aiResponse: null,
      productResults: [],
      searchTimestamp: 0,
      isSearchActive: false,
      searchType: 'ai',
      dbResults: [],
      shouldShowWhatsapp: false,
    }),
}))

export default useSearchStore
export { useSearchStore }
