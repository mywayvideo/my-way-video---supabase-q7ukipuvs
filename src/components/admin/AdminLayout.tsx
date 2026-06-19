import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Brain,
  Package,
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
} from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useAuthContext } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { useSidebarVisibility } from '@/hooks/use-sidebar-state'

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Gerenciamento de Pedidos', href: '/admin/orders', icon: ShoppingCart },
  { name: 'Gerenciar Clientes', href: '/admin/customers', icon: Users },
  { name: 'Métricas e Relatórios', href: '/admin/metrics', icon: BarChart3 },
  { name: 'IA & Inteligência Artificial', href: '/admin/ai', icon: Brain },
  { name: 'Catálogo & Produtos', href: '/admin/catalog', icon: Package },
  { name: 'Cache de Produtos', href: '/admin/product-cache', icon: Database },
  { name: 'Dicionário AVPRO', href: '/admin/avpro-keywords', icon: BookOpen },
  { name: 'Market Intelligence', href: '/admin/nab-hub', icon: Sparkles },
  { name: 'Preços & Câmbio', href: '/admin/pricing', icon: DollarSign },
  { name: 'Fretes & Shipping', href: '/admin/shipping-config', icon: Truck },
  { name: 'Descontos & Promoções', href: '/admin/discounts', icon: Tag },
  { name: 'Configurações Globais', href: '/admin/settings', icon: Settings },
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
  const { isSidebarVisible, toggleSidebar } = useSidebarVisibility()

  const NavLinks = () => (
    <div className="flex flex-col gap-2">
      {navigation.map((item) => {
        const isActive =
          location.pathname === item.href ||
          (item.href !== '/admin' && location.pathname.startsWith(item.href))
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
