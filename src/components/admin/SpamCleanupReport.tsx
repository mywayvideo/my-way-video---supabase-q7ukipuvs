import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ShieldCheck, AlertTriangle, Trash2, CheckCircle2, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { runSpamCleanup, type SpamCleanupResult } from '@/services/spamCleanupService'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export function SpamCleanupReport() {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<SpamCleanupResult | null>(null)
  const { toast } = useToast()

  const handleCleanup = async () => {
    setIsLoading(true)
    try {
      const res = await runSpamCleanup()
      setResult(res)
      toast({
        title: 'Limpeza concluída',
        description: `${res.spam_removed} registro(s) movido(s) para staging.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao executar limpeza.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Limpeza de Spam
        </CardTitle>
        <CardDescription>
          Identifica e remove perfis suspeitos da base de clientes. Os registros removidos são
          movidos para a tabela de staging com o motivo da remoção.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border bg-red-500/5 p-4 text-center">
              <Trash2 className="w-6 h-6 mx-auto text-red-500 mb-2" />
              <div className="text-2xl font-bold text-red-600">{result.spam_removed}</div>
              <div className="text-xs text-muted-foreground mt-1">Transferidos para Staging</div>
            </div>
            <div className="rounded-lg border bg-green-500/5 p-4 text-center">
              <CheckCircle2 className="w-6 h-6 mx-auto text-green-500 mb-2" />
              <div className="text-2xl font-bold text-green-600">{result.kept}</div>
              <div className="text-xs text-muted-foreground mt-1">Mantidos na Base</div>
            </div>
            <div className="rounded-lg border bg-blue-500/5 p-4 text-center">
              <AlertTriangle className="w-6 h-6 mx-auto text-blue-500 mb-2" />
              <div className="text-2xl font-bold text-blue-600">{result.total_processed}</div>
              <div className="text-xs text-muted-foreground mt-1">Total Processados</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma limpeza executada ainda. Clique no botão abaixo para iniciar.
          </div>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isLoading} className="w-full sm:w-auto">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Executar Limpeza de Spam
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar limpeza de spam</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação irá analisar todos os clientes, mover registros suspeitos para a tabela de
                staging e removê-los da base principal. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCleanup}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Confirmar Limpeza
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
