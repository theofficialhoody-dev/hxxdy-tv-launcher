'use client'

const KEY = 'tv_launcher_navigation_sound_volume'
const LAST_VOLUME_KEY = 'tv_launcher_navigation_sound_last_volume'
let context: AudioContext | null = null

export function getNavigationSoundVolume(): number {
  const raw = localStorage.getItem(KEY)
  if (raw === null) return 25
  const value = Number(raw)
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 25
}

export function setNavigationSoundVolume(value: number) {
  const next = Math.min(100, Math.max(0, value))
  const previous = getNavigationSoundVolume()
  if (next > 0) localStorage.setItem(LAST_VOLUME_KEY, String(next))
  else if (previous > 0) localStorage.setItem(LAST_VOLUME_KEY, String(previous))
  localStorage.setItem(KEY, String(next))
  window.dispatchEvent(new Event('launcher:sound-volume'))
}

export function getLastNavigationSoundVolume(): number {
  const value = Number(localStorage.getItem(LAST_VOLUME_KEY))
  return Number.isFinite(value) && value > 0 ? Math.min(100, value) : 25
}

export function playNavigationSound(kind: 'move' | 'select' | 'back', volume: number) {
  if (volume <= 0) return
  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume().catch((error) => console.warn('Unable to resume navigation audio', error))
    const now = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(kind === 'select' ? 710 : kind === 'back' ? 420 : 560, now)
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'select' ? 920 : kind === 'back' ? 320 : 640, now + 0.045)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume / 100 * 0.07), now + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.07)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  } catch (error) {
    console.warn('Unable to play navigation sound', error)
  }
}
