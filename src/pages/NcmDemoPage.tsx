import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  FileCode,
  Layers,
  ArrowRight,
  ExternalLink,
  Code2,
  Copy,
  Check,
  RotateCcw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import {
  NcmSelectionExample,
  type NcmSelectionData,
  type NcmSelectionConfirmedPayload,
  formatNcmCode,
} from '@/components/NcmSelectionExample'

/**
 * Caso de Teste Real Sony RM-IP500:
 * Usado tanto para preenchimento rápido quanto para mockagem realista sem chamada à IA.
 */
const RM_IP500_EXAMPLE = {
  productId: 'da9abc07-91ba-4478-b927-51a41ca9f0ff',
  description:
    'Controlador remoto Sony RM-IP500 para câmeras PTZ (BRC-X1000/1, BRC-H800/1, BRC-H900, SRG-360SHE). Joystick de pan/tilt/zoom com regulagem de velocidade, controle de até 100 câmeras via IP, conexão RJ-45 LAN, RS-422, botões de preset e ajuste de imagem.',
  brand: 'Sony',
  model: 'RM-IP500',
  additionalSpecs:
    'Acessório dependente dedicado a comando remoto de câmeras robóticas PTZ. Não realiza processamento de vídeo de forma autônoma.',
  topN: 15,
}

/**
 * Dados Mockados Ultra-Realistas do Caso RM-IP500
 * Permite que a equipe externa teste a UI instantaneamente sem gastar tokens ou aguardar 60s.
 */
export const MOCK_RM_IP500_RESPONSE: NcmSelectionData = {
  success: true,
  audit_id: 'a7c92b41-5e82-4198-bc91-3847291fa20e',
  version: '3.7.0-build.613',
  analyst_model: 'gpt-4o-mini',
  auditor_model: 'deepseek-chat',
  model_used: 'gpt-4o-mini + deepseek-chat',
  execution_time_ms: 38450,
  candidates_count: 15,
  confidence: 'alta',
  sufficient_info: true,
  product_understanding: {
    identity: 'Controlador remoto IP com joystick para câmeras robóticas PTZ',
    product_nature: 'acessório dependente',
    essential_function: 'Comando e teleguiamento de posicionamento e zoom de câmeras robóticas PTZ',
    technical_features: [
      'Controle de até 100 câmeras via IP',
      'Joystick 3 eixos pan/tilt/zoom',
      'Interface RJ-45 e RS-422',
      'Acessório dedicado sem função autônoma independente',
    ],
    target_machines: ['câmeras PTZ', 'BRC-X1000', 'BRC-H800', 'SRG-360SHE'],
    canonical_statement:
      'Controlador remoto com joystick para até 100 câmeras PTZ via IP, atuando como acessório reconhecível destinado exclusivamente a aparelhos das posições 85.25 a 85.28.',
    coherent_with_description: true,
  },
  recommendation: {
    ncm: '85299090',
    ex: '',
    description:
      'Partes e acessórios reconhecíveis como destinados, exclusiva ou principalmente, aos aparelhos das posições 85.24 a 85.28 - Outras',
    ii: 16.0,
    ipi: 6.5,
    pis: 2.1,
    cofins: 9.65,
    total_tax: 34.25,
    has_ex_tarifario: false,
    justification: `ENQUADRAMENTO FISCAL DEFINITIVO:
1. RGI 1 e Nota 2(b) do Capítulo 85 da Nomenclatura Comum do Mercosul:
O equipamento Sony RM-IP500 é um dispositivo de comando remoto dedicado ao controle de câmeras robóticas de televisão e estúdio (classificadas na posição 85.25).

2. Aplicação da Regra de Partes e Acessórios:
Não possuindo função autônoma independente nem constituindo máquina com função própria de 85.43, sua destinação unívoca o vincula como acessório aos aparelhos de captura de imagem (85.25), enquadrando-se com precisão na subposição 8529.90.90.

3. Alíquotas Vigentes (Receita Federal / imp_sim_tax_rates_effective):
• Imposto de Importação (II): 16,0%
• IPI: 6,5%
• PIS: 2,1%
• COFINS: 9,65%
• Carga Tributária Total Estimada: 34,25%`,
  },
  alternatives: [
    {
      ncm: '85437099',
      ex: '',
      description:
        'Outras máquinas e aparelhos elétricos com função própria, não especificados nem compreendidos noutras posições do Capítulo 85',
      ii: 10.8,
      ipi: 6.5,
      pis: 2.1,
      cofins: 9.65,
      total_tax: 29.05,
      has_ex_tarifario: false,
      alternatives_source: 'promovido da varredura de candidatos',
      reason:
        'Posição residual subsidiária para aparelhos com função própria. Como o RM-IP500 é acessório dependente de câmeras da posição 85.25, a Nota 2(b) do Cap. 85 confere precedência obrigatória à posição 85.29, rebaixando 8543.70.99 a alternativa residual.',
    },
    {
      ncm: '90319090',
      ex: '',
      description:
        'Instrumentos, aparelhos e máquinas de medida ou controle, não especificados nem compreendidos noutras posições do Capítulo 90 - Partes e acessórios',
      ii: 14.4,
      ipi: 0.0,
      pis: 2.1,
      cofins: 9.65,
      total_tax: 26.15,
      has_ex_tarifario: false,
      alternatives_source: 'citado pela IA',
      reason:
        'Aparelho atua como controlador de acionamento eletrônico de vídeo, não constituindo instrumento de metrologia, verificação ou ensaio de grandezas geométricas do Capítulo 90.',
    },
  ],
  web_sources: [
    {
      title: 'Sony Professional - RM-IP500 PTZ Camera Remote Controller Manual',
      url: 'https://pro.sony/en_BR/products/ptz-network-cameras/rm-ip500',
      snippet:
        'PTZ camera remote controller with pan/tilt/zoom joystick control of up to 100 cameras over IP.',
    },
    {
      title: 'Tabela TIPI / NESH - Capítulo 85 (Máquinas, Aparelhos e Materiais Elétricos)',
      url: 'https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/classificacao-fiscal-de-mercadorias',
      snippet: 'Notas de Capítulo 85: Nota 2 (partes e acessórios). Posição 85.29 e 85.43.',
    },
  ],
}

