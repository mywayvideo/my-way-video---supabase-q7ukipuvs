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
 * INSTRUÇÕES DO MÓDULO DE CATEGORIAS (/admin/categories)
 * ============================================================================
 *
 * CONVENÇÃO DE MANUTENÇÃO (REGRA PERMANENTE DO PROJETO):
 *   Qualquer alteração no módulo de categorias (/admin/categories) deve
 *   atualizar ESTE arquivo no MESMO commit — incluindo a nota de versão /
 *   "Última atualização" no rodapé do modal.
 *
 * Todo o conteúdo do modal de instruções é 100% centralizado aqui: tópicos,
 * passos, avisos e a nota de versão. O modal (CategoriesHelpModal, também
 * neste arquivo) apenas renderiza esta estrutura. Os textos descrevem as
 * funcionalidades REAIS do módulo, lidas do código existente.
 *
 * Se você adicionou uma feature nova no módulo:
 *   1. Adicione/edite um tópico em CATEGORIES_HELP_TOPICS abaixo.
 *   2. Atualize HELP_LAST_UPDATED (e HELP_VERSION, se houver nova versão).
 *   3. Faça tudo no mesmo commit da feature.
 */

export const HELP_VERSION = 'v0.0.773'
export const HELP_LAST_UPDATED = '09/11/2026'

export type HelpBlockType =
  | 'paragraph'
  | 'steps'
  | 'bullets'
  | 'warning'
  | 'info'
  | 'success'
  | 'code'

export interface HelpBlock {
  type: HelpBlockType
  text?: string
  items?: string[]
}

export interface HelpTopic {
  id: string
  icon: string
  title: string
  blocks: HelpBlock[]
}

/**
 * Tópicos do modal de instruções — em ordem de navegação.
 * A chave `icon` é um emoji propositalmente simples: o modal renderiza como texto.
 */
