import { AdminLayout } from '@/components/admin/AdminLayout'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Link } from 'react-router-dom'
import {
  Users,
  BarChart3,
  ShoppingCart,
  Brain,
  Package,
  DollarSign,
  Truck,
  Tag,
  Settings,
  Sparkles,
} from 'lucide-react'

export default function Admin() {
  const cards = [
    {
      title: 'Métricas e Relatórios',
      description: 'Acompanhe o desempenho de vendas e acessos em tempo real',
      icon: BarChart3,
      href: '/admin/metrics',
    },
    {
      title: 'Gerenciar Clientes',
      description: 'Administre a base de clientes, permissões e informações',
      icon: Users,
      href: '/admin/customers',
    },
    {
      title: 'Gerenciamento de Pedidos',
      description: 'Visualizar, aprovar e processar pedidos',
      icon: ShoppingCart,
      href: '/admin/orders',
    },
    {
      title: 'IA & Inteligência Artificial',
      description: 'Configurar agentes, prompts e provedores',
      icon: Brain,
      href: '/admin/ai',
    },
    {
      title: 'Catálogo & Produtos',
      description: 'Gerenciar produtos e categorias',
      icon: Package,
      href: '/admin/catalog',
    },
    {
      title: 'Preços & Câmbio',
      description: 'Ajustar regras de precificação e taxas',
      icon: DollarSign,
      href: '/admin/pricing',
    },
    {
      title: 'Fretes & Shipping',
      description: 'Configurar regras de entrega e UPS',
      icon: Truck,
      href: '/admin/shipping-config',
    },
    {
      title: 'Descontos & Promoções',
      description: 'Gerenciar cupons e regras de desconto',
      icon: Tag,
      href: '/admin/discounts',
    },
    {
      title: 'Configurações Globais',
      description: 'Ajustes gerais do sistema',
      icon: Settings,
      href: '/admin/settings',
    },
    {
      title: 'Market Intelligence',
      description: 'Alimente a IA com atualizações e novidades de mercado',
      icon: Sparkles,
      href: '/admin/nab-hub',
    },
  ]

  return (
    <AdminLayout breadcrumb="Dashboard">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard Admin</h1>
          <p className="text-muted-foreground mt-2">
            Bem-vindo ao painel de controle. Selecione um módulo abaixo para gerenciar.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((card) => (
            <Link key={card.href} to={card.href}>
              <Card className="hover:bg-muted/50 transition-colors h-full cursor-pointer group bg-card">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <card.icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl text-card-foreground">{card.title}</CardTitle>
                  <CardDescription className="text-base mt-2 text-muted-foreground">
                    {card.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AdminLayout>
  )
}
