import { useEffect, useState } from 'react'
import { ProductCard } from '@/components/ProductCard'
import { compatibilityService } from '@/services/compatibilityService'
import { supabaseProjectUrl } from '@/lib/supabase/projectInfo'

/**
 * Seção pública "Acessórios compatíveis" da página do produto: acessórios
 * vinculados via product_compatibilities com status "aprovado" (ele como
 * produto principal). Não renderiza nada quando não há vínculo aprovado.
 * Os cards são o MESMO ProductCard usado nos Produtos Relacionados e no
 * restante do site (marca, preços USD/BRL, "Sob Consulta", botões, favorito).
 */

type Acessorio = Awaited<ReturnType<typeof compatibilityService.fetchApprovedAccessories>>[number]

export function CompatibleAccessoriesSection({ productId }: { productId: string }) {
  const [acessorios, setAcessorios] = useState<Acessorio[] | null>(null)

  useEffect(() => {
    let cancelado = false
    compatibilityService
      .fetchApprovedAccessories(productId)
      .then((lista) => {
        if (!cancelado) setAcessorios(lista)
      })
      .catch((erro) => {
        // Diagnóstico: loga URL da requisição e o erro, sem mudar o comportamento visual.
        const urlDaRequisicao = supabaseProjectUrl
          ? `${supabaseProjectUrl}/rest/v1/${'product_compatibilities'}?product_id=eq.${productId}`
          : `(URL do projeto indisponível)`
        console.error(
          `[Acessórios compatíveis] Falha ao carregar acessórios do produto ${productId}. ` +
            `Requisição: ${urlDaRequisicao}. Erro:`,
          erro,
        )
        if (!cancelado) setAcessorios([])
      })
    return () => {
      cancelado = true
    }
  }, [productId])

  // null = ainda carregando (não renderiza nada para não "piscar" a seção)
  if (acessorios === null || acessorios.length === 0) return null

  return (
    <div className="mt-16 border-t border-border/50 pt-12">
      <h2 className="text-2xl font-bold mb-6">Acessórios compatíveis</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
        {acessorios.map((a) => (
          <ProductCard key={a.id} product={a} />
        ))}
      </div>
    </div>
  )
}
