export const playSmoothSound = () => {
  const audio = new Audio('/sounds/smooth-notification.mp3')
  audio.volume = 0.5
  audio.play().catch(() => {
    // Fallback to Web Audio API if audio file fails to load or play
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) return

      const ctx = new AudioContextClass()

      // Smooth Notification (Soft ping/chime)
      // Two gentle sine waves, slightly offset

      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(880, ctx.currentTime) // A5

      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.08) // C#6

      gain1.gain.setValueAtTime(0, ctx.currentTime)
      gain1.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.03)
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)

      gain2.gain.setValueAtTime(0, ctx.currentTime + 0.08)
      gain2.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.11)
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)

      osc1.connect(gain1)
      gain1.connect(ctx.destination)

      osc2.connect(gain2)
      gain2.connect(ctx.destination)

      osc1.start(ctx.currentTime)
      osc2.start(ctx.currentTime + 0.08)
      osc1.stop(ctx.currentTime + 0.5)
      osc2.stop(ctx.currentTime + 0.6)
    } catch (e) {
      // Ignore errors
    }
  })
}

// Preserve existing exports in case they are used elsewhere
export const playCrystalSound = playSmoothSound
export const playCoinSound = playSmoothSound
