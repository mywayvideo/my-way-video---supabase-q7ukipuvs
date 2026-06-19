import { useState, useRef, useEffect } from 'react'
import { Search, Loader2, Bot, MessageSquare, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAiSearch } from '@/hooks/use-ai-search'
import { cn } from '@/lib/utils'
import { ResponseFormatter } from '@/components/ResponseFormatter'
import { AILoader } from '@/components/AI/AILoader'

export function ChatInterface() {
  const { search, isLoading, results } = useAiSearch()
  // Extrai o WhatsApp dinâmico das configurações globais enviadas pelo index.ts
  const whatsappNumber = results?.settings?.company_whatsapp?.replace(/\D/g, '') || '17867161170'
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<
    Array<{
      role: 'user' | 'assistant'
      content: string
      products?: any[]
      showWhatsapp?: boolean
      confidence?: string
      is_intermediate?: boolean
    }>
  >([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const displayConfig = results?.settings?.result_component_config || {}
  const theme = displayConfig.theme || 'light'

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }

  useEffect(() => {
    scrollToBottom()
    const timeout = setTimeout(scrollToBottom, 150)
    return () => clearTimeout(timeout)
  }, [messages, isLoading, results?.message])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim() || isLoading) return

    const userQuery = query.trim()
    setQuery('')
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userQuery },
      {
        role: 'assistant',
        content: '',
        is_intermediate: true,
      },
    ])

    const res = await search(userQuery, messages)
    if (res) {
      const productsToRender = res.products || []

      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.is_intermediate) {
          const newMessages = [...prev]
          newMessages[newMessages.length - 1] = {
            role: 'assistant',
            content: res.message || res.content,
            products: productsToRender,
            showWhatsapp: res.should_show_whatsapp_button,
            confidence: res.confidence_level,
            is_intermediate: false,
          }
          return newMessages
        }
        return [
          ...prev,
          {
            role: 'assistant',
            content: res.message || res.content,
            products: productsToRender,
            showWhatsapp: res.should_show_whatsapp_button,
            confidence: res.confidence_level,
            is_intermediate: false,
          },
        ]
      })
    }
  }

  return (
    <Card
      className={cn(
        'w-full max-w-4xl mx-auto flex flex-col h-[800px] shadow-lg border-primary/10 transition-colors',
        theme === 'professional-dark'
          ? 'bg-slate-900 text-slate-100 border-slate-800'
          : 'bg-card text-card-foreground',
      )}
    >
      <CardHeader
        className={cn(
          'border-b px-6 py-4 flex flex-row items-center justify-between space-y-0',
          theme === 'professional-dark' ? 'bg-slate-900 border-slate-800' : 'bg-card',
        )}
      >
        <div className="flex items-center space-x-3">
          <div className="bg-primary/10 p-2 rounded-full">
            <Bot className="w-6 h-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <CardTitle className="text-xl">Assistente Especializado</CardTitle>
              <Badge
                variant="outline"
                className="font-bold text-xs tracking-wider text-primary border-primary/20 bg-primary/5 relative z-50"
              >
                IA MY WAY Business
              </Badge>
            </div>
            <CardDescription>Tire suas dúvidas sobre equipamentos audiovisuais</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full px-6 py-4" ref={scrollRef}>
          <div className="space-y-6 pb-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 mt-20">
                <div
                  className={cn(
                    'p-4 rounded-full',
                    theme === 'professional-dark' ? 'bg-slate-800' : 'bg-primary/5',
                  )}
                >
                  <MessageSquare
                    className={cn(
                      'w-8 h-8',
                      theme === 'professional-dark' ? 'text-slate-400' : 'text-primary/50',
                    )}
                  />
                </div>
                <div>
                  <p
                    className={cn(
                      'font-medium',
                      theme === 'professional-dark' ? 'text-slate-200' : 'text-foreground',
                    )}
                  >
                    Como posso ajudar hoje?
                  </p>
                  <p
                    className={cn(
                      'text-sm',
                      theme === 'professional-dark' ? 'text-slate-400' : 'text-muted-foreground',
                    )}
                  >
                    Pesquise por produtos, especificações ou monte seu projeto.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  id={msg.role === 'assistant' ? 'ai-response-container' : undefined}
                  className={cn(
                    'flex flex-col w-full',
                    msg.role === 'user' ? 'items-end' : 'items-start',
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-5 py-3.5 text-sm shadow-sm',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : theme === 'professional-dark'
                          ? 'bg-slate-800 text-slate-100 rounded-tl-sm border border-slate-700'
                          : 'bg-muted/50 text-foreground rounded-tl-sm border border-border/50',
                    )}
                  >
                    <div className="leading-relaxed space-y-2 break-words w-full">
                      {msg.role === 'assistant' && msg.is_intermediate ? (
                        <div className="flex items-center justify-center w-full py-4">
                          <AILoader size="small" />
                        </div>
                      ) : msg.role === 'assistant' ? (
                        <ResponseFormatter content={msg.content} products={msg.products} />
                      ) : (
                        msg.content.replace(/my way/gi, 'MY WAY')
                      )}
                    </div>
                  </div>

                  {msg.role === 'assistant' &&
                    !msg.is_intermediate &&
                    (msg.showWhatsapp || msg.confidence === 'low') && (
                      <div className="mt-4 max-w-[85%]">
                        <Button
                          onClick={() => window.open(`https://wa.me/${whatsappNumber}`, '_blank')}
                          className="bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-md border border-green-600/20 group transition-all duration-300"
                        >
                          <Phone className="w-4 h-4 mr-2 group-hover:rotate-12 transition-transform" />
                          Falar com Especialista no WhatsApp
                        </Button>
                      </div>
                    )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </CardContent>

      <CardFooter
        className={cn(
          'p-4 border-t',
          theme === 'professional-dark' ? 'bg-slate-900 border-slate-800' : 'bg-card/50',
        )}
      >
        <div className="flex flex-col w-full space-y-3">
          <form onSubmit={handleSubmit} className="flex w-full space-x-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquise por câmeras, lentes, iluminação..."
              disabled={isLoading}
              className={cn(
                'flex-1 focus-visible:ring-primary/30 h-12 px-4 rounded-xl shadow-sm',
                theme === 'professional-dark'
                  ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-400'
                  : 'bg-background border-muted-foreground/20',
              )}
            />
            <Button
              type="submit"
              disabled={!query.trim() || isLoading}
              size="icon"
              className={cn(
                'h-12 w-12 rounded-xl transition-all duration-500 shadow-md flex-shrink-0 relative overflow-hidden group',
                'bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6]',
                'text-white hover:shadow-lg hover:scale-105 border-0 disabled:opacity-90',
                isLoading && 'animate-pulse',
              )}
              style={{ backgroundImage: 'linear-gradient(to right, #3b82f6, #8b5cf6)' }}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-white" color="white" />
              ) : (
                <>
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                  <Search
                    className="w-5 h-5 relative z-10 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform text-white"
                    color="white"
                    strokeWidth={2.5}
                  />
                </>
              )}
            </Button>
          </form>
        </div>
      </CardFooter>
    </Card>
  )
}
