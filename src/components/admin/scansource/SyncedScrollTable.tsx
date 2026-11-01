import React, { useRef, useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface SyncedScrollTableProps {
  children: React.ReactNode
  maxHeight?: string // ex: '420px', '480px', '500px'
  minContentWidth?: string // ex: '860px', '1000px'
  className?: string
}

/**
 * SyncedScrollTable - Padrão de Scrollport Único
 *
 * Estrutura:
 * 1. Faixa horizontal fixa SUPERIOR (fora do scrollport da tabela):
 *    - Fica acima do contêiner com rolagem vertical, de modo que NUNCA desaparece ao rolar verticalmente.
 *    - Trilho com pegada estilizada âmbar que suporta clique e arraste (drag).
 *    - Sincronização bidirecional em tempo real com o scroll horizontal da tabela.
 *
 * 2. UM ÚNICO contêiner com rolagem (overflow-x: auto; overflow-y: auto) com maxHeight:
 *    - Scrollbar vertical nativa visível na borda direita do contêiner desde o início.
 *    - Cabeçalho (TableHeader) sticky top-0 DENTRO desse contêiner:
 *      fica fixo ao rolar para baixo e desliza horizontalmente com as colunas.
 *    - Colunas fixas (sticky left-0, sticky left-[...]) com fundo opaco e z-index adequado.
 */
export function SyncedScrollTable({
  children,
  maxHeight = '480px',
  minContentWidth,
  className,
}: SyncedScrollTableProps) {
  // Referência do scrollport único (contêiner onde a tabela é renderizada e onde ocorrem scroll X e Y)
  const scrollportRef = useRef<HTMLDivElement>(null)
  const topTrackRef = useRef<HTMLDivElement>(null)

  const topDragStartRef = useRef({
    startX: 0,
    scrollLeft: 0,
    maxScroll: 0,
    trackTravel: 0,
  })

  const [isDraggingTop, setIsDraggingTop] = useState(false)
  const [scrollMetrics, setScrollMetrics] = useState({
    scrollLeft: 0,
    scrollWidth: 0,
    clientWidth: 0,
  })

  // Atualiza métricas de scroll horizontal
  const updateMetrics = useCallback(() => {
    const el = scrollportRef.current
    if (!el) return
    setScrollMetrics({
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    })
  }, [])

  // Listener no scrollport único para atualizar o scroll da barra do topo
  useEffect(() => {
    const el = scrollportRef.current
    if (!el) return

    const handleScroll = () => {
      setScrollMetrics((prev) => {
        if (prev.scrollLeft === el.scrollLeft) return prev
        return {
          ...prev,
          scrollLeft: el.scrollLeft,
        }
      })
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    updateMetrics()

    const resizeObserver = new ResizeObserver(() => {
      updateMetrics()
    })

    resizeObserver.observe(el)
    if (el.firstElementChild) {
      resizeObserver.observe(el.firstElementChild)
    }

    return () => {
      el.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
    }
  }, [updateMetrics])

  // Drag handlers para o thumb da barra do topo
  const handleTopPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const el = scrollportRef.current
    const trackEl = topTrackRef.current
    if (!el || !trackEl) return

    const { scrollWidth, clientWidth, scrollLeft } = scrollMetrics
    const maxScroll = Math.max(0, scrollWidth - clientWidth)
    if (maxScroll <= 0) return

    const trackWidth = trackEl.clientWidth
    const ratio = clientWidth / scrollWidth
    const thumbWidth = Math.max(56, Math.min(trackWidth, trackWidth * ratio))
    const trackTravel = trackWidth - thumbWidth
    if (trackTravel <= 0) return

    e.currentTarget.setPointerCapture(e.pointerId)
    topDragStartRef.current = {
      startX: e.clientX,
      scrollLeft,
      maxScroll,
      trackTravel,
    }
    setIsDraggingTop(true)
  }

  const handleTopPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingTop) return
    const el = scrollportRef.current
    if (!el) return

    const { startX, scrollLeft, maxScroll, trackTravel } = topDragStartRef.current
    if (trackTravel <= 0 || maxScroll <= 0) return

    const deltaX = e.clientX - startX
    const scrollDelta = (deltaX / trackTravel) * maxScroll
    const newScrollLeft = Math.max(0, Math.min(maxScroll, scrollLeft + scrollDelta))

    el.scrollLeft = newScrollLeft
    setScrollMetrics((prev) => ({ ...prev, scrollLeft: newScrollLeft }))
  }

  const handleTopPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingTop) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setIsDraggingTop(false)
  }

  // Clique no trilho para navegar diretamente
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const trackEl = topTrackRef.current
    const el = scrollportRef.current
    if (!trackEl || !el) return

    const { scrollWidth, clientWidth } = scrollMetrics
    const maxScroll = Math.max(0, scrollWidth - clientWidth)
    if (maxScroll <= 0) return

    const rect = trackEl.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const trackWidth = rect.width
    const ratio = clientWidth / scrollWidth
    const thumbWidth = Math.max(56, Math.min(trackWidth, trackWidth * ratio))

    const targetThumbLeft = Math.max(0, Math.min(trackWidth - thumbWidth, clickX - thumbWidth / 2))
    const trackTravel = trackWidth - thumbWidth
    const newScrollLeft = trackTravel > 0 ? (targetThumbLeft / trackTravel) * maxScroll : 0

    el.scrollTo({ left: newScrollLeft, behavior: 'smooth' })
    setScrollMetrics((prev) => ({ ...prev, scrollLeft: newScrollLeft }))
  }

  const canScrollHorizontally =
    scrollMetrics.scrollWidth > scrollMetrics.clientWidth && scrollMetrics.clientWidth > 0

  const getThumbStyle = () => {
    const trackEl = topTrackRef.current
    const trackWidth = trackEl?.clientWidth || 0
    if (!canScrollHorizontally || trackWidth <= 0) {
      return { width: '100%', left: '0px', display: 'none' }
    }
    const { scrollLeft, scrollWidth, clientWidth } = scrollMetrics
    const maxScroll = Math.max(1, scrollWidth - clientWidth)
    const ratio = clientWidth / scrollWidth
    const thumbWidth = Math.max(56, Math.min(trackWidth, trackWidth * ratio))
    const trackTravel = trackWidth - thumbWidth
    const thumbLeft = Math.max(0, Math.min(trackTravel, (scrollLeft / maxScroll) * trackTravel))

    return {
      width: `${thumbWidth}px`,
      transform: `translateX(${thumbLeft}px)`,
      left: 0,
    }
  }

  return (
    <div className={cn('w-full max-w-full flex flex-col relative', className)}>
      {/* 1. Faixa de rolagem horizontal FIXA no TOPO (fora do scrollport da tabela) */}
      <div
        className={cn(
          'w-full bg-card/95 backdrop-blur-sm border-t border-b border-white/10 select-none px-2 py-1.5 shrink-0 z-20',
          !canScrollHorizontally && 'hidden',
        )}
      >
        <div
          ref={topTrackRef}
          onClick={handleTrackClick}
          className="relative w-full h-3.5 cursor-pointer flex items-center"
          title="Clique ou arraste a pegada para rolar a tabela horizontalmente"
        >
          {/* Linha guia do trilho escuro */}
          <div className="absolute left-0 right-0 h-2 bg-slate-900/90 border border-slate-700/80 rounded-full shadow-inner" />

          {/* Pegada / Thumb interativa com destaque visual âmbar */}
          {canScrollHorizontally && (
            <div
              onPointerDown={handleTopPointerDown}
              onPointerMove={handleTopPointerMove}
              onPointerUp={handleTopPointerUp}
              onPointerCancel={handleTopPointerUp}
              style={getThumbStyle()}
              className={cn(
                'absolute h-3.5 rounded-full cursor-grab active:cursor-grabbing transition-[filter,transform] duration-75 shadow-md z-10 flex items-center justify-center touch-none',
                'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:brightness-110 active:brightness-125 shadow-[0_1px_6px_rgba(245,158,11,0.55)] border border-amber-300/60',
                isDraggingTop &&
                  'scale-y-110 brightness-125 shadow-[0_2px_8px_rgba(245,158,11,0.75)]',
              )}
            >
              {/* Micro ranhuras visuais no centro do thumb */}
              <div className="flex gap-0.5 pointer-events-none opacity-85">
                <div className="w-0.5 h-1.5 bg-amber-950/80 rounded-full" />
                <div className="w-0.5 h-1.5 bg-amber-950/80 rounded-full" />
                <div className="w-0.5 h-1.5 bg-amber-950/80 rounded-full" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Scrollport ÚNICO da tabela (overflow: auto nas duas direções, max-height e scrollbar visível) */}
      <div
        ref={scrollportRef}
        className={cn(
          'w-full max-w-full overflow-auto relative',
          // Estilo da scrollbar vertical nativa visível na borda direita
          '[&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar]:h-2.5',
          '[&::-webkit-scrollbar-track]:bg-slate-900/50 [&::-webkit-scrollbar-track]:border-l [&::-webkit-scrollbar-track]:border-white/5',
          '[&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-500',
          // Neutralização definitiva de QUALQUER wrapper intermediário (como o <div className="relative w-full overflow-auto"> do shadcn Table):
          // Força overflow: visible e position: static em qualquer div filha do scrollport,
          // garantindo que:
          // 1) O scrollportRef seja o ÚNICO scrollport (overflow-x e overflow-y);
          // 2) canScrollHorizontally meça scrollWidth > clientWidth real no scrollportRef;
          // 3) thead.sticky top-0 e th/td.sticky left-0 ancorem no scrollportRef e nunca desapareçam.
          '[&_div]:overflow-visible [&_div]:static',
        )}
        style={{
          maxHeight,
          scrollbarWidth: 'thin',
          scrollbarColor: '#64748b #0f172a',
        }}
      >
        <div
          className="w-full"
          style={{
            minWidth: minContentWidth || undefined,
            overflow: 'visible',
            position: 'static',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
