import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PersonalInfoTab } from '@/components/Dashboard/PersonalInfoTab'
import { AddressTab } from '@/components/Dashboard/AddressTab'
import { SummaryTab } from '@/components/Dashboard/SummaryTab'
import { FavoritesTab } from '@/components/Dashboard/FavoritesTab'
import { OrderHistoryTab } from '@/components/Dashboard/OrderHistoryTab'
import { useCustomerDashboard } from '@/hooks/useCustomerDashboard'
import { customerService } from '@/services/customerService'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Link, useNavigate } from 'react-router-dom'
import { useUserRole } from '@/hooks/use-user-role'
import { supabase } from '@/lib/supabase/client'

import React from 'react'

class DashboardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error('Dashboard Render Error:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="container max-w-6xl mx-auto py-16 px-4 flex flex-col items-center justify-center text-center min-h-[50vh]">
          <AlertCircle className="w-16 h-16 text-destructive mb-4" />
          <h2 className="text-2xl font-bold mb-2">Erro ao carregar o painel</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            Ocorreu um problema inesperado ao exibir seus dados. Nossa equipe foi notificada.
          </p>
          <Button onClick={() => window.location.reload()}>Recarregar Página</Button>
        </div>
      )
    }
    return this.props.children
  }
}

function DashboardContent() {
  const { role, loading: roleLoading, error: roleError } = useUserRole()
  const navigate = useNavigate()

  useEffect(() => {
    if (!roleLoading && role) {
      if (role === 'admin' || role === 'collaborator') {
        navigate('/dashboard-admin', { replace: true })
      }
    }
  }, [role, roleLoading, navigate])

  const {
    user,
    activeTab,
    setActiveTab,
    orders,
    favorites,
    cart,
    discounts,
    loading,
    error,
    refresh,
  } = useCustomerDashboard()
  const [isEditingProfile, setIsEditingProfile] = useState(false)

  useEffect(() => {
    if (activeTab === 'carrinho') {
      setActiveTab('historico')
    }
  }, [activeTab, setActiveTab])

  if (roleLoading) {
    return (
      <div className="container max-w-6xl mx-auto py-16 px-4 flex flex-col items-center justify-center min-h-[50vh]">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Verificando acesso...</p>
      </div>
    )
  }

  if (roleError) {
    return (
      <div className="container max-w-6xl mx-auto py-16 px-4 flex flex-col items-center justify-center text-center min-h-[50vh]">
        <AlertCircle className="w-16 h-16 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2">Ops! Algo deu errado.</h2>
        <p className="text-muted-foreground mb-6 max-w-md">{roleError}</p>
        <Button onClick={() => window.location.reload()}>Tentar Novamente</Button>
      </div>
    )
  }

  if (role === 'admin' || role === 'collaborator') {
    return null
  }

  if (loading && !user) {
    return (
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32 mb-8" />
        <Skeleton className="h-12 w-full mb-8" />
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    )
  }

  if (error && !user) {
    if (error === 'NOT_LOGGED_IN') {
      return (
        <div className="container max-w-6xl mx-auto py-16 px-4 flex flex-col items-center justify-center text-center min-h-[50vh]">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Redirecionando para login...</p>
        </div>
      )
    }

    if (error === 'PGRST116') {
      return (
        <div className="container max-w-6xl mx-auto py-16 px-4 flex flex-col items-center justify-center text-center min-h-[50vh]">
          <AlertCircle className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">Nenhum dado encontrado</h2>
          <Button
            onClick={async () => {
              await supabase.rpc('sync_current_user_profile')
              refresh()
            }}
            variant="outline"
          >
            Sincronizar e Atualizar
          </Button>
        </div>
      )
    }

    let errorMessage = error
    if (error === '403') {
      errorMessage = 'Voce nao tem permissao para acessar estes dados.'
    }

    return (
      <div className="container max-w-6xl mx-auto py-16 px-4 flex flex-col items-center justify-center text-center min-h-[50vh]">
        <AlertCircle className="w-16 h-16 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2">Ops! Algo deu errado.</h2>
        <p className="text-muted-foreground mb-6 max-w-md">{errorMessage}</p>
        <Button onClick={refresh}>Tentar Novamente</Button>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container max-w-6xl mx-auto py-16 px-4 flex flex-col items-center justify-center text-center min-h-[50vh]">
        <AlertCircle className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">Usuário não identificado</h2>
        <p className="text-muted-foreground mb-6 max-w-md">
          Não foi possível carregar seu perfil. Tente atualizar a página.
        </p>
        <Button onClick={refresh} variant="outline">
          Atualizar
        </Button>
      </div>
    )
  }

  const firstName = user.full_name?.split(' ')[0] || 'Cliente'
  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const handleProfileSave = async (data: any) => {
    try {
      await customerService.updateCustomerData(user.id, data)
      toast.success('Dados atualizados com sucesso!')
      setIsEditingProfile(false)
      refresh()
    } catch (e) {
      toast.error('Erro ao atualizar dados. Tente novamente.')
    }
  }

  return (
    <div className="container max-w-6xl mx-auto py-6 md:py-8 px-4 md:px-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-start gap-4">
          <Link to="/" className="text-muted-foreground hover:text-primary transition-colors mt-2">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Meu Dashboard</h1>
            <p className="text-muted-foreground capitalize mt-1">{today}</p>
            <p className="text-lg mt-2 text-foreground">
              Olá, <span className="font-semibold text-primary">{firstName}</span>!
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md pt-4 pb-0 mb-8">
          <div className="relative">
            {/* Linha base das abas na cor primária */}
            <div className="absolute bottom-0 left-0 w-full h-3 bg-[#f97316] rounded-full z-0"></div>

            <TabsList className="relative z-10 flex w-full h-auto gap-1 sm:gap-2 bg-transparent p-0 px-2 sm:px-4 overflow-x-auto justify-start hide-scrollbar">
              {[
                { id: 'resumo', label: 'Resumo' },
                { id: 'pessoal', label: 'Dados Pessoais' },
                { id: 'cobranca', label: 'Endereço de Cobrança' },
                { id: 'entrega', label: 'Endereço de Entrega' },
                { id: 'favoritos', label: 'Favoritos' },
                { id: 'historico', label: 'Histórico de Compras' },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="relative px-4 py-2.5 font-bold uppercase tracking-wider text-xs sm:text-sm whitespace-nowrap transition-all duration-200 rounded-t-xl rounded-b-none border-0 outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:bg-[#f97316] data-[state=active]:text-white data-[state=inactive]:bg-muted data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-orange-100 data-[state=inactive]:hover:text-[#f97316] shadow-[0_-2px_4px_rgba(0,0,0,0.05)] data-[state=inactive]:shadow-none"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        <div className="min-h-[400px]">
          <TabsContent value="resumo" className="m-0 focus-visible:outline-none">
            {loading ? (
              <Skeleton className="h-[400px] w-full" />
            ) : (
              <SummaryTab orders={orders} discounts={discounts} />
            )}
          </TabsContent>

          <TabsContent value="pessoal" className="m-0 focus-visible:outline-none max-w-4xl mx-auto">
            <PersonalInfoTab
              customer={user}
              onSave={handleProfileSave}
              isEditing={isEditingProfile}
              setEditing={setIsEditingProfile}
            />
          </TabsContent>

          <TabsContent
            value="cobranca"
            className="m-0 focus-visible:outline-none max-w-4xl mx-auto"
          >
            <AddressTab customerId={user.id} type="billing" />
          </TabsContent>

          <TabsContent value="entrega" className="m-0 focus-visible:outline-none max-w-4xl mx-auto">
            <AddressTab customerId={user.id} type="shipping" />
          </TabsContent>

          <TabsContent value="favoritos" className="m-0 focus-visible:outline-none">
            {loading ? (
              <Skeleton className="h-[400px] w-full" />
            ) : (
              <FavoritesTab customerId={user.id} onRefresh={refresh} />
            )}
          </TabsContent>

          <TabsContent value="historico" className="m-0 focus-visible:outline-none">
            {loading ? (
              <Skeleton className="h-[400px] w-full" />
            ) : (
              <OrderHistoryTab orders={orders} customerId={user.id} onRefresh={refresh} />
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

export default function Dashboard() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    const timer = setTimeout(() => {
      window.scrollTo(0, 0)
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <DashboardErrorBoundary>
      <DashboardContent />
    </DashboardErrorBoundary>
  )
}
