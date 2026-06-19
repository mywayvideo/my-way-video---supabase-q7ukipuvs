import React, { useState, useRef, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Bot, MessageCircle, Sparkles, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Link, useParams } from 'react-router-dom'
import { ProductCard } from '@/components/ProductCard'

const parseMarkdownToHtml = (text: string | null | undefined): string => {
  if (!text) return ''
  let html = text.replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Headers
  html = html.replace(
    /^###\s+(.*)$/gm,
    '<h3 class="text-green-400 text-lg font-bold mt-4 mb-2">$1</h3>',
  )
  html = html.replace(
    /^##\s+(.*)$/gm,
    '<h2 class="text-green-400 text-xl font-bold mt-6 mb-3">$1</h2>',
  )
  html = html.replace(
    /^#\s+(.*)$/gm,
    '<h1 class="text-green-400 text-2xl font-bold mt-8 mb-4">$1</h1>',
  )

  // Negrito
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')

  // Itálico
  html = html.replace(/\*(?!\s)(.*?)(?<!\s)\*/g, '<em class="text-green-100/80">$1</em>')

  // Tabelas markdown → grid CSS
  const lines = html.split('\n')
  const out: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('|') && t.endsWith('|')) {
      const cells = t
        .split('|')
        .map((c) => c.trim())
        .filter((_, i, a) => i > 0 && i < a.length - 1)
      if (cells.every((c) => /^[-:]+$/.test(c))) continue // pula linha separadora
      const cols = cells.length
      let row = `<div class="grid gap-2 my-2" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr))">`
      cells.forEach((c) => {
        row += `<div class="border border-green-800/40 p-2 text-sm text-white/90">${c}</div>`
      })
      row += '</div>'
      out.push(row)
    } else {
      out.push(line)
    }
  }
  html = out.join('\n')

  // Bullets
  html = html.replace(/^•\s+(.*)$/gm, '<li class="ml-4 text-white/90">$1</li>')
  html = html.replace(/^-\s+(.*)$/gm, '<li class="ml-4 text-white/90">$1</li>')

  // Quebras de linha
  html = html.replace(/\n/g, '<br />')
  return html
}

interface Product {
  id: string
  name: string
  price_usd?: number
  price_brl?: number
  price_nationalized_sales?: number
  price_nationalized_currency?: string
  image_url?: string
  category?: string
  manufacturer?: string
  manufacturer_id?: string
  description?: string
  sku?: string
  slug?: string
  weight?: number
  is_discontinued?: boolean
  discount_percentage?: number
  price_usa_rebate?: number
  date_rebate?: string
  originalPrice?: number
  discountedPrice?: number
  originalPriceNat?: number
  discountedPriceNat?: number
  discountPercentage?: number
  isRebateActive?: boolean
  manufacturers?: { name: string } | null
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  products?: Product[]
  should_show_whatsapp_button?: boolean
  tier?: number
}

interface AIConsultantModalProps {
  isOpen: boolean
  onClose: () => void
  productId?: string
  initialQuery?: string
}

