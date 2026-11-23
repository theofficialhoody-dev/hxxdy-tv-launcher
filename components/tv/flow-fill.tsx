import { cn } from '@/lib/utils'

/**
 * Animated accent gradient that flows left to right (same look as the old background-position loop).
 * The gradient tile is translated with `transform`, which the compositor animates without repainting
 * on the main thread. The parent must be `relative`.
 *
 * The track only animates while its control reports `active` (`data-tv-flow-active='true'` in
 * globals.css): an unfocused shelf keeps the gradient but holds no promoted, self-invalidating layer.
 * Screens paused outright are already frozen by the `[data-tv-paused]` rule.
 */
export function FlowFill({ className, active = true }: { className?: string; active?: boolean }) {
  return (
    <span aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <span className="tv-flow-track" data-tv-flow-active={active ? 'true' : undefined} />
    </span>
  )
}