export function NcmDemoPage() {
  const { toast } = useToast()

  // Estado do formulário
  const [description, setDescription] = useState(RM_IP500_EXAMPLE.description)
  const [brand, setBrand] = useState(RM_IP500_EXAMPLE.brand)
  const [model, setModel] = useState(RM_IP500_EXAMPLE.model)
  const [additionalSpecs, setAdditionalSpecs] = useState(RM_IP500_EXAMPLE.additionalSpecs)
  const [productId, setProductId] = useState(RM_IP500_EXAMPLE.productId)
  const [topN, setTopN] = useState<number>(RM_IP500_EXAMPLE.topN)

  // Toggle do modo Demo (Mock) vs Live (Edge Function)
  const [isDemoMode, setIsDemoMode] = useState(true)

  // Estados de execução
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [ncmResult, setNcmResult] = useState<NcmSelectionData | null>(MOCK_RM_IP500_RESPONSE)
  const [confirmedSelection, setConfirmedSelection] = useState<NcmSelectionConfirmedPayload | null>(
    null,
  )
  const [copiedCode, setCopiedCode] = useState(false)

  // Carregar dados de exemplo do RM-IP500
  const handleLoadExample = () => {
    setDescription(RM_IP500_EXAMPLE.description)
    setBrand(RM_IP500_EXAMPLE.brand)
    setModel(RM_IP500_EXAMPLE.model)
    setAdditionalSpecs(RM_IP500_EXAMPLE.additionalSpecs)
    setProductId(RM_IP500_EXAMPLE.productId)
    setTopN(RM_IP500_EXAMPLE.topN)
    setErrorMessage(null)
    setConfirmedSelection(null)
    if (isDemoMode) {
      setNcmResult(MOCK_RM_IP500_RESPONSE)
    }
    toast({
      title: 'Exemplo carregado',
      description: 'Dados reais do controlador Sony RM-IP500 preenchidos.',
    })
  }

  // Limpar formulário
  const handleClear = () => {
    setDescription('')
    setBrand('')
    setModel('')
    setAdditionalSpecs('')
    setProductId('')
    setErrorMessage(null)
    setNcmResult(null)
    setConfirmedSelection(null)
  }

  // Chamar Edge Function Real via supabase.functions.invoke
  const handleAnalyze = async () => {
    if (!description.trim()) {
      setErrorMessage('Por favor, informe a descrição do produto para iniciar a classificação.')
      return
    }

    setErrorMessage(null)
    setConfirmedSelection(null)

    // Se estiver em modo Demo, simula resposta imediata usando os dados mockados
    if (isDemoMode) {
      setIsLoading(true)
      setTimeout(() => {
        setIsLoading(false)
        setNcmResult(MOCK_RM_IP500_RESPONSE)
        toast({
          title: 'Classificação simulada (Modo Demo)',
          description: 'Resultado renderizado instantaneamente com dados mockados realistas.',
        })
      }, 500)
      return
    }

    // Modo REAL: invoca a edge function classify-ncm
    setIsLoading(true)
    try {
      const response = await supabase.functions.invoke('classify-ncm', {
        body: {
          product_description: description.trim(),
          brand: brand.trim() || undefined,
          model: model.trim() || undefined,
          additional_specs: additionalSpecs.trim() || undefined,
          product_id: productId.trim() || undefined,
          top_n: Number(topN) || 15,
          save_log: true,
        },
      })

      if (response.error) {
        console.error('[classify-ncm] Erro HTTP:', response.error)
        const status = response.error?.status || 500
        throw new Error(
          `A edge function classify-ncm retornou erro HTTP ${status}. ` +
            (status === 503 || status === 500
              ? 'O servidor de IA ou gateway está indisponível temporariamente. Tente novamente ou use o "Modo demo".'
              : response.error.message || 'Falha na requisição.'),
        )
      }

      const data = response.data as NcmSelectionData

      if (!data || !data.recommendation) {
        throw new Error('A resposta da função não continha um NCM recomendado válido.')
      }

      setNcmResult(data)
      toast({
        title: 'Classificação Concluída!',
        description: `NCM recomendado: ${formatNcmCode(data.recommendation.ncm)} em ${data.execution_time_ms || 0}ms.`,
      })
    } catch (err: any) {
      console.error('[NcmDemoPage] Erro ao classificar NCM:', err)
      const userMsg =
        err?.message ||
        'Ocorreu uma falha na comunicação com o agente de classificação. Verifique sua conexão e tente novamente.'
      setErrorMessage(userMsg)
    } finally {
      setIsLoading(false)
    }
  }

  // Copiar snippet de integração para área de transferência
  const copyIntegrationSnippet = () => {
    const snippet = `// Exemplo de integração no seu componente/tela:
import { NcmSelectionExample } from '@/components/NcmSelectionExample'

// 1. Chame a edge function:
const { data, error } = await supabase.functions.invoke('classify-ncm', {
  body: {
    product_description: produto.descricao,
    brand: produto.marca,
    model: produto.modelo,
    top_n: 15,
    product_id: produto.id,
    save_log: true,
  }
})

// 2. Renderize o componente:
<NcmSelectionExample
  data={data}
  productId={produto.id}
  onConfirm={(selection) => {
    console.log('NCM escolhido:', selection.ncm, 'Ex:', selection.ex)
    // Atualize o estado do seu formulário ou grave no banco
  }}
/>`

    navigator.clipboard.writeText(snippet)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
    toast({
      title: 'Código copiado!',
      description: 'Snippet de integração copiado para a área de transferência.',
    })
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Cabeçalho da Página */}
        <div className="border-b pb-6 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-primary/40 text-primary bg-primary/5 font-mono text-xs"
                >
                  Referência de UI • Equipe Externa
                </Badge>
                <Badge variant="secondary" className="text-xs font-mono">
                  v3.7.0
                </Badge>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
                <Layers className="w-7 h-7 text-amber-500" />
                Demonstração de Seleção de NCM
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-3xl">
                Componente de referência de UI projetado para ser copiado e integrado em outras
                telas administrativas (simulador de importação, cadastro e revisão de produtos).
                Demonstra o fluxo completo com NCM recomendado, alternativas hierarquizadas,
                rastreamento de alíquotas e justificativa legal.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={copyIntegrationSnippet}
              className="text-xs flex items-center gap-1.5"
            >
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copiedCode ? 'Copiado!' : 'Copiar Snippet de Integração'}
            </Button>
          </div>
        </div>

        {/* Card do Formulário de Entrada e Controles */}
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-foreground">
                  <FileCode className="w-4 h-4 text-primary" />
                  Parâmetros de Entrada da Classificação
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  Preencha os dados do produto ou carregue o exemplo do Sony RM-IP500.
                </CardDescription>
              </div>

              {/* Toggle Modo Demo */}
              <div className="flex items-center gap-3 bg-muted/40 p-2.5 rounded-lg border border-border/60 self-start sm:self-auto">
                <Switch id="demo-toggle" checked={isDemoMode} onCheckedChange={setIsDemoMode} />
                <Label htmlFor="demo-toggle" className="text-xs cursor-pointer space-y-0.5">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <span>Modo Demo (Instantâneo)</span>
                    {isDemoMode && (
                      <Badge className="bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] py-0 px-1">
                        Ativo
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-normal">
                    {isDemoMode
                      ? 'Usa dados mockados sem chamar a IA nem esperar 60s'
                      : 'Chama a edge function classify-ncm real (leva 30-60s)'}
                  </div>
                </Label>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-0">
            {/* Aviso sobre tempo de resposta quando em modo real */}
            {!isDemoMode && (
              <Alert className="border-blue-500/40 bg-blue-500/5 text-blue-900 dark:text-blue-200">
                <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertTitle className="text-xs font-semibold">Aviso de Execução Real</AlertTitle>
                <AlertDescription className="text-[11px] mt-0.5 leading-relaxed">
                  A edge function <code>classify-ncm</code> executa 2 passadas completas de IA
                  (Análise via GPT-4o-mini + Auditoria NESH via DeepSeek), com busca híbrida
                  vetorial em 21.000+ linhas e eventual busca web. O tempo de processamento típico
                  varia entre <strong>30 e 60 segundos</strong>.
                </AlertDescription>
              </Alert>
            )}

            {/* Descrição do Produto */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="product-desc" className="text-xs font-semibold">
                  Descrição do Produto <span className="text-destructive">*</span>
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  Mais detalhes = maior acurácia aduaneira
                </span>
              </div>
              <Textarea
                id="product-desc"
                rows={3}
                placeholder="Ex.: Controlador remoto com joystick pan/tilt/zoom para câmeras robóticas PTZ..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-xs font-sans leading-relaxed"
              />
            </div>

            {/* Linha Marca, Modelo e Especificações Adicionais */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="product-brand" className="text-xs font-medium">
                  Marca
                </Label>
                <Input
                  id="product-brand"
                  placeholder="Ex.: Sony"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="product-model" className="text-xs font-medium">
                  Modelo
                </Label>
                <Input
                  id="product-model"
                  placeholder="Ex.: RM-IP500"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="product-id" className="text-xs font-medium">
                  Product ID (Opcional)
                </Label>
                <Input
                  id="product-id"
                  placeholder="Ex.: uuid do produto"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </div>

            {/* Especificações Adicionais e Top N */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-3 space-y-1">
                <Label htmlFor="additional-specs" className="text-xs font-medium">
                  Especificações Adicionais (Opcional)
                </Label>
                <Input
                  id="additional-specs"
                  placeholder="Ex.: Alimentação 12V DC, interface IP RJ-45, acessório dependente..."
                  value={additionalSpecs}
                  onChange={(e) => setAdditionalSpecs(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="top-n" className="text-xs font-medium">
                  Candidatos (Top N)
                </Label>
                <Input
                  id="top-n"
                  type="number"
                  min={5}
                  max={30}
                  value={topN}
                  onChange={(e) => setTopN(Number(e.target.value))}
                  className="text-xs font-mono"
                />
              </div>
            </div>

            {/* Mensagem de Erro se houver */}
            {errorMessage && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="text-xs font-semibold">Falha na Classificação</AlertTitle>
                <AlertDescription className="text-xs mt-1 leading-relaxed">
                  {errorMessage}
                </AlertDescription>
              </Alert>
            )}

            {/* Botões de Ação do Formulário */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleLoadExample}
                  disabled={isLoading}
                  className="text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1 text-amber-500" />
                  Carregar exemplo (RM-IP500)
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  disabled={isLoading}
                  className="text-xs text-muted-foreground"
                >
                  Limpar
                </Button>
              </div>

              <Button
                type="button"
                onClick={handleAnalyze}
                disabled={isLoading}
                size="sm"
                className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    {isDemoMode ? 'Simulando análise...' : 'Analisando NCM (30-60s)...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-300" />
                    Analisar NCM
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Feedback de Confirmação Local */}
        {confirmedSelection && (
          <Alert className="border-emerald-500/50 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <AlertTitle className="text-xs font-semibold">Ação do Usuário Capturada</AlertTitle>
            <AlertDescription className="text-xs mt-1 space-y-1">
              <div>
                O usuário confirmou a opção:{' '}
                <strong className="font-mono">{formatNcmCode(confirmedSelection.ncm)}</strong>
                {confirmedSelection.ex && ` (Ex ${confirmedSelection.ex})`} —{' '}
                {confirmedSelection.isRecommended ? 'Recomendada pela IA' : 'Alternativa'}
              </div>
              <div className="text-[11px] opacity-80">
                Num app real integrado, este evento atualizaria a linha da tabela de produtos e
                enviaria um UPDATE para <code>imp_sim_ncm_classification_log</code> com o{' '}
                <code>auditId: {confirmedSelection.auditId || 'n/a'}</code>.
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Visualização do Componente de Referência de UI */}
        {isLoading && (
          <Card className="border-dashed p-12 flex flex-col items-center justify-center space-y-3 text-center bg-muted/10">
            <div className="relative">
              <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
              <Sparkles className="w-4 h-4 text-primary absolute -top-1 -right-1" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                {isDemoMode
                  ? 'Carregando dados da demonstração...'
                  : 'Executando Classificação Fiscal Inteligente...'}
              </h3>
              <p className="text-xs text-muted-foreground max-w-md">
                {isDemoMode
                  ? 'Preparando visualização de referência com recomendação e alternativas hierarquizadas.'
                  : 'Varrendo base NCM oficial, aplicando regras NESH e auditando conformidade aduaneira.'}
              </p>
            </div>
          </Card>
        )}

        {ncmResult && !isLoading && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Resultado da Classificação (Componente de UI)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Abaixo está o componente <code>&lt;NcmSelectionExample /&gt;</code> renderizado
                  com os dados recebidos.
                </p>
              </div>

              {isDemoMode && (
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 text-xs"
                >
                  Modo Demo Ativo (Mock RM-IP500)
                </Badge>
              )}
            </div>

            {/* O Componente Real de Referência */}
            <div className="bg-card p-4 sm:p-6 rounded-xl border border-border shadow-sm">
              <NcmSelectionExample
                data={ncmResult}
                productId={productId}
                onConfirm={(payload) => setConfirmedSelection(payload)}
              />
            </div>
          </div>
        )}

        {/* Seção Didática: Instruções de Código para a Equipe Externa */}
        <Card className="border-border bg-muted/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Code2 className="w-4 h-4 text-primary" />
              Como a Outra Equipe Deve Copiar e Usar Este Componente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs leading-relaxed text-foreground/85 pt-0">
            <p>
              1. <strong>Copie o arquivo do componente:</strong> pegue o código em{' '}
              <code>src/components/NcmSelectionExample.tsx</code> e salve no seu projeto (ex.:{' '}
              <code>src/components/ncm/NcmSelection.tsx</code>). Ele usa apenas componentes padrão
              do shadcn/ui (Card, Badge, Button, Alert, Collapsible, RadioGroup, Label) e Lucide
              Icons.
            </p>
            <p>
              2.{' '}
              <strong>
                Invoque a função <code>classify-ncm</code>:
              </strong>
            </p>
            <pre className="p-3 rounded bg-zinc-950 text-zinc-100 font-mono text-[11px] overflow-x-auto">
              {`const { data, error } = await supabase.functions.invoke('classify-ncm', {
  body: {
    product_description: "Controlador remoto Sony RM-IP500...",
    brand: "Sony",
    model: "RM-IP500",
    top_n: 15,
    product_id: produto.id,
    save_log: true,
  }
})`}
            </pre>
            <p>
              3.{' '}
              <strong>
                Passe a resposta para a prop <code>data</code>:
              </strong>
            </p>
            <pre className="p-3 rounded bg-zinc-950 text-zinc-100 font-mono text-[11px] overflow-x-auto">
              {`<NcmSelectionExample
  data={data}
  productId={produto.id}
  onConfirm={(confirmed) => {
    // confirmed.ncm: string formatada sem máscara (ex: "85299090")
    // confirmed.ex: string (ex: "" ou "001")
    // confirmed.isRecommended: boolean
    // confirmed.auditId: string | null
    salvarNcmNoProduto(produto.id, confirmed.ncm, confirmed.ex)
  }}
/>`}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default NcmDemoPage