export function AIConsultantModal({
  isOpen,
  onClose,
  productId,
  initialQuery,
}: AIConsultantModalProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()
  const [sessionId] = useState(() => crypto.randomUUID())
  const [whatsappNumber, setWhatsappNumber] = useState('17867161170')
  const [priceThreshold, setPriceThreshold] = useState(5000)
  const [currentProductPrice, setCurrentProductPrice] = useState(0)
  const [currentProductName, setCurrentProductName] = useState('')

  const { id: urlProductId } = useParams<{ id: string }>()
  const activeProductId = productId || urlProductId

  useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        const { data: appSettings } = await supabase
          .from('app_settings')
          .select('setting_value')
          .in('setting_key', ['whatsapp_number', 'company_whatsapp'])
          .limit(1)

        if (appSettings && appSettings.length > 0) {
          setWhatsappNumber(appSettings[0].setting_value.replace(/\D/g, ''))
        }

        const { data: aiSettings } = await supabase
          .from('ai_settings')
          .select('price_threshold_usd')
          .limit(1)
          .maybeSingle()

        if (aiSettings?.price_threshold_usd) {
          setPriceThreshold(aiSettings.price_threshold_usd)
        }

        if (activeProductId) {
          const { data: productData } = await supabase
            .from('products')
            .select('price_usd, name')
            .eq('id', activeProductId)
            .maybeSingle()

          if (productData) {
            setCurrentProductPrice(productData.price_usd || 0)
            setCurrentProductName(productData.name || '')
          }
        }
      }
      fetchData()
    }
  }, [isOpen, activeProductId])

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      if (initialQuery) {
        setInputValue(initialQuery)
        handleSend(initialQuery)
      } else {
        setMessages([
          {
            id: '1',
            role: 'assistant',
            content:
              'Olá! Sou seu consultor técnico de audiovisual da My Way. Como posso ajudar você hoje com seus equipamentos e projetos?',
          },
        ])
      }
    }
  }, [isOpen, messages.length, initialQuery])

  useEffect(() => {
    // Só rola quando a última mensagem é do assistente (resposta da IA)
    const lastMsg = messages[messages.length - 1]
    if (lastMsg?.role === 'assistant' && scrollRef.current) {
      // Rola para o INÍCIO da mensagem do assistente, não para o final
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [messages])

  const handleSend = async (overrideQuery?: string) => {
    const query = overrideQuery || inputValue
    if (!query.trim()) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: query.trim(),
    }

    setMessages((prev) => [...prev, userMsg])
    if (!overrideQuery) setInputValue('')
    setIsLoading(true)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    try {
      const endpoint = activeProductId ? 'execute_ai_search_v2_pp' : 'execute_ai_search_v2'
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          query: userMsg.content,
          session_id: sessionId,
          currentProductId: activeProductId,
          userName: user?.user_metadata?.name || 'Cliente',
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Erro na busca: ${response.statusText} - ${errText}`)
      }

      const data = await response.json()
      console.log('[DEBUG_MODAL] Resposta completa:', JSON.stringify(data, null, 2))
      console.log('[DEBUG_MODAL] data.products:', data.products)
      console.log(
        '[DEBUG_MODAL] data.referenced_internal_products:',
        data.referenced_internal_products,
      )

      // Busca produtos em múltiplos campos possíveis
      let finalProducts = data.products || data.response?.products || data.payload?.products || []

      // Fallback: se tem IDs mas não tem produtos enriquecidos, fazer grounding
      if (
        finalProducts.length === 0 &&
        Array.isArray(data.referenced_internal_products) &&
        data.referenced_internal_products.length > 0
      ) {
        // Ignoring price_usa, slug, discount_percentage and manufacturer to avoid PostgREST error as they don't exist in products table
        const { data: groundedProducts } = await supabase
          .from('products')
          .select(
            'id, name, price_usd, price_brl, price_nationalized_sales, price_nationalized_currency, image_url, category, description, sku, weight, is_discontinued, price_usa_rebate, date_rebate, manufacturer_id, manufacturers(name)',
          )
          .in('id', data.referenced_internal_products)
        finalProducts = groundedProducts || []
      }

      // Cálculo de preço final por cliente
      if (user && finalProducts.length > 0) {
        try {
          const { data: customer } = await supabase
            .from('customers')
            .select('id')
            .eq('user_id', user.id)
            .single()

          if (customer) {
            finalProducts = await Promise.all(
              finalProducts.map(async (p: Product) => {
                const { data: finalPrice } = await supabase.rpc('calculate_final_price', {
                  p_customer_id: customer.id,
                  p_product_id: p.id,
                })
                return { ...p, price_usd: finalPrice ?? p.price_usd }
              }),
            )
          }
        } catch (e) {
          console.error('Error fetching final prices', e)
        }
      }

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.message || 'Desculpe, não consegui processar sua requisição.',
        products: finalProducts,
        should_show_whatsapp_button: data.should_show_whatsapp_button,
        tier: data.tier || 1,
      }

      setMessages((prev) => [...prev, assistantMsg])
    } catch (err: any) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'A busca demorou mais de 60 segundos. Tente novamente.',
          },
        ])
      } else {
        console.error(err)
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Desculpe, ocorreu um erro ao conectar com o agente de IA.',
          },
        ])
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleWhatsappClick = () => {
    let message = 'Olá! Gostaria de falar com um especialista.'
    if (activeProductId && currentProductName) {
      message = `Olá! Gostaria de falar com um especialista sobre o produto: ${currentProductName}`
      if (currentProductPrice > 0) {
        message += `\nValor aproximado: USD $${currentProductPrice.toFixed(2)}`
      }
    }
    if (user?.email) {
      message += `\nMeu email: ${user.email}`
    }
    if (user?.user_metadata?.name) {
      message += `\nMeu nome: ${user.user_metadata.name}`
    }
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, '_blank')
  }

  const shouldShowWhatsappGlobal = currentProductPrice > priceThreshold

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] h-[85vh] flex flex-col p-0 gap-0 bg-zinc-950 border-green-900/30 overflow-hidden">
        <DialogHeader className="p-4 border-b border-green-900/30 bg-zinc-900/50 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-green-400">
              <Bot className="w-5 h-5" />
              {currentProductName
                ? `Consultor IA MY WAY - ${currentProductName}`
                : 'Consultor IA MY WAY'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Assistente de IA para ajudar com produtos e dúvidas técnicas.
            </DialogDescription>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                ref={msg.role === 'assistant' ? scrollRef : null}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-lg p-4 ${msg.role === 'user' ? 'bg-green-600/20 text-green-100' : 'bg-zinc-900 border border-green-900/30'}`}
                >
                  {msg.role === 'user' ? (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="space-y-4">
                      {msg.role === 'assistant' &&
                        msg.id !== '1' && // ← ignora a mensagem de boas-vindas
                        (msg.should_show_whatsapp_button ||
                          shouldShowWhatsappGlobal ||
                          (msg.products &&
                            msg.products.some((p) => (p.price_usd || 0) > priceThreshold))) && (
                          <div className="mb-4 pb-4 border-b border-green-900/30">
                            <Button
                              variant="default"
                              className="bg-[#25D366] hover:bg-[#20bd5a] text-white w-full sm:w-auto"
                              onClick={handleWhatsappClick}
                            >
                              <MessageCircle className="w-4 h-4 mr-2" /> Falar com Especialista
                            </Button>
                          </div>
                        )}

                      <div
                        className="text-white/90 text-base leading-normal overflow-x-auto space-y-4"
                        dangerouslySetInnerHTML={{
                          __html: parseMarkdownToHtml(
                            (msg.content || '')
                              .replace(/realizando busca profunda my way/gi, '')
                              .trim(),
                          ),
                        }}
                      />

                      {msg.products &&
                        msg.products.filter((p) => p.id !== activeProductId).length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                            {msg.products
                              .filter((p) => p.id !== activeProductId)
                              .map((product) => (
                                <div key={product.id} onClick={onClose} className="cursor-pointer">
                                  <ProductCard product={product as any} />
                                </div>
                              ))}
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-zinc-900 border border-orange-900/30 rounded-lg p-4">
                  <div className="flex gap-2 items-center">
                    <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                    <span className="text-sm text-orange-400">Pesquisando no catálogo...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-green-900/30 bg-zinc-900/50 flex-shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="flex gap-2"
          >
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre equipamentos, especificações ou projetos..."
              className="bg-zinc-950 border-green-900/30 text-green-100 focus-visible:ring-green-500/50"
              disabled={isLoading}
            />
            <Button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="bg-green-600 hover:bg-green-700 text-white shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
          <div className="mt-2 text-center">
            <p className="text-[10px] text-zinc-500">
              A IA pode cometer erros. Considere verificar informações importantes.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
