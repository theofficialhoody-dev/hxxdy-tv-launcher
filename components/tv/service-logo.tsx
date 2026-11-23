import { cn } from '@/lib/utils'
import { services, type ServiceId } from '@/lib/launcher-data'

type LogoProps = { id?: ServiceId; icon?: string; className?: string }

export function ServiceLogo({ id, icon, className }: LogoProps) {
  const service = id ? services[id] : undefined
  const src = service?.logo || icon || '/placeholder.svg'
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local SVG marks with varying aspect ratios
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn('object-contain object-center', service?.mono && 'brightness-0 invert', className)}
    />
  )
}

export function ServiceBadge({
  id,
  name,
  icon,
  withName = false,
  className,
  iconClassName,
}: {
  id?: ServiceId
  name?: string
  icon?: string
  withName?: boolean
  className?: string
  iconClassName?: string
}) {
  const label = (id ? services[id]?.name : undefined) ?? name ?? ''
  if (!id && !icon && !label) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[0.45em] rounded-full px-[0.6em] py-[0.35em]',
        className,
      )}
      style={{
        backgroundColor: 'var(--tv-surface, rgba(0,0,0,0.55))',
        boxShadow: 'inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.16))',
      }}
    >
      {(id || icon) && <ServiceLogo id={id} icon={icon} className={cn('h-[1.1em] w-auto max-w-[3.2em]', iconClassName)} />}
      {withName ? (
        <span className="font-medium text-white/90">{label}</span>
      ) : (
        <span className="sr-only">{`Opens in ${label}`}</span>
      )}
    </span>
  )
}