export const CATEGORIES_HELP_TOPICS: HelpTopic[] = [
  {
    id: 'overview',
    icon: '🗂️',
    title: 'Visão geral do módulo',
    blocks: [
      {
        type: 'paragraph',
        text: 'Este módulo organiza todo o catálogo em categorias canônicas (oficiais) e valida o padrão dos NCMs de cada família. Ele é a base para a Sugestão de NCM (classify-ncm), para filtros do site e para a qualidade da importação B&H.',
      },
      {
        type: 'steps',
        items: [
          'No topo ficam os 4 cards de métricas: Fila de Triagem (Legado), Sem Categoria, Oficiais Vinculados e Total de Categorias.',
          'Logo abaixo, a grade mostra TODAS as categorias cadastradas, cada card com contagem de produtos, pendências legadas, itens fora do padrão de NCM e um preview dos NCMs aceitáveis.',
          'Clique em um card de categoria para filtrar a tabela de produtos por ela. Clique novamente (ou em "Limpar filtro de categoria") para voltar.',
          'Os botões de editar (lápis) e excluir (lixeira) aparecem no topo de cada card de categoria ao passar o mouse.',
          'A tabela central lista os produtos da aba ativa, com busca por nome, SKU ou NCM e paginação de 50 itens por página.',
        ],
      },
      {
        type: 'info',
        text: 'Passe o mouse sobre os badges dos cards (ex.: "+3 leg", "2 fora do padrão") para ver o que cada contador significa.',
      },
    ],
  },
  {
    id: 'tabs-filters',
    icon: '🔍',
    title: 'Abas e filtros',
    blocks: [
      {
        type: 'paragraph',
        text: 'A barra de filtros acima da tabela divide o catálogo em 4 visões complementares. Os contadores entre parênteses vêm das métricas ao vivo do topo da página.',
      },
      {
        type: 'bullets',
        items: [
          'Fila de Triagem — produtos que só têm rótulo legado (coluna "category" antiga, ex.: "lentes zoom standard") e ainda não têm categoria oficial (category_id). É o ponto de partida recomendado.',
          'Sem Categoria — produtos sem NENHUM vínculo: nem category_id, nem rótulo legado útil. São os mais urgentes, porque a triagem automática tem menos informação para trabalhar.',
          'Vinculados — produtos com category_id gravado (categoria oficial confirmada). Nesta aba a coluna mostra a categoria gravada e o seletor "Trocar..." na coluna Ações.',
          'Todos — o catálogo inteiro, em qualquer estado.',
        ],
      },
      {
        type: 'steps',
        items: [
          'Clique na aba desejada (ou no card correspondente no topo) — o contador do card e o botão da aba mostram o mesmo número.',
          'Use o campo de busca para refinar por nome, SKU ou NCM. A busca respeita a aba ativa.',
          'Se uma categoria estiver selecionada na grade, um badge "Filtrando por: <nome>" aparece ao lado das abas; clique no × para limpar.',
          'Use a paginação (Anterior / Próxima) para navegar — a contagem "Mostrando X - Y de Z" sempre reflete a aba e a busca atuais.',
        ],
      },
      {
        type: 'warning',
        text: 'A busca busca por nome, SKU e NCM; não busca por descrição ou fabricante.',
      },
    ],
  },
  {
    id: 'triage-queue',
    icon: '✨',
    title: 'Fila de triagem (sugestão automática)',
    blocks: [
      {
        type: 'paragraph',
        text: 'A fila de triagem é onde você confirma a categoria oficial de produtos que só possuem rótulo legado. O sistema calcula uma sugestão automática em 2 camadas, exibida com um selo de confiança e um ícone de interrogação (?) que mostra o motivo (ex.: "Rótulo legado exato \\"lentes prime\\" mapeado para Lenses").',
      },
      {
        type: 'bullets',
        items: [
          'Alta confiança (selo verde com escudo) — o rótulo legado do produto casa exatamente com o dicionário de rótulos legados → categorias canônicas (ex.: "camcorders" → Cameras). Também cobre as regras especiais de produtos Cintel (scanner/gate → Converters; leitor/kit de limpeza → Accessories).',
          'Média confiança (selo azul) — dedução por palavras-chave no nome/descrição e/ou NCM típico da família (ex.: NCM 9002 ou termos de lente → Lenses; "switcher/ATEM" → Production Switchers). É uma pista útil, não uma certeza.',
          'Sem sugestão conclusiva — quando nenhuma camada acerta, a linha mostra "Sem sugestão automática conclusiva" e a escolha fica 100% manual.',
        ],
      },
      {
        type: 'steps',
        items: [
          'Confira o selo de confiança e passe o mouse no ícone ? para ler o motivo da sugestão.',
          'O dropdown da linha já vem pré-selecionado com a sugestão — troque se necessário.',
          'Clique em "Confirmar categoria" para gravar o vínculo oficial (category_id) do produto.',
          'Use "Revisar depois" quando estiver em dúvida: o produto é ocultado da fila nesta sessão (não grava nada) e volta a aparecer em outra sessão ou em uma busca.',
          'Repita até a fila chegar a zero: o estado vazio mostra "Parabéns! Não há produtos pendentes na fila de triagem."',
        ],
      },
      {
        type: 'warning',
        text: 'A regra do "Revisar depois": o adiamento é por SESSÃO (em memória, nunca gravado no banco). Ao recarregar a página ou reabrir o módulo, o produto volta à fila. Também é possível acessá-lo digitando o nome dele na busca.',
      },
      {
        type: 'info',
        text: 'Confirmar a categoria em uma linha remove o produto da lista na hora e atualiza os contadores dos cards, sem precisar recarregar a página.',
      },
    ],
  },
  {
    id: 'how-to-classify',
    icon: '🎯',
    title: 'Como classificar corretamente uma categoria',
    blocks: [
      {
        type: 'paragraph',
        text: 'A categoria descreve a FUNÇÃO principal do equipamento, não a marca nem o formato. Antes de confirmar, pergunte: "o que este produto faz no set?" — e só depois confira a sugestão automática.',
      },
      {
        type: 'bullets',
        items: [
          'Leia o nome completo e o SKU — o nome da B&H costuma ser explícito ("Sony FX6 Full-Frame Cinema Camera" → Cameras; "Canon RF 24-70mm f/2.8L" → Lenses).',
          'Confira o NCM atual: cada família tem NCMs típicos (Lenses 9002, Monitors 8528, Cameras 8525, Batteries 8507, Cabos 8544, Tripés 9620...). NCM destoante é um forte sinal de erro de classificação.',
          'Considere o kit: um corpo de câmera vendido em kit com lente continua sendo Cameras; a lente vendida separadamente é Lenses.',
          'Em caso de dúvida, abra o produto (links "Ver produto" ou o nome do produto) antes de confirmar.',
        ],
      },
      {
        type: 'bullets',
        items: [
          'Acessório classificado como câmera — a sugestão de média confiança casa a palavra "camera" no texto (ex.: "Camera Cage" ou "Camera Accessories"); o rótulo legado e o NCM (não-8525) denunciam o erro. Sempre confira o NCM antes de confirmar uma sugestão de média confiança.',
          'Kit/lente classificado como câmera pela palavra "camera" no nome — confira se o produto é o corpo ou a óptica.',
          'Rótulo legado genérico demais ("Accessories" para tudo) — confira o NCM e a função real antes de aceitar o mapeamento de alta confiança.',
          'Confirmar por pressão: prefira "Revisar depois" a confirmar uma dúvida — reclassificar depois é mais caro.',
        ],
      },
      {
        type: 'warning',
        text: 'Categoria é OBRIGATÓRIA para salvar produto: o formulário de produto recusa o cadastro sem categoria válida. Produtos importados (CSV/B&H/individual) sem categoria válida recebem sugestão automática e ficam retidos na área de revisão admin até que alguém confirme a categoria.',
      },
      {
        type: 'success',
        text: 'Regra de ouro: categoria certa = NCM típico da família + função principal correta. Quando os dois apontam para o mesmo lugar, confirme sem medo.',
      },
    ],
  },
  {
    id: 'bulk-migration',
    icon: '➡️',
    title: 'Migração em massa',
    blocks: [
      {
        type: 'paragraph',
        text: 'Para mover muitos produtos de uma vez (ex.: reclassificar uma família inteira que estava com rótulo errado), use a seleção por checkbox e a barra de migração.',
      },
      {
        type: 'steps',
        items: [
          'Selecione os produtos com os checkboxes da primeira coluna — use o checkbox do cabeçalho para marcar todos da página.',
          'A barra roxa "X produto(s) selecionado(s)" aparece acima da tabela, com o botão "Desmarcar todos" ao lado.',
          'Escolha a categoria de destino no seletor "Mover para categoria...".',
          'Clique em "Confirmar Migração" — todos os produtos selecionados recebem o category_id da categoria destino.',
          'Os contadores dos cards e a tabela se atualizam na hora, sem reload.',
        ],
      },
      {
        type: 'warning',
        text: 'A migração substitui a categoria oficial dos produtos selecionados (inclusive de produtos já vinculados). Confira a seleção antes de Confirmar Migração.',
      },
      {
        type: 'info',
        text: 'A seleção em massa funciona em todas as abas, não só na fila de triagem. A seleção é limpa após a migração ou ao trocar de aba/página.',
      },
    ],
  },
  {
    id: 'auditoria',
    icon: '📋',
    title: 'Trilha de auditoria das mudanças de categoria',
    blocks: [
      {
        type: 'paragraph',
        text: 'Toda mudança de categoria de um produto fica registrada automaticamente, para qualquer perfil — admin ou revisor. O registro guarda quem alterou, quando, de qual categoria para qual e o motivo informado.',
      },
      {
        type: 'bullets',
        items: [
          'Tabela category_audit_log: histórico completo, somente leitura.',
          'View v_category_audit_recent: últimas mudanças com o nome legível das categorias (de → para).',
          'O histórico é append-only: não é possível editar nem apagar um registro, nem por um administrador.',
          'Se a categoria for alterada sem motivo informado, o registro existe mesmo assim, com o campo de motivo vazio.',
        ],
      },
      {
        type: 'info',
        text: 'Para auditar o trabalho do perfil revisor, filtre por changed_role = reviewer. Isso mostra exatamente o que foi classificado pela revisão, quando e com qual justificativa.',
      },
    ],
  },
  {
    id: 'perfis-permissoes',
    icon: '🔐',
    title: 'Perfis de acesso: administrador e revisor',
    blocks: [
      {
        type: 'paragraph',
        text: 'O módulo distingue dois perfis. O bloqueio é feito no BANCO DE DADOS (RLS), não apenas na tela: esconder um botão não é proteção — o banco recusa a operação de qualquer forma.',
      },
      {
        type: 'bullets',
        items: [
          'Administrador (role = admin): acesso completo. Cria, renomeia, desativa e exclui categorias, ajusta os NCMs aceitáveis e edita produtos, incluindo o NCM.',
          'Revisor de Categorias e NCMs (role = reviewer): confirma e troca a categoria dos produtos na fila de triagem e na tabela, executa migração em massa e exporta listas. NÃO cria, renomeia, desativa nem exclui categorias, e NÃO altera NCM, preço ou qualquer outro dado do produto.',
          'Cliente (role = customer): não acessa o painel administrativo.',
        ],
      },
      {
        type: 'warning',
        text: 'Para o revisor, os botões "Nova Categoria", lápis e lixeira não aparecem — e, se a operação for tentada por outro caminho, o banco devolve erro de permissão. O perfil é gravado em customers.role e só um administrador pode alterá-lo.',
      },
      {
        type: 'info',
        text: 'Como o revisor não pode corrigir NCM, a revisão de NCM é sempre indicativa: ele registra o NCM correto e a justificativa, e o administrador aplica no cadastro do produto.',
      },
    ],
  },
  {
    id: 'crud',
    icon: '🛠️',
    title: 'CRUD de categorias (criar, editar, excluir)',
    blocks: [
      {
        type: 'paragraph',
        text: 'Disponível APENAS para o perfil administrador. Para o revisor, os controles de CRUD não são exibidos.',
      },
      {
        type: 'steps',
        items: [
          'Criar: botão "Nova Categoria" no cabeçalho. Informe o nome (obrigatório, sem duplicatas — o sistema recusa nomes repetidos), descrição opcional e os NCMs aceitáveis.',
          'Editar: botão de lápis no card da categoria (ou no modal "Total de Categorias"). Permite renomear, descrever, ativar/desativar e ajustar os NCMs aceitáveis.',
          'Excluir: botão de lixeira no card. Uma confirmação avisa a regra: a exclusão SÓ é permitida se NENHUM produto estiver vinculado à categoria.',
          'Impacto nos produtos: renomear muda o nome exibido em todo o sistema (site, filtros, importações). Desativar a categoria a esconde de novos cadastros e dos filtros de clientes, sem desvincular os produtos existentes. Excluir só é possível com a categoria vazia — produtos precisam ser migrados antes.',
        ],
      },
      {
        type: 'warning',
        text: 'Renomear uma categoria NÃO reescreve os rótulos legados ("category") dos produtos — a fila de triagem continua usando o dicionário de mapeamento, que aponta para o nome canônico novo automaticamente.',
      },
      {
        type: 'info',
        text: 'O card "Total de Categorias" (com o badge "Ver lista") abre um modal com todas as categorias, contadores e NCMs aceitáveis — com busca por nome ou NCM e atalhos "Ver produtos" e editar.',
      },
    ],
  },
  {
    id: 'acceptable-ncms',
    icon: '🛡️',
    title: 'NCMs aceitáveis por categoria',
    blocks: [
      {
        type: 'paragraph',
        text: 'Cada categoria pode ter uma lista de prefixos de NCM aceitáveis (campo acceptable_ncms). Ela define o "padrão da família" e alimenta a validação visual e a Sugestão de NCM/classify-ncm.',
      },
      {
        type: 'steps',
        items: [
          'No diálogo de criar/editar categoria, adicione prefixos no campo "NCMs Aceitáveis da Família".',
          'Formato por prefixo: 4, 6 ou 8 dígitos, ignorando pontuação — ex.: 9002 (posição inteira), 8543.70 (subposição) ou 8543.70.35 (código completo). O campo aceita digitar com ou sem pontos.',
          'A comparação é por INÍCIO do código: um produto com NCM 8543.70.99 casa com o prefixo 8543.70 (e com 8543). Prefixos de 4 e 6 dígitos ampliam a abrangência da família.',
          'Ao digitar, o hint abaixo do campo explica o que o prefixo cobre (ex.: "8543.70 cobre subitens como 8543.70.35 e 8543.70.99").',
          'Salve a categoria: os prefixos aparecem no preview dos cards ("NCMs: ...") e passam a valer na validação.',
        ],
      },
      {
        type: 'bullets',
        items: [
          'Validação visual: produtos com NCM que não casa com nenhum prefixo da categoria recebem o badge âmbar "NCM fora do padrão" na tabela (e o contador "fora do padrão" nos cards). Clique no badge para abrir o cadastro do produto.',
          'Sugestão de NCM / classify-ncm: os NCMs aceitáveis da categoria do produto são injetados como CANDIDATOS PRIORITÁRIOS na sugestão automática de NCM — tornando a sugestão coerente com a família.',
          'Sem restrição: se a categoria não tem prefixos, a validação fica neutra (aceita qualquer NCM, sem badge).',
        ],
      },
      {
        type: 'warning',
        text: 'A análise de NCM é SEMPRE indicativa — nunca auto-correção: o sistema apenas INDICA e justifica os NCMs (badge fora do padrão, candidatos prioritários). Nenhuma correção de NCM é aplicada automaticamente; a decisão é sempre humana, pelo cadastro do produto.',
      },
    ],
  },
  {
    id: 'exports',
    icon: '📤',
    title: 'Exportações',
    blocks: [
      {
        type: 'bullets',
        items: [
          'Copiar categorias (botão principal do cabeçalho) — copia para a área de transferência a lista de TODAS as categorias: nome + contagem de produtos vinculados, SEM NCMs. Se o navegador bloquear a cópia automática, o modal abre com o texto pronto para copiar manualmente.',
          'Baixar CSV — no modal "Lista de Categorias", baixa o arquivo categorias_myway_YYYY-MM-DD.csv com nome + contagem de produtos (sem NCMs).',
          'Categorias com NCMs (botão do cabeçalho) — abre um modal com texto simples organizado por categoria, incluindo os NCMs aceitáveis e as descrições curtas da Receita (imp_sim_tax_rates), no formato NCM — Descrição (8 dígitos com pontos), com botão Copiar.',
        ],
      },
      {
        type: 'steps',
        items: [
          'Clique no botão desejado no cabeçalho ("Copiar categorias", "Categorias com NCMs").',
          'No modal aberto, use Copiar (clipboard, com fallback automático) ou Baixar CSV (quando disponível).',
          'Cole em planilhas, editores ou compartilhe com o time — o formato é estável entre exportações.',
        ],
      },
      {
        type: 'warning',
        text: '"Copiar categorias" e o CSV contêm apenas nome + contagem de produtos (sem NCMs); só o modal "Categorias com NCMs" inclui os prefixos aceitáveis.',
      },
    ],
  },
  {
    id: 'metrics',
    icon: '📊',
    title: 'Métricas dos cards',
    blocks: [
      {
        type: 'bullets',
        items: [
          'Fila de Triagem (Legado) — total de produtos com rótulo legado aguardando confirmação de categoria oficial. É a sua pendência principal do dia.',
          'Sem Categoria — produtos sem category_id e sem rótulo legado aproveitável.',
          'Oficiais Vinculados — produtos com category_id gravado. Quanto maior em relação ao total, mais organizado está o catálogo.',
          'Total de Categorias — quantidade de categorias cadastradas (clicável: abre a lista completa).',
          'Contadores por categoria (na grade): "N prods" = produtos vinculados; "+N leg" = aguardando na triagem com rótulo legado desta categoria; N com alerta = produtos com NCM fora do padrão dos prefixos aceitáveis.',
        ],
      },
      {
        type: 'info',
        text: 'Todos os contadores são recalculados ao vivo a cada confirmação/migração/CRUD — não precisa recarregar a página. O botão "Atualizar" força a recarga de métricas e tabela.',
      },
    ],
  },
  {
    id: 'campo-texto-categoria',
    icon: '🔗',
    title: 'O rótulo de categoria do produto é derivado',
    blocks: [
      {
        type: 'paragraph',
        text: 'Cada produto guarda a categoria de duas formas: o vínculo oficial (category_id, uma chave estrangeira para a tabela de categorias) e um rótulo em texto (category). A partir de 09/11/2026 o rótulo NÃO é mais digitado nem sincronizado à mão: o banco o recalcula a partir do vínculo em toda gravação.',
      },
      {
        type: 'bullets',
        items: [
          'O vínculo oficial é a única fonte de verdade. O texto é consequência dele.',
          'Ao salvar um produto, o rótulo é automaticamente ajustado ao nome da categoria vinculada — mesmo que o cliente envie um rótulo diferente.',
          'Ao RENOMEAR uma categoria, o novo nome é propagado automaticamente para todos os produtos vinculados. Não é mais preciso corrigir produto por produto.',
          'Produto sem vínculo de categoria mantém o próprio texto (pode ser a pista usada pela Fila de Triagem).',
        ],
      },
      {
        type: 'info',
        text: 'Por que não apagar o campo: o rótulo alimenta a busca do site (coluna gerada search_text) e é lido por várias telas. Mantê-lo derivado preserva a busca e elimina a divergência.',
      },
      {
        type: 'warning',
        text: 'Se você vir um rótulo diferente do nome da categoria, não é preciso corrigir à mão: a próxima gravação do produto o alinha. Para alinhar em lote, peça a sincronização — ela reescreve apenas as linhas divergentes.',
      },
    ],
  },
]

