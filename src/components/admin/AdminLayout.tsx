import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Brain,
  Package,
  RefreshCw,
  DollarSign,
  Truck,
  Tag,
  Settings,
  Menu,
  ChevronRight,
  User,
  ShoppingCart,
  Users,
  BarChart3,
  Sparkles,
  Database,
  BookOpen,
  Search,
  CreditCard,
  CheckCircle2,
} from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useAuthContext } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { useSidebarVisibility } from '@/hooks/use-sidebar-state'
import { useUserRole, type UserRole } from '@/hooks/use-user-role'

/**
 * Menu do painel administrativo, com o papel exigido por item.
 *
 * `roles` lista quem PODE ver o item. A ausência cai em ['admin'], que é o
 * padrão histórico. Isso evita o problema de o gestor de catálogo ver telas
 * (pedidos, clientes, pagamentos) cujo conteúdo o banco vai recusar.
 *
 * Perfis:
 *   admin           — vê tudo
 *   reviewer        — vê categorias (sua função)
 *   catalog_manager — vê catálogo, importação, B&H, preços, NCM, duplicidades
 */
type NavItem = {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  roles?: UserRole[]
}

const ADMIN: UserRole[] = ['admin']
const CATALOG: UserRole[] = ['admin', 'catalog_manager']
const REVIEW: UserRole[] = ['admin', 'reviewer']
const STAFF: UserRole[] = ['admin', 'reviewer', 'catalog_manager']

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard, roles: ADMIN },
  { name: 'Gerenciamento de Pedidos', href: '/admin/orders', icon: ShoppingCart, roles: ADMIN },
  { name: 'Gerenciar Clientes', href: '/admin/customers', icon: Users, roles: ADMIN },
  { name: 'Métricas e Relatórios', href: '/admin/metrics', icon: BarChart3, roles: ADMIN },
  { name: 'IA & Inteligência Artificial', href: '/admin/ai', icon: Brain, roles: ADMIN },
  { name: 'Testador de Busca', href: '/admin/search-test', icon: Search, roles: ADMIN },
  { name: 'Catálogo & Produtos', href: '/admin/catalog', icon: Package, roles: CATALOG },
  { name: 'Importação ScanSource', href: '/admin/scansource', icon: DollarSign, roles: ADMIN },
  {
    name: 'Revisão de Importação',
    href: '/admin/import-review',
    icon: CheckCircle2,
    roles: CATALOG,
  },
  { name: 'Gerenciar Categorias', href: '/admin/categories', icon: Tag, roles: REVIEW },
  {
    name: 'Central de Duplicidades',
    href: '/admin/sku-standardization',
    icon: Sparkles,
    roles: CATALOG,
  },
  { name: 'Atualização B&H', href: '/admin/bh-update', icon: RefreshCw, roles: CATALOG },
  { name: 'Verificação de Preços', href: '/admin/price-checks', icon: RefreshCw, roles: CATALOG },
  { name: 'Regras Relacionados', href: '/admin/related-rules', icon: Sparkles, roles: ADMIN },
  {
    name: 'Revisão Relacionados',
    href: '/admin/related-review',
    icon: CheckCircle2,
    roles: CATALOG,
  },
  { name: 'Tabela de Apoio NCM', href: '/admin/ncm-support', icon: BookOpen, roles: STAFF },
  { name: 'Cache de Produtos', href: '/admin/product-cache', icon: Database, roles: ADMIN },
  { name: 'Dicionário AVPRO', href: '/admin/avpro-keywords', icon: Sparkles, roles: ADMIN },
  { name: 'Market Intelligence', href: '/admin/nab-hub', icon: Sparkles, roles: ADMIN },
  { name: 'Preços & Câmbio', href: '/admin/pricing', icon: DollarSign, roles: ADMIN },
  { name: 'Fretes & Shipping', href: '/admin/shipping-config', icon: Truck, roles: ADMIN },
  { name: 'Descontos & Promoções', href: '/admin/discounts', icon: Tag, roles: ADMIN },
  { name: 'Configurar Pagamentos', href: '/admin/payment-config', icon: CreditCard, roles: ADMIN },
  { name: 'Configurações Globais', href: '/admin/settings', icon: Settings, roles: ADMIN },
]
export function AdminLayout({
  children,
  breadcrumb,
}: {
  children: React.ReactNode
  breadcrumb?: string
}) {
  const { currentUser: user } = useAuthContext()
  const location = useLocation()
  const { role } = useUserRole()
  const { isSidebarVisible, toggleSidebar } = useSidebarVisibility()

  // Só os itens que o papel do usuário pode acessar. Enquanto o papel carrega,
  // a lista sai vazia (o banco continua sendo a barreira real).
  const visibleNavigation = navigation.filter((item) => (item.roles ?? ADMIN).includes(role))

  const NavLinks = () => (
    <div className="flex flex-col gap-2">
      {visibleNavigation.map((item) => {
        const isActive =
          location.pathname === item.href ||
          (item.href !== '/admin' && location.pathname.startsWith(item.href)) ||
          (item.href === '/admin' &&
            (location.pathname === '/dashboard-admin' || location.pathname === '/admin/dashboard'))
        return (
          <Link
            key={item.name}
            to={item.href}
            onClick={() => {
              if (window.innerWidth < 768 && isSidebarVisible) {
                toggleSidebar()
              }
            }}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
              isActive
                ? 'bg-primary/20 text-primary font-medium'
                : 'hover:bg-primary/10 text-muted-foreground hover:text-foreground',
            )}
          >
            <item.icon className="w-5 h-5 shrink-0" />
            <span className="truncate">{item.name}</span>
          </Link>
        )
      })}
    </div>
  )

  const UserProfile = () => (
    <div className="p-4 border-t border-border/50 shrink-0">
      <Link
        to="/admin/profile"
        onClick={() => {
          if (window.innerWidth < 768 && isSidebarVisible) {
            toggleSidebar()
          }
        }}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-primary/10',
          location.pathname === '/admin/profile' && 'bg-primary/20',
        )}
      >
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
          <User className="w-4 h-4" />
        </div>
        <div className="flex flex-col min-w-0 text-left">
          <span className="text-sm font-medium leading-none truncate text-foreground hover:text-primary transition-colors">
            {user?.user_metadata?.name || 'Admin'}
          </span>
          <span className="text-xs text-muted-foreground mt-1 truncate">{user?.email}</span>
        </div>
      </Link>
    </div>
  )

  return (
    <div className="flex w-full min-h-screen bg-background overflow-hidden relative">
      {/* Fixed Toggle Button */}
      <button
        onClick={toggleSidebar}
        className="fixed top-3 left-3 z-50 w-[44px] h-[44px] flex items-center justify-center rounded hover:bg-secondary transition-colors"
        aria-label="Toggle Sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-border/50 bg-card shrink-0 overflow-hidden',
          isSidebarVisible
            ? 'w-[280px] opacity-100 pointer-events-auto'
            : 'w-0 opacity-0 pointer-events-none border-r-0',
        )}
      >
        <div className="w-[280px] flex flex-col h-screen">
          <div className="h-16 flex items-center gap-3 border-b border-border/50 pl-16 pr-4 shrink-0">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center shrink-0">
              <LayoutDashboard className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl tracking-tight truncate">Admin Panel</span>
          </div>
          <div className="flex-1 px-4 py-6 overflow-y-auto">
            <NavLinks />
          </div>
          <UserProfile />
        </div>
      </aside>

      {/* Mobile Sidebar (Sheet) */}
      <div className="md:hidden">
        <Sheet
          open={isSidebarVisible}
          onOpenChange={(open) => {
            if (open !== isSidebarVisible) toggleSidebar()
          }}
        >
          <SheetContent side="left" className="w-[280px] p-0 flex flex-col border-r-border/50">
            <SheetTitle className="sr-only">Menu de Navegação</SheetTitle>
            <div className="h-16 flex items-center gap-3 border-b border-border/50 pl-16 pr-4 shrink-0">
              <div className="w-8 h-8 rounded bg-primary flex items-center justify-center shrink-0">
                <LayoutDashboard className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-xl tracking-tight truncate">Admin Panel</span>
            </div>
            <div className="flex-1 px-4 py-6 overflow-y-auto">
              <NavLinks />
            </div>
            <UserProfile />
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <header className="h-16 border-b border-border/50 bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 sticky top-0 z-10 shrink-0">
          <div
            className={cn('flex items-center gap-4', isSidebarVisible ? 'md:pl-0 pl-14' : 'pl-14')}
          >
            <div className="flex items-center text-sm font-medium text-muted-foreground">
              <Link to="/admin" className="hover:text-foreground transition-colors hidden sm:block">
                Admin
              </Link>
              <span className="sm:hidden">Admin</span>
              {breadcrumb && (
                <>
                  <ChevronRight className="w-4 h-4 mx-1 opacity-50 shrink-0" />
                  <span className="text-foreground truncate max-w-[200px] sm:max-w-none">
                    {breadcrumb}
                  </span>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 p-4 md:p-8 overflow-x-hidden">{children}</div>
      </main>
    </div>
  )
}
