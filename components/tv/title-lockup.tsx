'use client'

import { cn } from '@/lib/utils'

type TitleLockupProps = {
  title: string
  logo?: string
  logoIsAlpha?: boolean
  align?: 'left' | 'center' | 'right'
  className?: string
  fallbackClassName?: string
}

export function TitleLockup({
  title,
  logo,
  logoIsAlpha,
  align = 'center',
  className,
  fallbackClassName,
}: TitleLockupProps) {
  if (!logo) {
    return (
      <p
        className={cn(
          'line-clamp-2 font-semibold leading-[1.12] tracking-tight text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.92)]',
          align === 'left' && 'text-left',
          align === 'center' && 'text-center',
          align === 'right' && 'text-right',
          fallbackClassName,
        )}
      >
        {title}
      </p>
    )
  }

  const isAlpha = logoIsAlpha ?? (logo.endsWith('.svg') || logo.endsWith('.png'))
  const objectPos =
    align === 'left' ? 'object-left-bottom' : align === 'right' ? 'object-right-bottom' : 'object-bottom'
  const maskPos =
    align === 'left' ? 'left bottom' : align === 'right' ? 'right bottom' : 'center bottom'

  if (isAlpha) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local artwork title wordmarks
      <img
        src={logo}
        alt=""
        draggable={false}
        decoding="async"
        className={cn(
          'size-full object-contain drop-shadow-[0_4px_14px_rgba(0,0,0,0.95)]',
          objectPos,
          className,
        )}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'block size-full brightness-125 drop-shadow-[0_4px_14px_rgba(0,0,0,0.92)]',
        className,
      )}
      style={{
        backgroundImage: `url(${logo})`,
        backgroundSize: 'contain',
        backgroundPosition: maskPos,
        backgroundRepeat: 'no-repeat',
        maskImage: `url(${logo})`,
        WebkitMaskImage: `url(${logo})`,
        maskMode: 'luminance',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: maskPos,
        WebkitMaskPosition: maskPos,
      }}
    />
  )
}
