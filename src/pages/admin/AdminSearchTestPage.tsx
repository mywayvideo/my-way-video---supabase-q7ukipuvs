import React, { useState } from 'react'
import { Search, Loader2, Image as ImageIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase/client'
import { AdminLayout } from '@/components/admin/AdminLayout'

export default function AdminSearchTestPage() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [searched, setSearched] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setSearched(true)
    try {
      const { data, error } = await supabase.rpc('execute_ai_search_v3', {
        search_term: query,
      })
      if (error) throw error
      setResult(data)
    } catch (error) {
      console.error(error)
      setResult({ error: 'Erro ao executar a busca', details: error })
    } finally {
      setLoading(false)
    }
  }

  const getProducts = () => {
    if (!result) return []
    if (Array.isArray(result)) return result
    if (result.stock && Array.isArray(result.stock)) return result.stock
    if (result.products && Array.isArray(result.products)) return result.products

    // Fallback for custom objects containing an array of items
    const arrays = Object.values(result).filter(Array.isArray)
    if (arrays.length > 0) return arrays[0]

    return []
  }

  const products = getProducts()

  return (
    <AdminLayout breadcrumb="Testador de Busca">
      <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Testador de Busca</h1>
          <p className="text-muted-foreground mt-2">
            Valide e refine o algoritmo de busca do banco de dados executando testes diretos.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Digite o termo de busca..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Testar
              </Button>
            </form>
          </CardContent>
        </Card>

        {searched && !loading && (
          <Tabs defaultValue="visual" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="visual">Visual Mode</TabsTrigger>
              <TabsTrigger value="technical">Technical Mode</TabsTrigger>
            </TabsList>

            <TabsContent value="visual" className="mt-0">
              {products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-card border-dashed">
                  <Search className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
                  <p className="text-lg font-medium">Nenhum produto encontrado para este termo</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tente usar palavras-chave diferentes ou verifique o retorno no modo técnico.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {products.map((product: any, idx: number) => (
                    <Card key={product.id || idx} className="overflow-hidden flex flex-col">
                      <div className="aspect-square relative bg-white/5 dark:bg-white/10 flex items-center justify-center p-4 border-b">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="object-contain w-full h-full"
                          />
                        ) : (
                          <ImageIcon className="w-10 h-10 text-muted-foreground opacity-20" />
                        )}
                      </div>
                      <CardContent className="p-4 flex-1 flex flex-col gap-2">
                        <h3 className="font-medium text-sm line-clamp-2" title={product.name}>
                          {product.name || 'Produto sem nome'}
                        </h3>
                        <div className="mt-auto">
                          {product.price_brl !== undefined && product.price_brl !== null ? (
                            <p className="font-bold text-green-600 dark:text-green-500">
                              {Number(product.price_brl).toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">Preço não disponível</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="technical" className="mt-0">
              <Card>
                <CardContent className="p-0">
                  <div className="max-h-[600px] overflow-auto bg-zinc-950 text-zinc-50 p-4 rounded-lg">
                    <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AdminLayout>
  )
}
