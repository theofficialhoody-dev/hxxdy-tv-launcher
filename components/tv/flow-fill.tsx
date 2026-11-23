import { cn } from '@/lib/utils'

/**
 * Animated accent gradient that flows left to right (same look as the old background-position loop).
 * The gradient tile is translated with `transform`, which the compositor animates without repainting
 * on the main thread. The parent must be `relative`.
 */
export function FlowFill({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <span className="tv-flow-track" />
    </span>
  )
}
