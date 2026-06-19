import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, ShoppingCart, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { playCoinSound } from '@/utils/sound'
import { toast } from 'sonner'
import { useCart } from '@/hooks/useCart'
import { ProductPrice } from '@/components/ProductPrice'
import { useProductDiscount } from '@/hooks/useProductDiscount'

interface FavoriteProductCardProps {
  product: any
  onRemove: (productId: string) => Promise<void>
  onAddToCart?: (productId: string, quantity: number) => Promise<void>
  isFavorited: boolean
  onToggleFavorite: (productId: string, willBeFavorite: boolean) => Promise<void>
}

export function FavoriteProductCard({
  product,
  onRemove,
  onAddToCart,
  isFavorited: initialIsFavorited,
  onToggleFavorite,
}: FavoriteProductCardProps) {
  const { addToCart } = useCart()
  const [isRemoved, setIsRemoved] = useState(false)
  const [quantityModalOpen, setQuantityModalOpen] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [processingAction, setProcessingAction] = useState<'remove' | 'cart' | 'heart' | null>(null)
  const [showExplosion, setShowExplosion] = useState(false)
  const [isFavorited, setIsFavorited] = useState(initialIsFavorited)

  const discountData = useProductDiscount(product)

  const handleRemove = async () => {
    setProcessingAction('remove')
    try {
      setIsRemoved(true)
      setTimeout(async () => {
        await onRemove(product.id)
        toast.success('Removido dos favoritos')
      }, 300)
    } catch (e) {
      setIsRemoved(false)
      setProcessingAction(null)
      toast.error('Erro ao remover dos favoritos. Tente novamente.')
    }
  }

  const handleAddToCart = async () => {
    setProcessingAction('cart')
    try {
      if (onAddToCart) {
        await onAddToCart(product.id, quantity)
      } else {
        await addToCart(product.id, quantity)
      }
      setQuantityModalOpen(false)
      toast.success('Produto movido para o carrinho!')
      setIsRemoved(true)
      setTimeout(async () => {
        await onRemove(product.id)
      }, 300)
    } catch (e) {
      setProcessingAction(null)
      toast.error('Erro ao adicionar ao carrinho. Tente novamente.')
    }
  }

  const handleHeartClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setProcessingAction('heart')
    try {
      const willBeFavorited = !isFavorited
      await onToggleFavorite(product.id, willBeFavorited)
      setIsFavorited(willBeFavorited)

      if (willBeFavorited) {
        setShowExplosion(true)
        playCoinSound()
        setTimeout(() => setShowExplosion(false), 600)
        // toast.success handled in hook
      } else {
        // toast.success handled in hook
      }
    } catch (e) {
      // Silently fail to keep optimistic UI as requested
    } finally {
      setProcessingAction(null)
    }
  }

  const isProcessing = processingAction !== null

  return (
    <>
      <Card
        className={cn(
          'flex flex-col h-full overflow-hidden group border-border/50 hover:border-primary/50 transition-colors shadow-sm hover:shadow-md relative',
          isRemoved ? 'card-fade-out' : '',
        )}
      >
        <CardHeader className="p-0 relative">
          <div className="absolute top-2 right-2 z-10">
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 rounded-full shadow-sm bg-white/80 hover:bg-white backdrop-blur-sm transition-all relative overflow-visible"
              onClick={handleHeartClick}
              disabled={isProcessing}
            >
              {processingAction === 'heart' ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <Heart
                  className={cn(
                    'h-4 w-4 transition-colors',
                    isFavorited ? 'fill-red-500 text-red-500' : 'text-muted-foreground',
                  )}
                />
              )}
              {showExplosion && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50">
                  {Array.from({ length: 12 }).map((_, i) => {
                    const angle = (i / 12) * Math.PI * 2
                    const distance = 40 + Math.random() * 20
                    const tx = Math.cos(angle) * distance
                    const ty = Math.sin(angle) * distance - 10
                    return (
                      <Heart
                        key={i}
                        className="absolute h-3 w-3 fill-red-500 text-red-500 animate-heart-particle"
                        style={
                          {
                            '--tx': `${tx}px`,
                            '--ty': `${ty}px`,
                          } as React.CSSProperties
                        }
                      />
                    )
                  })}
                </div>
              )}
            </Button>
          </div>
          <Link
            to={`/product/${product.id}`}
            className="w-full h-[200px] overflow-hidden rounded bg-muted/30 flex items-center justify-center"
          >
            <ImageWithFallback
              src={product.image_url}
              alt={product.name}
              productId={product.id}
              className="w-full h-full object-cover rounded transition-transform duration-500 group-hover:scale-105"
            />
          </Link>
        </CardHeader>

        <CardContent className="flex-1 p-5 flex flex-col text-left">
          <Link to={`/product/${product.id}`} className="mb-2 block w-full">
            <h3 className="font-semibold text-sm md:text-base group-hover:text-primary transition-colors line-clamp-3 h-[60px] md:h-[72px] text-left">
              {product.name}
            </h3>
          </Link>
          <div className="mt-auto pt-1 flex flex-col items-center w-full">
            {(!product.price_usd || product.price_usd <= 0) &&
              product.price_nationalized_sales > 0 && (
                <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-sm text-[10px] font-bold shadow-sm uppercase tracking-wider mb-1">
                  Preço Brasil
                </span>
              )}
            <ProductPrice
              price={discountData?.price ?? discountData?.finalPrice}
              originalPrice={discountData?.originalPrice}
              discountPercentage={discountData?.discountPercentage}
              discountLabel={discountData?.discountLabel}
              product={product}
              {...discountData}
            />
          </div>
        </CardContent>

        <CardFooter className="p-5 pt-0 mt-auto gap-2 flex flex-col">
          <Button
            className="w-full bg-[#FF9F1A] hover:bg-[#FF9F1A]/90 text-[#111111] font-semibold transition-all hover:scale-[1.02] shadow-sm"
            onClick={() => setQuantityModalOpen(true)}
            disabled={isProcessing}
          >
            {processingAction === 'cart' ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ShoppingCart className="w-4 h-4 mr-2" />
            )}
            Adicionar
          </Button>
          <Button
            variant="destructive"
            className="w-full transition-all hover:scale-[1.02] shadow-sm"
            onClick={handleRemove}
            disabled={isProcessing}
          >
            {processingAction === 'remove' ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            Remover
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={quantityModalOpen} onOpenChange={setQuantityModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Selecionar Quantidade</DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <Label htmlFor="quantity" className="mb-2 block">
              Quantidade
            </Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              max="99"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="text-lg"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setQuantityModalOpen(false)}
              disabled={isProcessing}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddToCart}
              disabled={isProcessing}
              className="bg-[#FF9F1A] hover:bg-[#FF9F1A]/90 text-[#111111] font-semibold"
            >
              {processingAction === 'cart' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
