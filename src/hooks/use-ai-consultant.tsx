import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface AIConsultantResult {
  referenced_internal_products?: any[]
  products?: any[]
}

interface AIConsultantContextType {
  aiResult: AIConsultantResult | null
  setAIResult: (result: AIConsultantResult | null) => void
  clearAIResult: () => void
}

const AIConsultantContext = createContext<AIConsultantContextType | undefined>(undefined)

export function useAIConsultant() {
  const context = useContext(AIConsultantContext)
  if (!context) throw new Error('useAIConsultant must be used within AIConsultantProvider')
  return context
}

export function AIConsultantProvider({ children }: { children: ReactNode }) {
  const [aiResult, setAIResultState] = useState<AIConsultantResult | null>(null)

  const setAIResult = useCallback((result: AIConsultantResult | null) => {
    setAIResultState(result)
  }, [])

  const clearAIResult = useCallback(() => setAIResultState(null), [])

  return (
    <AIConsultantContext.Provider value={{ aiResult, setAIResult, clearAIResult }}>
      {children}
    </AIConsultantContext.Provider>
  )
}
