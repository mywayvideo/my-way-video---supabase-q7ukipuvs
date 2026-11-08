import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ============================================================================
 * INSTRUÇÕES DO FORMULÁRIO DE CADASTRO/EDIÇÃO DE PRODUTO (NewProductPage)
 * Rotas: /admin/catalog/products/new e /products/edit/:id
 * ============================================================================
 *
 * CONVENÇÃO DE MANUTENÇÃO (REGRA PERMANENTE DO PROJETO — mesma regra do
 * categoriesHelp.tsx):
 *   Qualquer alteração no formulário de cadastro/edição de produto
 *   (NewProductPage.tsx) deve atualizar ESTE arquivo no MESMO commit —
 *   incluindo a nota de versão / "Última atualização" no rodapé do modal.
 *
 * Todo o conteúdo do modal de instruções é 100% centralizado aqui: tópicos,
 * passos, avisos e a nota de versão. O modal (ProductFormHelpModal, também
 * neste arquivo) apenas renderiza esta estrutura. Os textos descrevem as
 * funcionalidades REAIS da tela, lidas do código existente.
 *
 * Se você adicionou uma feature nova no formulário:
 *   1. Adicione/edite um tópico em PRODUCT_FORM_HELP_TOPICS abaixo.
 *   2. Atualize HELP_LAST_UPDATED (e HELP_VERSION, se houver nova versão).
 *   3. Faça tudo no mesmo commit da feature.
 */

export const HELP_VERSION = 'v0.0.757'
export const HELP_LAST_UPDATED = '08/11/2026'

export type ProductHelpBlockType =
  | 'paragraph'
  | 'steps'
  | 'bullets'
  | 'warning'
  | 'info'
  | 'success'
  | 'code'

export interface ProductHelpBlock {
  type: ProductHelpBlockType
  text?: string
  items?: string[]
}

export interface ProductHelpTopic {
  id: string
  icon: string
  title: string
  blocks: ProductHelpBlock[]
}

/**
 * Tópicos do modal de instruções — em ordem de navegação.
 * A chave `icon` é um emoji propositalmente simples: o modal renderiza como texto.
 */
