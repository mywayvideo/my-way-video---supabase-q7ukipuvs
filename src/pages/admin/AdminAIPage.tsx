import { useState, useEffect } from 'react'
import { Navigate, Link, useLocation } from 'react-router-dom'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Loader2, Bot } from 'lucide-react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { cn } from '@/lib/utils'

export default function AdminAIPage() {
  const { currentUser: user, loading: authLoading } = useAuthContext()
  const location = useLocation()

  const [companyInfo, setCompanyInfo] = useState<any>(null)
  const [footerInfo, setFooterInfo] = useState<any>(null)
  const [savingInfo, setSavingInfo] = useState(false)

  useEffect(() => {
    if (user) fetchCompanyInfo()
  }, [user])

  const fetchCompanyInfo = async () => {
    const { data: cData } = await supabase.from('company_info').select('*')

    if (cData) {
      setFooterInfo(
        cData.find((c: any) => c.type === 'footer_about') || { type: 'footer_about', content: '' },
      )
      setCompanyInfo(
        cData.find((c: any) => c.type === 'ai_knowledge') || { type: 'ai_knowledge', content: '' },
      )
    } else {
      setCompanyInfo({ type: 'ai_knowledge', content: '' })
    }
  }

  const handleSaveCompanyInfo = async () => {
    setSavingInfo(true)

    try {
      // Save context info to company_info
      if (companyInfo.id) {
        const { error } = await supabase
          .from('company_info')
          .update({ content: companyInfo.content, updated_at: new Date().toISOString() })
          .eq('id', companyInfo.id)
          .select()
          .single()
        if (error) throw error
      } else if (companyInfo.content) {
        const { error } = await supabase
          .from('company_info')
          .insert([{ type: 'ai_knowledge', content: companyInfo.content }])
          .select()
          .single()
        if (error) throw error
      }

      // Save footer info to company_info
      if (footerInfo.id) {
        const { error } = await supabase
          .from('company_info')
          .update({ content: footerInfo.content, updated_at: new Date().toISOString() })
          .eq('id', footerInfo.id)
          .select()
          .single()
        if (error) throw error
      } else if (footerInfo.content) {
        const { error } = await supabase
          .from('company_info')
          .insert([{ type: footerInfo.type, content: footerInfo.content }])
          .select()
          .single()
        if (error) throw error
      }

      toast({ title: 'Salvo', description: 'Informações atualizadas com sucesso.' })
      await fetchCompanyInfo()
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao salvar',
        description: err.message || 'Falha de comunicação com o banco.',
        variant: 'destructive',
      })
    } finally {
      setSavingInfo(false)
    }
  }

  if (authLoading)
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin w-6 h-6 text-muted-foreground" />
      </div>
    )
  if (!user) return <Navigate to="/login" replace />

  const tabs = [
    { name: 'Contexto Institucional', href: '/admin/ai' },
    { name: 'Provedores', href: '/admin/ai-providers' },
    { name: 'Configurações Globais', href: '/admin/ai-settings' },
    { name: 'Cache de Produtos', href: '/admin/product-cache' },
    { name: 'Dicionário AVPRO', href: '/admin/avpro-keywords' },
  ]

  return (
    <AdminLayout breadcrumb="IA & Inteligência Artificial">
      <div className="max-w-5xl space-y-6 animate-fade-in">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-3 text-foreground">
            <div className="bg-primary/10 p-2 rounded-lg text-primary">
              <Bot className="w-6 h-6" />
            </div>
            IA & Inteligência Artificial
          </h1>
          <p className="text-muted-foreground mt-2">
            Gerencie os agentes de IA, provedores e a base de conhecimento.
          </p>
        </div>

        <div className="flex overflow-x-auto pb-2 mb-6 border-b border-border/50 gap-2">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={tab.href}
              className={cn(
                'px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 rounded-t-lg',
                location.pathname === tab.href
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border/50 hover:bg-muted/50',
              )}
            >
              {tab.name}
            </Link>
          ))}
        </div>

        <Card className="border-border/50 shadow-sm bg-card">
          <CardHeader>
            <CardTitle>Treinamento da IA & Institucional</CardTitle>
            <CardDescription>
              Defina o contexto institucional e regras logísticas que o agente de IA utilizará e as
              informações do rodapé.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-base text-foreground">
                Contexto Institucional (Regras Logísticas)
              </Label>
              <Textarea
                className="min-h-[150px] bg-background/50 font-mono text-sm focus-visible:ring-primary/50"
                value={companyInfo?.content || ''}
                onChange={(e) => setCompanyInfo((p: any) => ({ ...p, content: e.target.value }))}
                placeholder="Insira as diretrizes e o conhecimento da empresa para o agente de IA..."
              />
            </div>
            <div className="space-y-2">
              <Label className="text-base text-foreground mt-4">Sobre a Empresa (Rodapé)</Label>
              <Textarea
                className="min-h-[100px] bg-background/50 text-sm focus-visible:ring-primary/50"
                value={footerInfo?.content || ''}
                onChange={(e) => setFooterInfo((p: any) => ({ ...p, content: e.target.value }))}
                placeholder="Insira o texto que aparecerá na seção 'Sobre' do rodapé..."
              />
            </div>
            <div className="flex justify-end pt-4">
              <Button
                onClick={handleSaveCompanyInfo}
                disabled={savingInfo}
                className="w-full sm:w-auto shadow-sm"
              >
                {savingInfo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {savingInfo ? 'Salvando...' : 'Atualizar Base de Conhecimento'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
