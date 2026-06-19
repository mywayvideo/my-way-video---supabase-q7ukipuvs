import { useState, useEffect } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ScrollToTopButton() {
  const [isScrollVisible, setIsScrollVisible] = useState(false)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>

    const toggleVisibility = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        if (window.scrollY > 200) {
          setIsScrollVisible(true)
        } else {
          setIsScrollVisible(false)
        }
      }, 100)
    }

    window.addEventListener('scroll', toggleVisibility)
    return () => {
      window.removeEventListener('scroll', toggleVisibility)
      clearTimeout(timeoutId)
    }
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  return (
    <button
      className={cn(
        'fixed flex items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md transition-all duration-200 ease-in-out hover:opacity-100 hover:scale-105 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
        'bottom-24 md:bottom-32 right-5 md:right-8',
        'w-[48px] h-[48px] z-[50]',
        isScrollVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4 pointer-events-none',
      )}
      onClick={scrollToTop}
      aria-label="Voltar ao topo"
      tabIndex={isScrollVisible ? 0 : -1}
    >
      <ArrowUp className="h-6 w-6" />
    </button>
  )
}
