'use client'

import { memo, useEffect, useState } from 'react'
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Moon, Sun } from 'lucide-react'
import { isNative } from '@/lib/native-bridge'

type Weather = { temperature: number; code: number; isDay: boolean }

function weatherAppearance(weather: Weather) {
  const { code, isDay } = weather
  if (code === 0) return { Icon: isDay ? Sun : Moon, label: 'Clear' }
  if (code <= 2) return { Icon: CloudSun, label: 'Partly cloudy' }
  if (code === 3) return { Icon: Cloud, label: 'Cloudy' }
  if (code === 45 || code === 48) return { Icon: CloudFog, label: 'Fog' }
  if (code >= 95) return { Icon: CloudLightning, label: 'Thunderstorm' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { Icon: CloudSnow, label: 'Snow' }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { Icon: CloudRain, label: 'Rain' }
  return { Icon: Cloud, label: 'Weather' }
}

function getFormattedTime(is24h: boolean) {
  const now = new Date()
  let hours = now.getHours()
  const minutes = now.getMinutes().toString().padStart(2, '0')
  if (is24h) {
    return {
      time: `${hours.toString().padStart(2, '0')}:${minutes}`,
      period: '',
    }
  }
  const period = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return {
    time: `${hours}:${minutes}`,
    period,
  }
}

export const StatusClock = memo(function StatusClock({
  clock24h = false,
  showWeather = true,
  embedded = false,
}: {
  clock24h?: boolean
  showWeather?: boolean
  embedded?: boolean
}) {
  const [timeState, setTimeState] = useState(() => getFormattedTime(clock24h))
  const [weather, setWeather] = useState<Weather | null>(null)

  useEffect(() => {
    // The shell serves /__weather from the box's own location; a browser build has no such route, so it stays quiet there.
    if (!showWeather || !isNative()) {
      setWeather(null)
      return
    }
    let active = true
    let pending = false
    let timer: number | undefined
    const refresh = async () => {
      if (pending || !active) return
      window.clearTimeout(timer)
      pending = true
      let nextRefresh = Date.now() + 5 * 60 * 1000
      try {
        const response = await fetch('/__weather', { cache: 'no-store' })
        const data = (await response.json()) as Weather & { refreshAt?: number; retryAt?: number }
        if (!response.ok) {
          if (Number.isFinite(data.retryAt)) nextRefresh = data.retryAt!
          throw new Error('Weather unavailable')
        }
        if (
          !Number.isFinite(data.temperature) ||
          !Number.isInteger(data.code) ||
          typeof data.isDay !== 'boolean' ||
          !Number.isFinite(data.refreshAt)
        ) {
          throw new Error('Invalid weather')
        }
        nextRefresh = data.refreshAt!
        if (active) setWeather(data)
      } catch {
        if (active) setWeather(null)
      } finally {
        pending = false
        if (active) timer = window.setTimeout(refresh, Math.max(1000, nextRefresh - Date.now()))
      }
    }
    void refresh()
    window.addEventListener('launcher:resume', refresh)
    return () => {
      active = false
      window.clearTimeout(timer)
      window.removeEventListener('launcher:resume', refresh)
    }
  }, [showWeather])

  const appearance = weather ? weatherAppearance(weather) : null

  useEffect(() => {
    const syncTime = () => {
      const next = getFormattedTime(clock24h)
      setTimeState((prev) => (prev.time === next.time && prev.period === next.period ? prev : next))
    }
    syncTime()
    const interval = window.setInterval(syncTime, 1000)
    return () => window.clearInterval(interval)
  }, [clock24h])

  return (
    <div
      className={
        embedded
          ? 'flex items-center gap-[clamp(7px,0.62vw,12px)] whitespace-nowrap text-[clamp(12px,0.94vw,18px)] font-medium tabular-nums text-white/95'
          : 'flex items-center gap-[1vw] text-[clamp(16px,1.3vw,26px)] font-medium tabular-nums text-white/95 [text-shadow:0_2px_14px_rgba(0,0,0,0.7)]'
      }
    >
      {showWeather && weather && appearance && (
        <>
          <span
            className="flex items-center gap-[0.35em]"
            aria-label={`${appearance.label}, ${Math.round(weather.temperature)} degrees Fahrenheit`}
          >
            <appearance.Icon
              className="size-[1.12em]"
              style={{ color: 'var(--tv-accent, #ffffff)' }}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>{Math.round(weather.temperature)}°</span>
          </span>
          <span
            className="h-[0.92em] w-px"
            style={{ backgroundColor: 'var(--tv-glass-border, rgba(255,255,255,0.25))' }}
            aria-hidden="true"
          />
        </>
      )}
      <time suppressHydrationWarning className="inline-flex items-baseline font-semibold tracking-tight text-white">
        <span>{timeState.time}</span>
        {timeState.period && (
          <span className="ml-[0.28em] text-[0.76em] font-semibold tracking-wide text-white/80">
            {timeState.period}
          </span>
        )}
      </time>
    </div>
  )
})
