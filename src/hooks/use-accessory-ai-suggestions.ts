import { useEffect, useState } from 'react'
import {
  accessoryService,
  ACCESSORY_CATEGORY_NAME,
  AI_CHUNK_SIZE,
  type AccessorySuggestion,
} from '@/services/accessoryService'

interface TriageProductLite {
  id: string
  name: string
  sku: string | null
  description: string | null
}

interface CategoryLite {
  id: string
  name: string
}

/**
 * Sugestões da IA (edge function suggest-accessory-category) para os produtos
 * atualmente visíveis na Fila de Triagem de acessórios (/admin/categories).
 *
 * Reutiliza o MESMO serviço do AccessoryReclassDialog (nenhum backend novo):
 * os produtos da página são enviados em blocos de AI_CHUNK_SIZE e o resultado
 * vira um mapa productId -> sugestão (categoria-mãe + justificativa).
 * A sugestão é apenas indicativa — nada é aplicado sem aprovação humana.
 */
export function useAccessoryAiSuggestions(
  products: TriageProductLite[],
  categories: CategoryLite[],
  enabled: boolean,
): { suggestions: Record<string, AccessorySuggestion>; loading: boolean } {
  const [suggestions, setSuggestions] = useState<Record<string, AccessorySuggestion>>({})
  const [loading, setLoading] = useState(false)

  // Chaves estáveis: evita reconsultar a IA a cada render com o mesmo conteúdo
  const idsKey = products.map((p) => p.id).join(',')
  const catsKey = categories.map((c) => c.id).join(',')

  useEffect(() => {
    if (!enabled || products.length === 0 || categories.length === 0) {
      setSuggestions({})
      setLoading(false)
      return
    }
    let cancelado = false
    setLoading(true)
    ;(async () => {
      const map: Record<string, AccessorySuggestion> = {}
      try {
        const parentCats = categories.filter((c) => c.name !== ACCESSORY_CATEGORY_NAME)
        for (let i = 0; i < products.length; i += AI_CHUNK_SIZE) {
          const chunk = products.slice(i, i + AI_CHUNK_SIZE)
          const res = await accessoryService.suggestAccessoryCategories(chunk, parentCats)
          for (const s of res) {
            if (s && s.productId) map[s.productId] = s
          }
        }
      } catch (err) {
        console.error('Erro ao obter sugestões da IA para a fila de triagem:', err)
      }
      if (!cancelado) {
        setSuggestions(map)
        setLoading(false)
      }
    })()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, idsKey, catsKey])

  return { suggestions, loading }
}
