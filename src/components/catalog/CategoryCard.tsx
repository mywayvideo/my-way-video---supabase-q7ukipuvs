import { Link } from 'react-router-dom'

export interface CategoryCardData {
  id: string
  name: string
  productCount: number
}

/** Formas geométricas de fundo — variam por card, sem depender de foto. */
const SHAPES = [
  <svg viewBox="0 0 100 100" key="c">
    <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="1.4" fill="none" />
  </svg>,
  <svg viewBox="0 0 100 100" key="s">
    <rect
      x="12"
      y="12"
      width="76"
      height="76"
      rx="10"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="none"
    />
  </svg>,
  <svg viewBox="0 0 100 100" key="t">
    <path d="M50 8 92 88H8Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
  </svg>,
  <svg viewBox="0 0 100 100" key="d">
    <path d="M50 8 92 50 50 92 8 50Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
  </svg>,
  <svg viewBox="0 0 100 100" key="r">
    <circle
      cx="50"
      cy="50"
      r="42"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeDasharray="4 6"
      fill="none"
    />
    <circle cx="50" cy="50" r="20" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>,
  <svg viewBox="0 0 100 100" key="x">
    <path d="M8 50h84M50 8v84" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="50" cy="50" r="16" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>,
]

/**
 * Card de categoria: texto + arte geométrica, SEM foto de produto.
 * Mostra só nome e quantidade — fabricante fica no filtro, dentro da categoria.
 */
export function CategoryCard({
  category,
  index,
  maxCount,
}: {
  category: CategoryCardData
  index: number
  maxCount: number
}) {
  const pct = maxCount > 0 ? Math.round((100 * category.productCount) / maxCount) : 0
  const shape = SHAPES[index % SHAPES.length]

  return (
    <Link to={`/categoria/${category.id}`} className="cat-card">
      <div className="cat-shape">{shape}</div>
      <div className="cat-name">{category.name}</div>
      <div className="cat-foot">
        <div className="cat-count">{category.productCount.toLocaleString('pt-BR')} itens</div>
        <div className="cat-arrow">→</div>
      </div>
      <div className="cat-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
    </Link>
  )
}
