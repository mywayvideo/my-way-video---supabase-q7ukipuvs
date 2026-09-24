import { useState } from 'react'
import { HardDrive, Globe, RefreshCw, CheckCircle2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { triggerManualImageRetryBatch } from '@/services/imageMetricsService'

interface ProductImageMetricsBannerProps {
  inStorage: number
  viaProxy: number
  storagePercent: number
  proxyPercent: number
  totalWithImages: number
  loading?: boolean
  onRefresh?: () => Promise<void> | void
}

export function ProductImageMetricsBanner({
  inStorage,
  viaProxy,
  storagePercent,
  proxyPercent,
  totalWithImages,
  loading = false,
  onRefresh,
}: ProductImageMetricsBannerProps) {
  const { toast } = useToast()
  const [isRetrying, setIsRetrying] = useState(false)

  const handleRunRetryBatch = async () => {
    setIsRetrying(true)
    try {
      const res = await triggerManualImageRetryBatch({ limit: 30, force: true })
      toast({
        title: 'Lote de re-tentativa concluído',
        description: `Processados: ${res.processed} · Convertidos: ${res.converted} · Falhas: ${res.failed} · Restantes: ${res.pendingTotal}`,
      })
      if (onRefresh) {
        await onRefresh()
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao executar re-tentativa',
        description: err?.message || 'Falha na comunicação com o servidor',
        variant: 'destructive',
      })
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <div className="bg-card/70 border border-border/60 rounded-xl p-4 shadow-sm backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Lado esquerdo: Título & Status */}
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-lg text-primary shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                Armazenamento de Imagens do Catálogo
              </span>
              <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                {totalWithImages.toLocaleString('pt-BR')} com imagem
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Job agendado diariamente entre 01h e 06h (Brasília) em lotes com backoff
            </p>
          </div>
        </div>

        {/* Lado direito: Métricas e Ação Manual */}
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          {/* Card Salvas no Storage */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <div className="text-xs">
              <span className="font-semibold">{inStorage.toLocaleString('pt-BR')}</span>{' '}
              <span className="opacity-90">salvas</span>{' '}
              <span className="font-mono opacity-80">
                ({storagePercent.toLocaleString('pt-BR')}%)
              </span>
            </div>
          </div>

          {/* Card Via Proxy */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
            <Globe className="w-4 h-4 shrink-0" />
            <div className="text-xs">
              <span className="font-semibold">{viaProxy.toLocaleString('pt-BR')}</span>{' '}
              <span className="opacity-90">via proxy</span>{' '}
              <span className="font-mono opacity-80">
                ({proxyPercent.toLocaleString('pt-BR')}%)
              </span>
            </div>
          </div>

          {/* Botão de Disparo Manual de Lote */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunRetryBatch}
            disabled={isRetrying || loading}
            className="h-8 text-xs border-border/70 hover:bg-muted/50"
            title="Disparar tentativa em lote (~30 produtos) agora"
          >
            {isRetrying ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                Disparar Lote Manual
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Barra de Progresso visual discreta */}
      <div className="mt-3 w-full bg-muted/60 rounded-full h-1.5 overflow-hidden flex">
        <div
          className="bg-emerald-500 transition-all duration-500 h-full"
          style={{ width: `${Math.min(100, Math.max(0, storagePercent))}%` }}
          title={`${inStorage} imagens salvas no Storage (${storagePercent}%)`}
        />
        <div
          className="bg-amber-500 transition-all duration-500 h-full"
          style={{ width: `${Math.min(100, Math.max(0, proxyPercent))}%` }}
          title={`${viaProxy} imagens ainda dependentes de proxy (${proxyPercent}%)`}
        />
      </div>
    </div>
  )
}
