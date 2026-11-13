import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * Um dos três acessos da home (IA, Banco de Dados, Categorias).
 * Os três têm o MESMO peso visual — decisão do Patrick em 12/11/2026.
 */
export type AccessKind = 'ia' | 'bd' | 'cat'

const GLYPHS: Record<AccessKind, JSX.Element> = {
  ia: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
      <circle cx="12" cy="12" r="3.4" />
    </svg>
  ),
  bd: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="6" rx="7" ry="2.6" />
      <path d="M5 6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" />
      <path d="M5 12v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6" />
    </svg>
  ),
  cat: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" />
    </svg>
  ),
}

const ART: Record<AccessKind, JSX.Element> = {
  ia: (
    <svg viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="16" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="24" cy="34" r="7" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="96" cy="34" r="7" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="24" cy="88" r="7" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="96" cy="88" r="7" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M30 38 48 52M90 38 72 52M30 84 48 68M90 84 72 68"
        stroke="currentColor"
        strokeWidth="1"
      />
      <circle cx="60" cy="60" r="30" stroke="currentColor" strokeWidth=".6" strokeDasharray="3 5" />
    </svg>
  ),
  bd: (
    <svg viewBox="0 0 120 120" fill="none">
      <ellipse cx="60" cy="34" rx="34" ry="12" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M26 34v22c0 6.6 15.2 12 34 12s34-5.4 34-12V34"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M26 56v22c0 6.6 15.2 12 34 12s34-5.4 34-12V56"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M34 46h52M34 68h52" stroke="currentColor" strokeWidth=".55" opacity=".7" />
    </svg>
  ),
  cat: (
    <svg viewBox="0 0 120 120" fill="none">
      <rect x="22" y="22" width="30" height="30" rx="5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="68" y="22" width="30" height="30" rx="5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="22" y="68" width="30" height="30" rx="5" stroke="currentColor" strokeWidth="1.2" />
      <rect
        x="68"
        y="68"
        width="30"
        height="30"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="currentColor"
        fillOpacity=".18"
      />
    </svg>
  ),
}

const CONTEUDO: Record<AccessKind, { titulo: string; texto: string; acao: string }> = {
  ia: {
    titulo: 'Perguntar à IA',
    texto:
      'Descreva o que você precisa em linguagem normal. A IA entende uso, orçamento e característica — você não precisa saber o modelo.',
    acao: 'Conversar agora',
  },
  bd: {
    titulo: 'Buscar no banco',
    texto:
      'Acesso direto aos produtos, sem passar pelo agente de IA. Busque por nome, modelo ou SKU e receba o resultado na hora.',
    acao: 'Buscar direto',
  },
  cat: {
    titulo: 'Navegar por categoria',
    texto:
      'Todo o catálogo organizado por categoria. Entre numa e filtre por fabricante ou ordene por preço.',
    acao: 'Ver categorias',
  },
}

export function AccessCard({
  kind,
  ativo,
  onClick,
  href,
}: {
  kind: AccessKind
  ativo: boolean
  onClick?: () => void
  href?: string
}) {
  const c = CONTEUDO[kind]
  const conteudo = (
    <>
      <div className="acc-glow" />
      <div className="acc-art">{ART[kind]}</div>
      <div className="acc-glyph">{GLYPHS[kind]}</div>
      <h3 className="acc-title">{c.titulo}</h3>
      <p className="acc-text">{c.texto}</p>
      <div className="acc-go">
        {c.acao} <span>→</span>
      </div>
    </>
  )

  if (href) {
    return (
      <Link to={href} className="acc">
        {conteudo}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={cn('acc', ativo && 'acc-on')}>
      {conteudo}
    </button>
  )
}