export const PRODUCT_FORM_HELP_TOPICS: ProductHelpTopic[] = [
  {
    id: 'overview',
    icon: '📦',
    title: 'Visão geral do formulário',
    blocks: [
      {
        type: 'paragraph',
        text: 'Esta tela cadastra e edita os produtos do catálogo My Way Video. Ela serve tanto para o cadastro manual (Novo Produto) quanto para a edição de produtos importados da B&H (/products/edit/:id). Todos os blocos da tela estão descritos nos tópicos ao lado, na mesma ordem em que aparecem no formulário.',
      },
      {
        type: 'bullets',
        items: [
          'Importar da URL (Opcional) — preenche o formulário automaticamente a partir de uma página de produto (ex.: B&H) via Firecrawl.',
          'Datas do Produto — controle de auditoria: criado, última alteração e última revisão, com badges de status e botão "Marcar como revisado".',
          'Informações Básicas — nome, SKU, fabricante, categoria, URL de origem, Verificação de Preço B&H e descrição.',
          'Preços e Custos — venda USA, custo USA, CIF SP estimado (calculado) e preços nacionalizados.',
          'Configuração de Rebate (USA) — price/cost rebate e data de expiração.',
          'Especificações Físicas e Especificações Técnicas — dimensões, peso, estoque e o texto técnico.',
          'Imagem e Classificação — upload manual de imagem (3 formas), URL externa e NCM com autocomplete + botão "✨ Sugerir NCM".',
          'Relacionamentos e Status — Produtos Relacionados (Manual vs IA) e os checkboxes "Destaque Especial" e "Descontinuado".',
          'No rodapé do formulário ficam os botões Limpar, Cancelar e Salvar/Atualizar Produto.',
        ],
      },
      {
        type: 'info',
        text: 'Os campos marcados com * são obrigatórios: Nome, SKU, Fabricante e Categoria. O produto não salva sem categoria válida — sem ela, o sistema recusa o cadastro.',
      },
    ],
  },
  {
    id: 'import-url',
    icon: '🌐',
    title: 'Importar da URL (Firecrawl)',
    blocks: [
      {
        type: 'paragraph',
        text: 'O card "Importar da URL (Opcional)", no topo da tela, preenche o formulário automaticamente com os dados de uma página de produto — tipicamente uma página da B&H.',
      },
      {
        type: 'steps',
        items: [
          'Cole a URL da página do produto no campo (ex.: https://www.bhphotovideo.com/c/product/...).',
          'Clique em "Extrair Dados" — a extração usa a API Firecrawl e preenche os campos do formulário (nome, SKU, descrição, preços, especificações etc.).',
          'Confira TODOS os campos preenchidos antes de salvar: a extração é um auxílio, não uma garantia — dados faltantes ou errados continuam sendo responsabilidade da conferência humana.',
        ],
      },
      {
        type: 'bullets',
        items: [
          'Custo: cada importação consome 1 crédito da API Firecrawl.',
          'Os créditos renovam mensalmente no dia 27 de cada mês.',
          'Após a extração, o campo "URL de Origem" (website_url) guarda o link de onde os dados vieram, exibido logo abaixo do campo com link clicável.',
        ],
      },
      {
        type: 'warning',
        text: 'A importação por URL NÃO traz a imagem do produto da B&H. A foto precisa ser anexada manualmente — veja o tópico "Imagem do Produto" mais adiante.',
      },
    ],
  },
  {
    id: 'dates',
    icon: '📅',
    title: 'Datas do Produto e badges de revisão',
    blocks: [
      {
        type: 'paragraph',
        text: 'O bloco destacado "Datas do Produto", logo abaixo do card de importação, é a trilha de auditoria do produto: ele mostra quando o produto nasceu, quando foi alterado pela última vez e quando recebeu a última revisão humana.',
      },
      {
        type: 'bullets',
        items: [
          'Criado em — definido no primeiro salvamento. Na criação, as três datas nascem iguais (updated_at = last_reviewed_at = created_at).',
          'Última alteração em — atualizado sempre que o produto muda de verdade (alteração real atualiza updated_at).',
          'Última revisão em — atualizado apenas quando alguém clica em "Marcar como revisado" (last_reviewed_at).',
        ],
      },
      {
        type: 'paragraph',
        text: 'No modo de edição, um badge ao lado do título mostra o estado da conferência:',
      },
      {
        type: 'bullets',
        items: [
          '🟢 "Revisado após a última alteração" (badge verde, com ponto pulsante) — a última revisão é mais recente que a última alteração: o produto está conferido em sua versão atual.',
          '🔵 "Alterado — pendente de conferência" (badge azul) — o produto mudou depois da última revisão: alguém precisa conferi-lo.',
          'No cadastro novo, o badge diz "Novo cadastro (as 3 datas nascerão iguais)".',
        ],
      },
      {
        type: 'steps',
        items: [
          'Confira os dados do produto (preços, NCM, categoria, imagem, descrição...).',
          'Clique em "Marcar como revisado" (botão com ícone de check verde, no cabeçalho do bloco, apenas no modo edição).',
          'Somente a data "Última revisão em" avança — a data de alteração e a de criação ficam intactas.',
          'O badge volta a ficar azul ("Alterado — pendente de conferência") assim que o produto sofrer qualquer alteração real após a revisão.',
        ],
      },
      {
        type: 'warning',
        text: 'Regras das datas: criação zera as três (iguais); alteração real atualiza "criado/alteração" (as duas); revisão manual atualiza SOMENTE a última revisão. Marcar como revisado sem conferir destrói a utilidade da auditoria.',
      },
      {
        type: 'info',
        text: 'Aplicar um preço pela Verificação de Preço B&H também atualiza as datas de alteração e de revisão para o mesmo momento (foi uma ação humana conferida).',
      },
    ],
  },
  {
    id: 'basic-info',
    icon: '🧾',
    title: 'Informações Básicas',
    blocks: [
      {
        type: 'paragraph',
        text: 'O bloco "Informações Básicas" concentra a identidade do produto no catálogo.',
      },
      {
        type: 'bullets',
        items: [
          'Nome do Produto * — nome completo e explícito (ex.: "Sony FX6 Full-Frame Cinema Camera"). Obrigatório.',
          'SKU * — o código único do produto. OBRIGATÓRIO e BLOQUEADO no modo de edição: o SKU nunca muda depois de criado, porque é a chave de sincronização com a B&H e com o resto do sistema.',
          'Fabricante * — seleção obrigatória. O botão "+" ao lado do rótulo abre um dialog para criar um fabricante novo na hora.',
          'Categoria * — seleção obrigatória (o produto não salva sem ela). O botão "+" ao lado do rótulo abre um dialog para criar uma categoria nova na hora.',
          'URL de Origem / Fornecedor (B&H) — link da página do produto na B&H (website_url). Preenchido automaticamente pela importação e usado pela Verificação de Preço.',
          'Descrição — texto livre, exibido na página do produto no site.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Verificação de Preço B&H (aparece só no modo de edição, com o produto já salvo): o componente BhPriceChecker confere o preço atual da B&H a partir da URL de origem.',
      },
      {
        type: 'bullets',
        items: [
          'Aplicar preço — grava o preço encontrado no campo "Preço Venda USA" e carimba as datas de alteração e revisão.',
          'Detecção de descontinuado — quando a B&H indica que o produto acabou, o checker avisa e pode marcar o checkbox "Descontinuado" do formulário (com sua confirmação).',
          'Descoberta de URL — se o produto não tinha URL de origem, o checker pode descobri-la e preencher o campo website_url.',
        ],
      },
      {
        type: 'info',
        text: 'Não existe exclusão de produto nesta tela: o caminho para tirar um produto do ar é marcar "Descontinuado" — veja o tópico "Relacionamentos e Status".',
      },
    ],
  },
  {
    id: 'pricing',
    icon: '💵',
    title: 'Preços e Custos',
    blocks: [
      {
        type: 'paragraph',
        text: 'O bloco "Preços e Custos" guarda os quatro valores monetários do produto e a moeda do nacionalizado.',
      },
      {
        type: 'bullets',
        items: [
          'Preço Venda USA (USD) — o preço de tabela nos EUA (price_usa). É a base de todos os cálculos.',
          'Preço Custo USA (USD) — o seu custo de aquisição nos EUA (price_cost).',
          'Preço CIF SP Estimado — SOMENTE LEITURA/CALCULADO: o campo vem desabilitado e cinza porque é estimado pelo sistema a partir do custo USA e das regras de importação. Você não digita nele.',
          'Preço de Venda Nacionalizado — preço de venda já nacionalizado (em BRL ou USD).',
          'Preço de Custo Nacionalizado — custo já nacionalizado (em BRL ou USD).',
          'Moeda (Nacionalizado) — seletor BRL (Real) ou USD (Dólar) que define a moeda dos preços nacionalizados.',
        ],
      },
      {
        type: 'warning',
        text: 'O "Preço CIF SP Estimado" é sempre calculado pelo sistema — digitar nele é impossível de propósito. Se ele parecer errado, a causa está no custo USA ou nas fórmulas de precificação (módulo de Precificação), não neste campo.',
      },
    ],
  },
  {
    id: 'rebate',
    icon: '🏷️',
    title: 'Configuração de Rebate (USA)',
    blocks: [
      {
        type: 'paragraph',
        text: 'O bloco "Configuração de Rebate (USA)" (borda âmbar) registra o rebate do fabricante diretamente nos campos nativos do produto: Price USA Rebate, Price Cost Rebate e Data de Expiração (Rebate).',
      },
      {
        type: 'bullets',
        items: [
          'Price USA Rebate — o preço de venda efetivo do produto durante o rebate (já com o desconto do fabricante aplicado).',
          'Price Cost Rebate — o custo proporcional durante o rebate (calculado na mesma proporção do preço).',
          'Data de Expiração (Rebate) — campo data e hora que define a vigência do rebate. Depois dela, o rebate deixa de valer no site.',
        ],
      },
      {
        type: 'steps',
        items: [
          'Preencha os dois valores de rebate e a data de expiração.',
          'Salve o produto: o rebate é gravado em products (price_usa_rebate, price_cost_rebate, date_rebate).',
          'O sistema gera/gerencia o desconto fixo "Rebate Fabricante" a partir desses campos — é ele que aparece para o cliente no site durante a vigência.',
        ],
      },
      {
        type: 'warning',
        text: 'REGRA FUNDAMENTAL: o rebate NUNCA altera o price_usd (Preço Venda USA). O preço de tabela permanece o original; o rebate vive nos campos próprios e no desconto fixo "Rebate Fabricante", com validade igual à data de expiração informada.',
      },
      {
        type: 'info',
        text: 'Salvar um rebate também carimba as datas de alteração e revisão do produto para o mesmo momento — configurar rebate é uma ação humana conferida.',
      },
    ],
  },
  {
    id: 'physical-specs',
    icon: '📐',
    title: 'Especificações Físicas',
    blocks: [
      {
        type: 'paragraph',
        text: 'O bloco "Especificações Físicas" guarda os dados de logística e estoque do produto.',
      },
      {
        type: 'bullets',
        items: [
          'Dimensões (ex: 10x10x10) — texto livre no formato largura x altura x profundidade.',
          'Peso (lbs) — peso em LIBRAS (unidade americana), não em kg. Digite com decimais (ex.: 3.45).',
          'Estoque — quantidade disponível (número inteiro).',
        ],
      },
    ],
  },
  {
    id: 'technical-specs',
    icon: '⚙️',
    title: 'Especificações Técnicas',
    blocks: [
      {
        type: 'paragraph',
        text: 'O bloco "Especificações Técnicas" é um campo de texto longo (technical_info) para as especificações detalhadas do produto.',
      },
      {
        type: 'bullets',
        items: [
          'Use para as características técnicas completas (ex.: "Sensor full-frame 10.2MP, ISO 409600, 4K 120p...").',
          'Este texto alimenta a SUGESTÃO DE NCM por IA (botão "✨ Sugerir NCM") — quanto mais completo, melhor a sugestão.',
          'Também é exibido na página do produto no site (aba/modal de informações técnicas).',
        ],
      },
      {
        type: 'info',
        text: 'Não há formato rígido: uma linha por característica funciona bem, tanto para leitura humana quanto para a IA.',
      },
    ],
  },
  {
    id: 'image',
    icon: '🖼️',
    title: 'Imagem do Produto (anexo manual)',
    blocks: [
      {
        type: 'warning',
        text: 'ATENÇÃO ESPECIAL: a importação por URL da B&H NÃO traz a imagem do produto. A foto precisa ser anexada MANUALMENTE, sempre. Este é o erro mais comum do cadastro — produto importado fica sem imagem até alguém anexar.',
      },
      {
        type: 'paragraph',
        text: 'Há TRÊS formas de anexar a imagem manualmente, todas na área de soltar (dropzone) do bloco "Imagem e Classificação":',
      },
      {
        type: 'bullets',
        items: [
          '1. Arrastar — arraste o arquivo de imagem para dentro da área tracejada (a borda fica destacada quando o arquivo está sobre ela).',
          '2. Ctrl+V / Cmd+V — copie a imagem (ex.: print ou arquivo copiado) e cole com Ctrl+V (Windows/Linux) ou Cmd+V (Mac) em qualquer lugar da página.',
          '3. Clique para selecionar — clique na área tracejada para abrir o seletor de arquivos do computador.',
        ],
      },
      {
        type: 'steps',
        items: [
          'Prepare o arquivo: apenas JPEG (.jpg/.jpeg) ou PNG (.png), com no máximo 10MB.',
          'Anexe por qualquer uma das três formas acima — o sistema mostra "Enviando para o Supabase Storage..." durante o upload.',
          'Ao terminar, o upload preenche automaticamente o campo image_url do produto com a URL pública do arquivo no Supabase Storage.',
          'Confira o preview à direita da dropzone — o botão redondo vermelho no canto do preview REMOVE a imagem.',
        ],
      },
      {
        type: 'bullets',
        items: [
          'Alternativa — URL externa direta: o campo "Ou forneça uma URL direta da imagem (opcional)" aceita um link de imagem hospedado fora do Storage. O preview mostra se a URL carrega (status de sucesso/erro logo abaixo do preview).',
          'Erro comum: a imagem da página da B&H está BLOQUEADA POR HOTLINK — copiar o link da foto da B&H e colar como URL externa normalmente NÃO carrega (o servidor da B&H recusa). Nesse caso, use o upload manual: baixe a imagem, arraste/Cole/selecione e deixe o Supabase Storage servir o arquivo.',
          'Se o preview mostrar "Não foi possível carregar a imagem", a URL está inacessível ou em formato inválido — troque por um upload manual.',
        ],
      },
      {
        type: 'success',
        text: 'Regra de ouro: prefira SEMPRE o upload manual (arrastar, Ctrl+V ou clique) — o arquivo fica no Supabase Storage, carrega rápido no site e nunca quebra por hotlink.',
      },
    ],
  },
  {
    id: 'ncm',
    icon: '🔖',
    title: 'Classificação e NCM',
    blocks: [
      {
        type: 'paragraph',
        text: 'O NCM (Nomenclatura Comum do Mercosul) é OBRIGATÓRIO e deve ter exatamente 8 dígitos. O campo de classificação fica no bloco "Imagem e Classificação", junto com a imagem.',
      },
      {
        type: 'bullets',
        items: [
          'Autocomplete com validação estrita — ao digitar, o campo (NcmAutocompleteField) busca códigos reais na base Siscomex/NCM e só aceita um código que EXISTA. Código inexistente, incompleto ou inválido gera erro de validação e impede o salvar.',
          'Contador de dígitos — o rótulo mostra a contagem entre parênteses quando o campo tem 8 dígitos (ex.: (85256010)).',
          'Sugestões Rápidas — quando existem, aparecem abaixo do campo com código formatado (9007.10.00), descrição e % de confiança; clicar em uma aplica o NCM no campo.',
        ],
      },
      {
        type: 'paragraph',
        text: 'O botão "✨ Sugerir NCM" (canto superior direito do campo, borda âmbar) abre o painel de sugestão por IA (NcmSuggestDialog):',
      },
      {
        type: 'steps',
        items: [
          'Clique em "✨ Sugerir NCM" — a IA analisa o produto usando categoria + fabricante + nome/descrição + especificações técnicas (e os NCMs aceitáveis da categoria, quando cadastrados).',
          'O painel apresenta os códigos candidatos com justificativa e nível de confiança.',
          'Você aplica a sugestão que fizer sentido — a aplicação preenche o campo de NCM do formulário.',
        ],
      },
      {
        type: 'warning',
        text: 'A sugestão de NCM é SEMPRE INDICATIVA e a decisão é SEMPRE HUMANA: a IA apenas propõe códigos com justificativa; quem valida, confere e grava o NCM é você, através do autocomplete com validação estrita.',
      },
      {
        type: 'info',
        text: 'Dica: mantenha a categoria do produto correta ANTES de pedir a sugestão — a categoria é o sinal mais forte que a IA usa (os NCMs aceitáveis da família entram como candidatos prioritários).',
      },
    ],
  },
  {
    id: 'related-status',
    icon: '🔗',
    title: 'Produtos Relacionados, Destaque e Descontinuado',
    blocks: [
      {
        type: 'paragraph',
        text: 'O bloco "Relacionamentos e Status" reúne os produtos relacionados e as duas flags de exibição do site.',
      },
      {
        type: 'paragraph',
        text: 'Produtos Relacionados — busca por nome ou SKU, lista com checkboxes e as tags de origem de cada vínculo:',
      },
      {
        type: 'bullets',
        items: [
          'Tag "Manual" (azul) — vínculo criado por uma pessoa: marcar o checkbox do produto na lista cria um vínculo manual.',
          'Tag "IA" (roxa) — vínculo sugerido pelo motor de IA (módulo de Produtos Relacionados). Apenas vínculos IA podem ser desvinculados pelo botão de remover (×) na tag.',
          'Marcar/desmarcar: o checkbox da lista marca/desmarca o produto relacionado; as tags no topo mostram todos os vínculos ativos e permitem remover (×) — desmarcar no checkbox remove o vínculo manual; o × na tag remove o vínculo IA.',
          'Um produto pode ter as duas origens ao mesmo tempo (as duas tags aparecem).',
        ],
      },
      {
        type: 'paragraph',
        text: 'Flags de status do produto:',
      },
      {
        type: 'bullets',
        items: [
          'Destaque Especial — marca o produto como destaque na vitrine do site (is_special).',
          'Descontinuado (is_discontinued) — marca o produto como fora de linha: o site exibe o SELO "Descontinuado" e BLOQUEIA a compra do item. É também o caminho para tirar um produto do ar sem excluí-lo.',
        ],
      },
      {
        type: 'warning',
        text: 'Descontinuar não é excluir: o produto continua no catálogo (histórico, pedidos, URLs) apenas com a compra bloqueada e o selo visível. Confira se é isso que você quer antes de marcar.',
      },
    ],
  },
  {
    id: 'actions',
    icon: '💾',
    title: 'Botões Limpar, Cancelar e Salvar',
    blocks: [
      {
        type: 'paragraph',
        text: 'O rodapé do formulário concentra as três ações finais, todas desabilitadas enquanto o formulário está ocupado (extraindo da URL, salvando ou enviando imagem).',
      },
      {
        type: 'bullets',
        items: [
          'Limpar — reseta o formulário para o estado inicial e limpa a URL de importação e as sugestões de NCM pendentes. Não salva nada.',
          'Cancelar — descarta as alterações e volta para a lista de produtos do catálogo (/admin/catalog).',
          'Salvar Produto / Atualizar Produto — valida tudo (campos obrigatórios, NCM de 8 dígitos existente, categoria) e grava. Em edição, o botão se chama "Atualizar Produto".',
        ],
      },
      {
        type: 'warning',
        text: '"Limpar" descarta o que você digitou de verdade — não há confirmação. Se o formulário já estava preenchido com dados bons (ex.: produto importado da B&H), prefira Cancelar (que também não salva) a Limpar por engano.',
      },
      {
        type: 'success',
        text: 'Checklist antes de salvar: Nome, SKU, Fabricante e Categoria preenchidos; NCM de 8 dígitos válido; imagem anexada manualmente (a B&H não traz); rebate com data de expiração, se houver.',
      },
    ],
  },
]

/* ============================================================================
 * MODAL DE INSTRUÇÕES — navegação por tópicos (lista à esquerda + conteúdo)
 * ========================================================================== */

export interface ProductFormHelpModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function renderBlock(block: ProductHelpBlock, idx: number): React.ReactNode {
  switch (block.type) {
    case 'paragraph':
      return (
        <p key={idx} className="text-sm leading-relaxed text-foreground/90">
          {block.text}
        </p>
      )
    case 'steps':
      return (
        <ol key={idx} className="space-y-2">
          {block.items?.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
              <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center">
                {i + 1}
              </span>
              <span className="text-foreground/90">{item}</span>
            </li>
          ))}
        </ol>
      )
    case 'bullets':
      return (
        <ul key={idx} className="space-y-2">
          {block.items?.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
              <span className="mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full bg-primary/60" />
              <span className="text-foreground/90">{item}</span>
            </li>
          ))}
        </ul>
      )
    case 'warning':
      return (
        <div
          key={idx}
          className="flex items-start gap-2.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-500/10 p-3"
        >
          <span className="text-base leading-none mt-0.5">⚠️</span>
          <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">{block.text}</p>
        </div>
      )
    case 'info':
      return (
        <div
          key={idx}
          className="flex items-start gap-2.5 rounded-lg border border-sky-300 dark:border-sky-800 bg-sky-500/10 p-3"
        >
          <span className="text-base leading-none mt-0.5">ℹ️</span>
          <p className="text-xs leading-relaxed text-sky-800 dark:text-sky-300">{block.text}</p>
        </div>
      )
    case 'success':
      return (
        <div
          key={idx}
          className="flex items-start gap-2.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-500/10 p-3"
        >
          <span className="text-base leading-none mt-0.5">✅</span>
          <p className="text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">
            {block.text}
          </p>
        </div>
      )
    case 'code':
      return (
        <pre
          key={idx}
          className="text-xs font-mono bg-muted rounded-lg p-3 overflow-x-auto text-foreground/90"
        >
          {block.text}
        </pre>
      )
    default:
      return null
  }
}

