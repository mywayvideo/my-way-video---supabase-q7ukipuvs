import { useCallback } from 'react'

export function useHeartAnimation() {
  const playSound = useCallback(() => {
    try {
      const audio = new Audio('/sounds/smooth-notification.mp3')
      audio.volume = 0.4
      audio.play().catch(() => {
        // Fallback Web Audio API for smooth notification (soft ping / gentle chime)
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext
        if (!AudioContext) return
        const ctx = new AudioContext()

        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        // Gentle sine wave for smooth sound
        osc.type = 'sine'
        // Frequencies for a smooth, pleasant chime
        osc.frequency.setValueAtTime(1046.5, ctx.currentTime) // C6

        gain.gain.setValueAtTime(0, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02) // Fast but soft attack
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8) // Long smooth release

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start()
        osc.stop(ctx.currentTime + 0.9)
      })
    } catch (e) {
      console.warn('Audio playback failed', e)
    }
  }, [])

  const trigger = useCallback(
    (e?: React.MouseEvent | HTMLElement | null) => {
      playSound()

      let target: HTMLElement | null = null
      if (e && 'currentTarget' in e) {
        target = e.currentTarget as HTMLElement
      } else if (e instanceof HTMLElement) {
        target = e
      }

      if (target) {
        target.classList.remove('animate-heart-burst')
        void target.offsetWidth // trigger reflow
        target.classList.add('animate-heart-burst')
      }
    },
    [playSound],
  )

  return { trigger, playSound }
}