/* ============================================================================
 * MODAL DE INSTRUÇÕES — navegação por tópicos (lista à esquerda + conteúdo)
 * ========================================================================== */

export interface CategoriesHelpModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function renderBlock(block: HelpBlock, idx: number): React.ReactNode {
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

export function CategoriesHelpModal({ open, onOpenChange }: CategoriesHelpModalProps) {
  const [activeTopicId, setActiveTopicId] = useState<string>(CATEGORIES_HELP_TOPICS[0]?.id || '')

  // Reiniciar para o primeiro tópico sempre que o modal abre
  React.useEffect(() => {
    if (open) {
      setActiveTopicId(CATEGORIES_HELP_TOPICS[0]?.id || '')
    }
  }, [open])

  const activeTopic =
    CATEGORIES_HELP_TOPICS.find((t) => t.id === activeTopicId) || CATEGORIES_HELP_TOPICS[0]

  const activeIndex = CATEGORIES_HELP_TOPICS.findIndex((t) => t.id === activeTopic?.id)
  const goPrev = () => {
    if (activeIndex > 0) setActiveTopicId(CATEGORIES_HELP_TOPICS[activeIndex - 1].id)
  }
  const goNext = () => {
    if (activeIndex < CATEGORIES_HELP_TOPICS.length - 1) {
      setActiveTopicId(CATEGORIES_HELP_TOPICS[activeIndex + 1].id)
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
              <DialogTitle className="text-lg font-bold">Instruções do módulo</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Como usar o Gerenciamento de Categorias: triagem, migração em massa, CRUD, NCMs
                aceitáveis, exportações e métricas. Feito para humanos e para IA.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          {/* Navegação por tópicos */}
          <nav
            aria-label="Tópicos das instruções"
            className="shrink-0 border-b md:border-b-0 md:border-r bg-muted/10 p-2 md:w-64 md:overflow-y-auto"
          >
            <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible">
              {CATEGORIES_HELP_TOPICS.map((topic, i) => {
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
                {activeIndex + 1}/{CATEGORIES_HELP_TOPICS.length}
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
                {activeIndex + 1} de {CATEGORIES_HELP_TOPICS.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={goNext}
                disabled={activeIndex >= CATEGORIES_HELP_TOPICS.length - 1}
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
            alteração neste módulo deve atualizar este arquivo de instruções{' '}
            <code className="font-mono bg-muted px-1 py-0.5 rounded">
              src/content/help/categoriesHelp.tsx
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

export default CategoriesHelpModal
