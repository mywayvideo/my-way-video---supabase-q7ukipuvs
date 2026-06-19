import { useEffect, useState, useCallback } from 'react'
import {
  Users,
  ShoppingCart,
  DollarSign,
  TrendingDown,
  AlertCircle,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  BarChart3,
  Zap,
  Clock,
  Activity,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent } from '@/components/ui/chart'
import { supabase } from '@/lib/supabase/client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

const ROLE_NAMES = ['customer', 'vip', 'reseller', 'collaborator', 'admin']

const chartConfig = {
  total: { label: 'Receita', color: 'hsl(var(--primary))' },
  customer: { label: 'Customer', color: '#6b7280' },
  vip: { label: 'VIP', color: '#eab308' },
  reseller: { label: 'Reseller', color: '#3b82f6' },
  collaborator: { label: 'Collaborator', color: '#22c55e' },
  admin: { label: 'Admin', color: '#ef4444' },
}

export function DashboardAdminMetrics({ metrics, loadingMetrics, error, fetchMetrics }: any) {
  const [realtimeSessions, setRealtimeSessions] = useState<any[]>([])
  const [historyPeriod, setHistoryPeriod] = useState('7')
  const [historyRaw, setHistoryRaw] = useState<any[]>([])
  const [historyData, setHistoryData] = useState<any[]>([])
  const [loadingExtra, setLoadingExtra] = useState(true)
  const [extraError, setExtraError] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchMetrics()
  }, [fetchMetrics])

  const fetchActiveSessions = async () => {
    try {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .is('logout_timestamp', null)
        .gte('login_timestamp', fiveMinsAgo)

      if (error) throw error
      setRealtimeSessions(data || [])
    } catch (err) {
      console.error(err)
    }
  }

  const fetchHistory = async () => {
    try {
      setLoadingExtra(true)
      setExtraError(null)
      const days = parseInt(historyPeriod)
      const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('user_sessions')
        .select('login_timestamp, logout_timestamp, page_viewed, user_id')
        .gte('login_timestamp', periodStart)

      if (error) throw error

      setHistoryRaw(data || [])

      const grouped: Record<string, number> = {}
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        grouped[d.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })] = 0
      }

      data?.forEach((row) => {
        const d = new Date(row.login_timestamp).toLocaleDateString('pt-BR', {
          month: 'short',
          day: 'numeric',
        })
        if (grouped[d] !== undefined) {
          grouped[d]++
        }
      })

      setHistoryData(Object.entries(grouped).map(([date, count]) => ({ date, count })))
    } catch (err: any) {
      setExtraError('Não foi possível carregar dados. ' + err.message)
    } finally {
      setLoadingExtra(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [historyPeriod])

  useEffect(() => {
    fetchActiveSessions()
    const interval = setInterval(fetchActiveSessions, 5000)

    const channel = supabase
      .channel('realtime_sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_sessions' }, () => {
        fetchActiveSessions()
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          toast({
            title: 'Aviso de Conexão',
            description: 'Falha ao conectar tempo real. Tentando reconectar...',
            variant: 'destructive',
          })
        }
      })

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [toast])

  const totalOnline = realtimeSessions.length
  const authenticatedOnline = realtimeSessions.filter((s) => s.user_id).length
  const anonOnline = totalOnline - authenticatedOnline
  const visitingProducts = realtimeSessions.filter((s) =>
    s.page_viewed?.includes('/product'),
  ).length
  const inCheckout = realtimeSessions.filter(
    (s) => s.page_viewed?.includes('/checkout') || s.page_viewed?.includes('/cart'),
  ).length

  const completedSessions = historyRaw.filter((s) => s.logout_timestamp)
  let avgSessionMins = 0
  if (completedSessions.length > 0) {
    const totalMs = completedSessions.reduce(
      (acc, s) =>
        acc + (new Date(s.logout_timestamp).getTime() - new Date(s.login_timestamp).getTime()),
      0,
    )
    avgSessionMins = Math.round(totalMs / completedSessions.length / 60000)
  }

  const bounceRate =
    historyRaw.length > 0
      ? Math.round((historyRaw.filter((s) => !s.page_viewed).length / historyRaw.length) * 100)
      : 0

  const pageCounts = realtimeSessions.reduce((acc: Record<string, number>, s) => {
    if (s.page_viewed) {
      acc[s.page_viewed] = (acc[s.page_viewed] || 0) + 1
    }
    return acc
  }, {})
  let mostVisited = '-'
  let maxCount = 0
  Object.entries(pageCounts).forEach(([page, count]) => {
    if (count > maxCount) {
      mostVisited = page
      maxCount = count
    }
  })

  const totalHistoryAccesses = historyRaw.length
  const authenticatedHistory = historyRaw.filter((s) => s.user_id).length
  const anonHistory = totalHistoryAccesses - authenticatedHistory
  const dailyAverage = historyPeriod
    ? Math.round(totalHistoryAccesses / parseInt(historyPeriod))
    : 0

  let peakDay = '-'
  let peakValue = -1
  historyData.forEach((d) => {
    if (d.count > peakValue) {
      peakValue = d.count
      peakDay = d.date
    }
  })

  if (loadingMetrics)
    return (
      <div className="space-y-[24px] animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[120px] rounded-[12px] w-full bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:200%_100%] animate-shimmer"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[24px] mt-[24px]">
          <div className="h-[300px] rounded-[12px] w-full bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:200%_100%] animate-shimmer" />
          <div className="h-[300px] rounded-[12px] w-full bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:200%_100%] animate-shimmer" />
        </div>
      </div>
    )

  if (error)
    return (
      <div className="text-center py-[48px] px-[24px] animate-fade-in">
        <AlertCircle className="mx-auto text-[64px] h-[64px] w-[64px] text-gray-300 mb-[16px]" />
        <h3 className="text-[18px] font-semibold text-foreground mb-[8px]">
          Não foi possível carregar métricas.
        </h3>
        <p className="text-[14px] text-gray-500 mb-[24px]">{error}</p>
        <Button
          onClick={fetchMetrics}
          className="px-[24px] py-[10px] bg-yellow-500 text-black font-semibold rounded-[8px] hover:bg-yellow-600 hover:scale-105 transition-all duration-150"
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Tentar Novamente
        </Button>
      </div>
    )

  if (!metrics) return null

  const currentMonthName = new Date().toLocaleString('pt-BR', { month: 'long' })

  const pieData = ROLE_NAMES.map((role) => ({
    name: role,
    value: metrics.customersByRole[role] || 0,
  })).filter((d) => d.value > 0)

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#2d2d2d] text-white p-[8px_12px] rounded-[6px] text-[12px] shadow-lg border border-gray-700">
          <p className="font-semibold mb-1">{label || payload[0].name}</p>
          <p>{`${payload[0].name === label ? 'Vendas' : 'Quantidade'}: ${payload[0].value}`}</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-[24px] animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
        <MetricCard
          title="Total de Clientes"
          value={metrics.totalCustomers}
          subtext={`customer: ${metrics.customersByRole.customer || 0}, vip: ${metrics.customersByRole.vip || 0}, reseller: ${metrics.customersByRole.reseller || 0}, collab: ${metrics.customersByRole.collaborator || 0}`}
          icon={<Users className="w-12 h-12" />}
        />
        <MetricCard
          title="Total de Pedidos"
          value={metrics.totalOrders}
          subtext={`Mês de ${currentMonthName}`}
          icon={<ShoppingCart className="w-12 h-12" />}
        />
        <MetricCard
          title="Receita Total"
          value={`R$ ${metrics.totalRevenue.toFixed(2)}`}
          subtext={`Mês de ${currentMonthName}`}
          icon={<DollarSign className="w-12 h-12" />}
        />
        <MetricCard
          title="Descontos Aplicados"
          value={`R$ ${metrics.totalDiscounts.toFixed(2)}`}
          subtext="Total economizado pelos clientes"
          icon={<TrendingDown className="w-12 h-12" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[24px] mt-[24px]">
        <div className="bg-card rounded-[12px] p-[24px] shadow-[0_2px_8px_rgba(0,0,0,0.1)]">
          <h3 className="text-[16px] font-semibold text-foreground mb-[16px]">Clientes por Role</h3>
          <div className="h-[200px] md:h-[250px] lg:h-[300px]">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={chartConfig[entry.name as keyof typeof chartConfig]?.color}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <ChartLegend
                  content={<ChartLegendContent />}
                  className="text-[12px] text-gray-600 mt-[16px]"
                />
              </PieChart>
            </ChartContainer>
          </div>
        </div>

        <div className="bg-card rounded-[12px] p-[24px] shadow-[0_2px_8px_rgba(0,0,0,0.1)]">
          <h3 className="text-[16px] font-semibold text-foreground mb-[16px]">
            Vendas por Mês (últimos 12 meses)
          </h3>
          <div className="h-[200px] md:h-[250px] lg:h-[300px]">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <LineChart
                data={metrics.salesByMonth}
                margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={12}
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={12}
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v) => `R$${v}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="var(--color-total)"
                  strokeWidth={3}
                  dot={{ r: 4, fill: 'var(--color-total)', strokeWidth: 2 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ChartContainer>
          </div>
        </div>
      </div>

      <div className="space-y-[24px] mt-[24px]">
        <div className="bg-card rounded-[12px] p-[24px] shadow-[0_2px_8px_rgba(0,0,0,0.1)]">
          <div className="flex items-center justify-between mb-[16px]">
            <h3 className="text-[16px] font-semibold text-foreground flex items-center gap-2">
              Usuários Online Agora
              <span className="bg-green-500/20 text-green-500 text-[12px] px-[8px] py-[2px] rounded-full animate-pulse">
                {totalOnline} usuários
              </span>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[16px] mb-[24px]">
            <MetricCard
              title="Total Online"
              value={totalOnline}
              subtext={`Auth: ${authenticatedOnline} | Anon: ${anonOnline}`}
              icon={<Users className="w-8 h-8" />}
            />
            <MetricCard
              title="Visitando Produtos"
              value={visitingProducts}
              subtext="Páginas de produtos"
              icon={<ShoppingBag className="w-8 h-8" />}
            />
            <MetricCard
              title="No Checkout"
              value={inCheckout}
              subtext="Carrinho ou checkout"
              icon={<ShoppingCart className="w-8 h-8" />}
            />
          </div>

          <div className="flex flex-wrap gap-[24px] text-[14px] text-gray-400">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <span>
                Tempo Médio de Sessão:{' '}
                <strong className="text-foreground">{avgSessionMins} minutos</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span>
                Taxa de Rejeição: <strong className="text-foreground">{bounceRate}%</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-primary" />
              <span>
                Página Mais Visitada: <strong className="text-foreground">{mostVisited}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-[12px] p-[24px] shadow-[0_2px_8px_rgba(0,0,0,0.1)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-[24px] gap-4">
            <h3 className="text-[16px] font-semibold text-foreground">Histórico de Acessos</h3>
            <Select value={historyPeriod} onValueChange={setHistoryPeriod}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Selecione o período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loadingExtra ? (
            <div className="h-[300px] rounded-[12px] w-full bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:200%_100%] animate-shimmer" />
          ) : extraError ? (
            <div className="text-center py-8">
              <p className="text-red-500 mb-4">{extraError}</p>
              <Button onClick={fetchHistory} variant="outline">
                Tentar Novamente
              </Button>
            </div>
          ) : historyData.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              Nenhum acesso registrado neste período.
            </div>
          ) : (
            <div className="animate-fade-in">
              <div className="h-[300px] mb-[24px]">
                <ChartContainer
                  config={{ count: { label: 'Acessos', color: 'hsl(var(--primary))' } }}
                  className="h-full w-full"
                >
                  <LineChart data={historyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={12}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={12}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      strokeWidth={3}
                      dot={{ r: 4, fill: 'hsl(var(--primary))', strokeWidth: 2 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ChartContainer>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[16px]">
                <MetricCard
                  title="Total de Acessos"
                  value={totalHistoryAccesses}
                  subtext={`Auth: ${authenticatedHistory} | Anon: ${anonHistory}`}
                  icon={<TrendingUp className="w-8 h-8" />}
                />
                <MetricCard
                  title="Média Diária"
                  value={dailyAverage}
                  icon={<BarChart3 className="w-8 h-8" />}
                />
                <MetricCard
                  title="Pico de Acessos"
                  value={peakDay}
                  subtext={`${peakValue} acessos`}
                  icon={<Zap className="w-8 h-8" />}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricCard({ title, value, subtext, icon }: any) {
  return (
    <div className="bg-card rounded-[12px] shadow-[0_2px_8px_rgba(0,0,0,0.1)] p-[24px] hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:scale-[1.02] transition-all duration-200">
      <div className="flex items-start gap-4">
        <div className="text-yellow-500 w-[48px] h-[48px] flex-shrink-0 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <div className="text-[12px] text-gray-500 font-medium mb-[8px]">{title}</div>
          <div className="text-[32px] text-foreground font-bold leading-none">{value}</div>
          {subtext && (
            <div className="text-[11px] text-gray-400 mt-[8px] leading-[1.4]">{subtext}</div>
          )}
        </div>
      </div>
    </div>
  )
}
