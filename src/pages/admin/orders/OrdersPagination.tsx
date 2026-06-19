import { Button } from '@/components/ui/button'
import { GetOrdersFilters } from '@/services/adminOrdersService'

export default function OrdersPagination({
  filters,
  setFilters,
  total,
}: {
  filters: GetOrdersFilters
  setFilters: (f: GetOrdersFilters) => void
  total: number
}) {
  const page = filters.page || 1
  const limit = filters.limit || 10
  const totalPages = Math.ceil(total / limit)

  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between border-t pt-4">
      <span className="text-sm text-muted-foreground">
        Página {page} de {totalPages}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 1}
          onClick={() => setFilters({ ...filters, page: page - 1 })}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page === totalPages}
          onClick={() => setFilters({ ...filters, page: page + 1 })}
        >
          Próxima
        </Button>
      </div>
    </div>
  )
}