export function ProductFormHelpModal({ open, onOpenChange }: ProductFormHelpModalProps) {
  const [activeTopicId, setActiveTopicId] = useState<string>(PRODUCT_FORM_HELP_TOPICS[0]?.id || '')

  // Reiniciar para o primeiro tópico sempre que o modal abre
  React.useEffect(() => {
    if (open) {
      setActiveTopicId(PRODUCT_FORM_HELP_TOPICS[0]?.id || '')
    }
  }, [open])

  const activeTopic =
    PRODUCT_FORM_HELP_TOPICS.find((t) => t.id === activeTopicId) || PRODUCT_FORM_HELP_TOPICS[0]

  const activeIndex = PRODUCT_FORM_HELP_TOPICS.findIndex((t) => t.id === activeTopic?.id)
  const goPrev = () => {
    if (activeIndex > 0) setActiveTopicId(PRODUCT_FORM_HELP_TOPICS[activeIndex - 1].id)
  }
  const goNext = () => {
    if (activeIndex < PRODUCT_FORM_HELP_TOPICS.length - 1) {
      setActiveTopicId(PRODUCT_FORM_HELP_TOPICS[activeIndex + 1].id)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="p-5 pb-4 border-b bg-muted/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold">Instruções do formulário</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Como usar o cadastro/edição de produto: importação B&H, datas e revisão, preços e
                CIF, rebate, especificações, imagem (anexo manual), NCM, relacionados e status.
                Feito para humanos e para IA.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          {/* Navegação por tópicos */}
          <nav
            aria-label="Tópicos das instruções do formulário"
            className="shrink-0 border-b md:border-b-0 md:border-r bg-muted/10 p-2 md:w-64 md:overflow-y-auto"
          >
            <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible">
              {PRODUCT_FORM_HELP_TOPICS.map((topic, i) => {
                const isActive = topic.id === activeTopic?.id
                return (
                  <li key={topic.id} className="shrink-0 md:shrink">
                    <button
                      type="button"
                      onClick={() => setActiveTopicId(topic.id)}
                      className={cn(
                        'w-full text-left text-xs rounded-md px-3 py-2 transition-colors flex items-center gap-2 whitespace-nowrap md:whitespace-normal',
                        isActive
                          ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span aria-hidden="true">{topic.icon}</span>
                      <span className="truncate md:truncate-normal">
                        <span className="md:hidden font-mono text-[10px] opacity-60 mr-1">
                          {i + 1}.
                        </span>
                        {topic.title}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* Conteúdo do tópico ativo */}
          <div className="flex-1 min-w-0 overflow-y-auto p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden="true">
                {activeTopic?.icon}
              </span>
              <h3 className="text-base font-bold text-foreground">{activeTopic?.title}</h3>
              <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                {activeIndex + 1}/{PRODUCT_FORM_HELP_TOPICS.length}
              </Badge>
            </div>

            <div className="space-y-3.5">
              {activeTopic?.blocks.map((block, idx) => renderBlock(block, idx))}
            </div>

            {/* Navegação anterior/próximo */}
            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={goPrev}
                disabled={activeIndex <= 0}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Anterior
              </Button>
              <span className="text-[11px] text-muted-foreground font-mono">
                {activeIndex + 1} de {PRODUCT_FORM_HELP_TOPICS.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={goNext}
                disabled={activeIndex >= PRODUCT_FORM_HELP_TOPICS.length - 1}
              >
                Próximo
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Rodapé: convenção de manutenção + nota de versão */}
        <div className="shrink-0 border-t bg-muted/20 px-5 py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 text-[11px] text-muted-foreground">
          <span className="leading-snug">
            <strong className="text-foreground/80">Convenção de manutenção:</strong> qualquer
            alteração neste formulário deve atualizar este arquivo de instruções{' '}
            <code className="font-mono bg-muted px-1 py-0.5 rounded">
              src/content/help/productFormHelp.tsx
            </code>{' '}
            no mesmo commit.
          </span>
          <span className="shrink-0 font-mono">
            {HELP_VERSION} · Última atualização: {HELP_LAST_UPDATED}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ProductFormHelpModal
