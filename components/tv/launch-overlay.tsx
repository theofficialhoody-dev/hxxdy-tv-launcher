import { type ServiceId } from '@/lib/launcher-data'
import { colorWithAlpha, resolveThemeTokens, themeTokensToCssVars, type ThemeConfig } from '@/lib/theme-data'
import { ServiceLogo } from './service-logo'
import { FlowFill } from './flow-fill'

export type LaunchState = {
  key: number
  name: string
  service?: ServiceId
  icon?: string
  action: string
}

export function LaunchOverlay({
  launch,
  currentTheme,
  onDismiss,
}: {
  launch: LaunchState
  currentTheme?: ThemeConfig
  onDismiss: () => void
}) {
  const tokens = resolveThemeTokens(currentTheme)

  return (
    <div
      role="status"
      aria-live="assertive"
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-[3vh] animate-in fade-in duration-200 will-change-[opacity]"
      style={{
        ...themeTokensToCssVars(tokens),
        background: `
          radial-gradient(circle at 50% 45%, ${tokens.glow1}, transparent 60%),
          radial-gradient(circle at 20% 85%, ${tokens.glow2}, transparent 65%),
          ${colorWithAlpha(tokens.bg, 0.94)}
        `,
      }}
    >
      <div className="relative size-[clamp(96px,9vw,180px)] rounded-[28%] isolate animate-in zoom-in-90 duration-400">
        <span
          aria-hidden="true"
          className="tv-halo-glow z-0"
          style={{ '--tv-halo-spread': '-4px', '--tv-halo-blur': '14px' } as React.CSSProperties}
        />
        {/* Sibling of the clipped surface, inside the scaling icon container. */}
        <span
          aria-hidden="true"
          className="tv-conic-border"
          style={{ borderRadius: '28%' } as React.CSSProperties}
        />
        <div
          className="relative z-10 grid size-full place-items-center overflow-hidden rounded-[inherit]"
          style={{
            backgroundColor: tokens.surface,
            boxShadow: '0 24px 60px rgba(0,0,0,0.85)',
          }}
        >
          <ServiceLogo
            id={launch.service}
            icon={launch.icon}
            className={launch.service ? 'relative z-10 h-[44%] w-[62%]' : 'relative z-10 size-full rounded-[inherit] object-cover'}
          />
        </div>
      </div>
      <div className="text-center">
        <p className="text-[clamp(16px,1.4vw,28px)] font-semibold tracking-tight text-white">
          {launch.action}
        </p>
        <p className="mt-1 text-[clamp(12px,0.9vw,18px)] text-white/60">
          {`Opening ${launch.name}`}
        </p>
      </div>
      <div className="h-[3.5px] w-[clamp(120px,10vw,220px)] overflow-hidden rounded-full bg-white/15" aria-hidden="true">
        <div
          className="relative h-full origin-left overflow-hidden rounded-full animate-slide-progress [animation-duration:2000ms]"
          style={{
            boxShadow: `0 0 14px ${tokens.accent}, 0 0 20px ${tokens.glow1}`,
          }}
        >
          <FlowFill />
        </div>
      </div>
    </div>
  )
}
