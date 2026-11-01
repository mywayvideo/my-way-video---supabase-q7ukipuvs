import React, { useRef, useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface SyncedScrollTableProps {
  children: React.ReactNode
  maxHeight?: string // ex: '420px', '480px', '500px'
  minContentWidth?: string // ex: '860px', '1000px'
  className?: string
}

export function SyncedScrollTable({
  children,
  maxHeight = '420px',
  minContentWidth,
  className,
}: SyncedScrollTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const topScrollRef = useRef<HTMLDivElement>(null)
  const bottomScrollRef = useRef<HTMLDivElement>(null)
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

  // Obtém o elemento que efetivamente faz overflow-x
  const getTableScrollElement = useCallback((): HTMLElement | null => {
    const wrapper = bottomScrollRef.current
    if (!wrapper) return null
    return wrapper
  }, [])

  // Sincronização bidirecional de scroll e métricas
  useEffect(() => {
    const topEl = topScrollRef.current
    const tableEl = getTableScrollElement()
    if (!tableEl) return

    let isSyncingTop = false
    let isSyncingBottom = false

    const updateMetrics = () => {
      const currentEl = getTableScrollElement()
      if (!currentEl) return
      setScrollMetrics({
        scrollLeft: currentEl.scrollLeft,
        scrollWidth: currentEl.scrollWidth,
        clientWidth: currentEl.clientWidth,
      })
    }

    const handleTopScroll = () => {
      const currentEl = getTableScrollElement()
      if (!topEl || !currentEl) return
      if (isSyncingTop) {
        isSyncingTop = false
        return
      }
      isSyncingBottom = true
      currentEl.scrollLeft = topEl.scrollLeft
      updateMetrics()
    }

    const handleTableScroll = () => {
      const currentEl = getTableScrollElement()
      if (!currentEl) return
      if (isSyncingBottom) {
        isSyncingBottom = false
        return
      }
      isSyncingTop = true
      if (topEl) {
        topEl.scrollLeft = currentEl.scrollLeft
      }
      updateMetrics()
    }

    if (topEl) {
      topEl.addEventListener('scroll', handleTopScroll, { passive: true })
    }
    tableEl.addEventListener('scroll', handleTableScroll, { passive: true })

    updateMetrics()

    const resizeObserver = new ResizeObserver(() => {
      updateMetrics()
    })

    resizeObserver.observe(tableEl)
    if (tableEl.firstElementChild) {
      resizeObserver.observe(tableEl.firstElementChild)
    }

    return () => {
      if (topEl) {
        topEl.removeEventListener('scroll', handleTopScroll)
      }
      tableEl.removeEventListener('scroll', handleTableScroll)
      resizeObserver.disconnect()
    }
  }, [getTableScrollElement])

  // Drag handlers para o thumb superior
  const handleTopPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const tableEl = getTableScrollElement()
    const trackEl = topTrackRef.current
    if (!tableEl || !trackEl) return

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
    const tableEl = getTableScrollElement()
    if (!tableEl) return

    const { startX, scrollLeft, maxScroll, trackTravel } = topDragStartRef.current
    if (trackTravel <= 0 || maxScroll <= 0) return

    const deltaX = e.clientX - startX
    const scrollDelta = (deltaX / trackTravel) * maxScroll
    const newScrollLeft = Math.max(0, Math.min(maxScroll, scrollLeft + scrollDelta))

    tableEl.scrollLeft = newScrollLeft
    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = newScrollLeft
    }
    setScrollMetrics((prev) => ({ ...prev, scrollLeft: newScrollLeft }))
  }

  const handleTopPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingTop) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setIsDraggingTop(false)
  }

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const trackEl = topTrackRef.current
    const tableEl = getTableScrollElement()
    if (!trackEl || !tableEl) return

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

    tableEl.scrollTo({ left: newScrollLeft, behavior: 'smooth' })
    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = newScrollLeft
    }
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
    <div
      ref={containerRef}
      className={cn(
        'w-full max-w-full overflow-y-auto border-t border-white/10 relative',
        className,
      )}
      style={{ maxHeight }}
    >
      {/* Barra de rolagem horizontal FIXA no TOPO (sticky top-0 z-40) */}
      <div
        className={cn(
          'sticky top-0 z-40 w-full bg-card/95 backdrop-blur-sm border-b border-white/10 select-none px-2 py-1',
          !canScrollHorizontally && 'hidden',
        )}
      >
        <div
          ref={topTrackRef}
          onClick={handleTrackClick}
          className="relative w-full h-3 cursor-pointer flex items-center"
          title="Clique ou arraste a pegada para rolar a tabela horizontalmente"
        >
          {/* Linha guia do trilho no tema escuro */}
          <div className="absolute left-0 right-0 h-2 bg-slate-900/90 border border-slate-700/80 rounded-full shadow-inner" />

          {/* Pegada / Thumb interativa com destaque visual */}
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
              {/* Micro ranhuras visuais decorativas no centro do thumb */}
              <div className="flex gap-0.5 pointer-events-none opacity-85">
                <div className="w-0.5 h-1.5 bg-amber-950/80 rounded-full" />
                <div className="w-0.5 h-1.5 bg-amber-950/80 rounded-full" />
                <div className="w-0.5 h-1.5 bg-amber-950/80 rounded-full" />
              </div>
            </div>
          )}
        </div>

        {/* Elemento de scroll nativo invisível espelhado */}
        <div
          ref={topScrollRef}
          className="absolute inset-0 overflow-x-auto overflow-y-hidden opacity-0 pointer-events-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          tabIndex={-1}
        >
          <div
            style={{
              width:
                scrollMetrics.scrollWidth > 0
                  ? `${scrollMetrics.scrollWidth}px`
                  : minContentWidth || '100%',
              height: '1px',
            }}
          />
        </div>
      </div>

      {/* Wrapper horizontal da tabela com rolagem própria sincronizada */}
      <div
        ref={bottomScrollRef}
        className="overflow-x-auto overflow-y-visible w-full [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-track]:bg-muted/30 [&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-500"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#64748b #1e293b',
        }}
      >
        {children}
      </div>
    </div>
  )
}
