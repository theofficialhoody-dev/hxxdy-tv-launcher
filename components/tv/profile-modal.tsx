'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, EyeOff, Palette, Pencil, Plus, Trash2, X } from 'lucide-react'
import { MAX_PROFILES, type Profile } from '@/lib/profiles'
import {
  BUILT_IN_THEMES,
  colorWithAlpha,
  getContrastText,
  resolveThemeTokens,
  STUDIO_COLOR_SWATCHES,
  themeTokensToCssVars,
  type ThemeConfig,
} from '@/lib/theme-data'
import { cn } from '@/lib/utils'
import { TvKeyboard } from './tv-keyboard'

type ProfileModalProps = {
  isOpen: boolean
  profiles: Profile[]
  activeId: string
  themes?: ThemeConfig[]
  currentTheme?: ThemeConfig
  onClose: () => void
  onSwitch: (id: string) => void
  onAdd: () => void
  onRename: (id: string, name: string) => void
  onUpdateColor?: (id: string, color: string) => void
  onDelete: (id: string) => void
  onRestoreHidden: (id: string) => void
}

type Zone = 'header' | 'cards' | 'actions' | 'colors'
type ActionId = 'rename' | 'color' | 'restore' | 'delete'

export function ProfileModal({
  isOpen,
  profiles,
  activeId,
  themes = BUILT_IN_THEMES,
  currentTheme,
  onClose,
  onSwitch,
  onAdd,
  onRename,
  onUpdateColor,
  onDelete,
  onRestoreHidden,
}: ProfileModalProps) {
  const canAdd = profiles.length < MAX_PROFILES
  const cardCount = profiles.length + (canAdd ? 1 : 0)

  const [zone, setZone] = useState<Zone>('cards')
  const [headerIndex, setHeaderIndex] = useState(0)
  const [cardIndex, setCardIndex] = useState(0)
  const [actionIndex, setActionIndex] = useState(0)
  const [colorIndex, setColorIndex] = useState(0)
  const [pickingColorFor, setPickingColorFor] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [pendingNewRename, setPendingNewRename] = useState(false)

  const headerRefs = useRef<(HTMLButtonElement | null)[]>([])
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const actionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const colorRefs = useRef<(HTMLButtonElement | null)[]>([])
  const pointerReadyRef = useRef(true)

  const resolvedTheme = currentTheme ?? themes[0] ?? BUILT_IN_THEMES[0]
  const tokens = resolveThemeTokens(resolvedTheme)
  const accent = tokens.accent
  const accentText = tokens.accentText
  const glow1 = tokens.glow1
  const glow2 = tokens.glow2

  const headerButtonCount = canAdd ? 2 : 1
  const selectedProfile = profiles[cardIndex]
  const activeProfile = profiles.find((p) => p.id === activeId) ?? profiles[0]

  const actions: { id: ActionId; label: string; icon: typeof Pencil }[] = selectedProfile
    ? [
        { id: 'rename', label: 'Rename', icon: Pencil },
        ...(onUpdateColor ? [{ id: 'color' as const, label: 'Avatar Color', icon: Palette }] : []),
        ...(selectedProfile.hidden.length > 0
          ? [
              {
                id: 'restore' as const,
                label: `Restore Hidden (${selectedProfile.hidden.length})`,
                icon: EyeOff,
              },
            ]
          : []),
        ...(profiles.length > 1
          ? [
              {
                id: 'delete' as const,
                label: confirmDeleteId === selectedProfile.id ? 'Confirm Delete' : 'Delete',
                icon: Trash2,
              },
            ]
          : []),
      ]
    : []

  useEffect(() => {
    if (!isOpen) return
    const onPointerMove = (event: MouseEvent) => {
      if (event.movementX || event.movementY) pointerReadyRef.current = true
    }
    window.addEventListener('mousemove', onPointerMove)
    return () => window.removeEventListener('mousemove', onPointerMove)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setZone('cards')
    setHeaderIndex(0)
    setActionIndex(0)
    setPickingColorFor(null)
    setConfirmDeleteId(null)
    setEditingId(null)
    setPendingNewRename(false)
    const activeIdx = profiles.findIndex((p) => p.id === activeId)
    setCardIndex(activeIdx >= 0 ? activeIdx : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // When a brand-new profile is created, immediately focus it and open TvKeyboard to name it
  useEffect(() => {
    if (!isOpen || !pendingNewRename) return
    const newlyCreated = profiles[profiles.length - 1]
    if (!newlyCreated) return
    setPendingNewRename(false)
    setCardIndex(profiles.length - 1)
    setZone('cards')
    setDraftName(newlyCreated.name)
    setEditingId(newlyCreated.id)
  }, [isOpen, pendingNewRename, profiles])

  // Keep DOM focus synchronized with spatial D-Pad state
  useEffect(() => {
    if (!isOpen || editingId) return
    if (zone === 'header') {
      headerRefs.current[Math.min(headerIndex, headerButtonCount - 1)]?.focus({ preventScroll: true })
    } else if (zone === 'cards') {
      cardRefs.current[Math.min(cardIndex, cardCount - 1)]?.focus({ preventScroll: true })
    } else if (zone === 'actions' && actions.length > 0) {
      actionRefs.current[Math.min(actionIndex, actions.length - 1)]?.focus({ preventScroll: true })
    } else if (zone === 'colors' && pickingColorFor) {
      colorRefs.current[Math.min(colorIndex, STUDIO_COLOR_SWATCHES.length)]?.focus({ preventScroll: true })
    }
  }, [
    isOpen,
    editingId,
    zone,
    headerIndex,
    headerButtonCount,
    cardIndex,
    cardCount,
    actionIndex,
    actions.length,
    pickingColorFor,
    colorIndex,
  ])

  const commitRename = useCallback(() => {
    if (!editingId) return
    const currentName = profiles.find((p) => p.id === editingId)?.name || 'Profile'
    const cleaned = draftName.trim().slice(0, 14)
    onRename(editingId, cleaned || currentName)
    setEditingId(null)
  }, [draftName, editingId, onRename, profiles])

  const cancelRename = useCallback(() => {
    setEditingId(null)
  }, [])

  const triggerAddProfile = useCallback(() => {
    if (!canAdd) return
    setConfirmDeleteId(null)
    setPickingColorFor(null)
    setPendingNewRename(true)
    onAdd()
  }, [canAdd, onAdd])

  const activateCard = useCallback(
    (index: number) => {
      setConfirmDeleteId(null)
      setPickingColorFor(null)
      if (index >= profiles.length) {
        triggerAddProfile()
        return
      }
      const target = profiles[index]
      if (!target) return
      if (target.id !== activeId) {
        onSwitch(target.id)
      }
      onClose()
    },
    [activeId, onClose, onSwitch, profiles, triggerAddProfile],
  )

  const runAction = useCallback(
    (id: ActionId) => {
      if (!selectedProfile) return
      if (id === 'rename') {
        setConfirmDeleteId(null)
        setPickingColorFor(null)
        setDraftName(selectedProfile.name)
        setEditingId(selectedProfile.id)
      } else if (id === 'color') {
        setConfirmDeleteId(null)
        const currentColorIdx = STUDIO_COLOR_SWATCHES.findIndex(
          (sw) => sw.hex.toLowerCase() === selectedProfile.color.toLowerCase(),
        )
        setColorIndex(currentColorIdx >= 0 ? currentColorIdx : 0)
        setPickingColorFor(selectedProfile.id)
        setZone('colors')
      } else if (id === 'restore') {
        setConfirmDeleteId(null)
        onRestoreHidden(selectedProfile.id)
        setActionIndex(0)
      } else if (id === 'delete') {
        if (confirmDeleteId === selectedProfile.id) {
          onDelete(selectedProfile.id)
          setConfirmDeleteId(null)
          setPickingColorFor(null)
          setZone('cards')
          setCardIndex((prev) => Math.max(0, Math.min(prev, profiles.length - 2)))
        } else {
          setConfirmDeleteId(selectedProfile.id)
        }
      }
    },
    [confirmDeleteId, onDelete, onRestoreHidden, profiles.length, selectedProfile],
  )

  // D-Pad & Remote Control Listener
  useEffect(() => {
    if (!isOpen || editingId) return

    const onKeyDown = (event: KeyboardEvent) => {
      const { key, keyCode: code } = event

      const isBack =
        ['Escape', 'Backspace', 'Back', 'GoBack', 'BrowserBack'].includes(key) ||
        code === 27 ||
        code === 8 ||
        code === 4
      const isSelect =
        ['Enter', ' ', 'Select', 'Ok', 'MediaSelect'].includes(key) ||
        code === 13 ||
        code === 23 ||
        code === 66

      if (isBack) {
        event.preventDefault()
        if (pickingColorFor) {
          setPickingColorFor(null)
          setZone('actions')
        } else if (confirmDeleteId) {
          setConfirmDeleteId(null)
        } else if (zone === 'actions' || zone === 'header') {
          setZone('cards')
        } else {
          onClose()
        }
        return
      }

      if (key === 'ArrowLeft' || code === 37 || code === 21) {
        pointerReadyRef.current = false
        event.preventDefault()
        setConfirmDeleteId(null)
        if (zone === 'header') {
          setHeaderIndex((prev) => Math.max(0, prev - 1))
        } else if (zone === 'cards') {
          setPickingColorFor(null)
          setCardIndex((prev) => Math.max(0, prev - 1))
          setActionIndex(0)
        } else if (zone === 'actions') {
          setActionIndex((prev) => Math.max(0, prev - 1))
        } else if (zone === 'colors') {
          setColorIndex((prev) => Math.max(0, prev - 1))
        }
        return
      }

      if (key === 'ArrowRight' || code === 39 || code === 22) {
        pointerReadyRef.current = false
        event.preventDefault()
        setConfirmDeleteId(null)
        if (zone === 'header') {
          setHeaderIndex((prev) => Math.min(headerButtonCount - 1, prev + 1))
        } else if (zone === 'cards') {
          setPickingColorFor(null)
          setCardIndex((prev) => Math.min(cardCount - 1, prev + 1))
          setActionIndex(0)
        } else if (zone === 'actions') {
          setActionIndex((prev) => Math.min(Math.max(0, actions.length - 1), prev + 1))
        } else if (zone === 'colors') {
          setColorIndex((prev) => Math.min(STUDIO_COLOR_SWATCHES.length, prev + 1))
        }
        return
      }

      if (key === 'ArrowUp' || code === 38 || code === 19) {
        pointerReadyRef.current = false
        event.preventDefault()
        setConfirmDeleteId(null)
        if (zone === 'colors') {
          if (colorIndex >= 12) {
            setColorIndex((prev) => Math.max(0, prev - 12))
          } else {
            setPickingColorFor(null)
            setZone('actions')
          }
        } else if (zone === 'actions') {
          setZone('cards')
        } else if (zone === 'cards') {
          setHeaderIndex(headerButtonCount - 1)
          setZone('header')
        }
        return
      }

      if (key === 'ArrowDown' || code === 40 || code === 20) {
        pointerReadyRef.current = false
        event.preventDefault()
        setConfirmDeleteId(null)
        if (zone === 'header') {
          setZone('cards')
        } else if (zone === 'cards' && cardIndex < profiles.length && actions.length > 0) {
          setActionIndex(0)
          setZone('actions')
        } else if (zone === 'colors' && colorIndex < 12) {
          setColorIndex((prev) => Math.min(STUDIO_COLOR_SWATCHES.length, prev + 12))
        }
        return
      }

      if (isSelect) {
        event.preventDefault()
        if (event.repeat) return
        if (zone === 'header') {
          if (canAdd && headerIndex === 0) triggerAddProfile()
          else onClose()
        } else if (zone === 'cards') {
          activateCard(cardIndex)
        } else if (zone === 'actions') {
          const targetAction = actions[Math.min(actionIndex, actions.length - 1)]
          if (targetAction) runAction(targetAction.id)
        } else if (zone === 'colors' && pickingColorFor) {
          if (colorIndex >= STUDIO_COLOR_SWATCHES.length) {
            setPickingColorFor(null)
            setZone('actions')
          } else {
            const nextColor = STUDIO_COLOR_SWATCHES[colorIndex]?.hex
            if (nextColor && onUpdateColor) onUpdateColor(pickingColorFor, nextColor)
          }
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    isOpen,
    editingId,
    zone,
    headerIndex,
    headerButtonCount,
    cardIndex,
    cardCount,
    actionIndex,
    actions,
    colorIndex,
    pickingColorFor,
    confirmDeleteId,
    canAdd,
    profiles.length,
    onClose,
    onUpdateColor,
    activateCard,
    runAction,
    triggerAddProfile,
  ])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="tv-menu-focus fixed inset-0 z-50 flex flex-col overflow-hidden text-white select-none animate-in fade-in duration-200"
      style={{
        ...themeTokensToCssVars(tokens),
        backgroundColor: tokens.bg,
      }}
    >
      {/* Atmospheric Theme Backdrop matching AppsMenuModal & ThemeModal */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 85% 55% at 72% 12%, ${glow1}, transparent 68%),
            radial-gradient(ellipse 70% 50% at 18% 86%, ${glow2}, transparent 70%),
            radial-gradient(circle at 50% 45%, transparent 38%, rgba(0, 0, 0, 0.72) 100%)
          `,
        }}
      />

      {/* Single-Row Header matching AppsMenuModal & ThemeModal */}
      <header
        className="relative z-20 flex shrink-0 items-center justify-between gap-4 border-b px-[5vw] pt-[3.5vh] pb-[2vh]"
        style={{ borderColor: tokens.glassBorder }}
      >
        <div className="min-w-0">
          <h2
            id="profile-modal-title"
            className="text-[clamp(22px,1.9vw,34px)] font-bold leading-none tracking-tight text-white"
          >
            Profiles
          </h2>
          <p className="mt-1.5 truncate text-[clamp(11px,0.8vw,15px)] font-medium tabular-nums text-white/55">
            {profiles.length} of {MAX_PROFILES} profiles · Active: {activeProfile?.name ?? 'Default'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-[0.75vw]">
          {canAdd && (
            <button
              ref={(el) => {
                headerRefs.current[0] = el
              }}
              type="button"
              onMouseEnter={() => {
                if (!pointerReadyRef.current) return
                setZone('header')
                setHeaderIndex(0)
              }}
              onClick={triggerAddProfile}
              className={cn(
                'flex h-[clamp(36px,2.45vw,44px)] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-full px-4 text-[clamp(11px,0.8vw,14px)] font-medium outline-none transition-all duration-150',
                zone === 'header' && headerIndex === 0 ? 'scale-[1.03]' : 'text-white/85 hover:text-white',
              )}
              style={
                zone === 'header' && headerIndex === 0
                  ? {
                      backgroundColor: accent,
                      color: accentText,
                      boxShadow: `0 0 18px ${glow1}`,
                    }
                  : {
                      backgroundColor: tokens.surface,
                      boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                    }
              }
            >
              <Plus className="size-3.5 stroke-[2.4]" />
              <span>Add Profile</span>
            </button>
          )}

          <button
            ref={(el) => {
              headerRefs.current[canAdd ? 1 : 0] = el
            }}
            type="button"
            onMouseEnter={() => {
              if (!pointerReadyRef.current) return
              setZone('header')
              setHeaderIndex(canAdd ? 1 : 0)
            }}
            onClick={onClose}
            aria-label="Close profiles"
            className={cn(
              'grid size-[clamp(36px,2.45vw,44px)] shrink-0 place-items-center rounded-full outline-none transition-all duration-150',
              zone === 'header' && headerIndex === (canAdd ? 1 : 0)
                ? 'scale-[1.04] text-white'
                : 'text-white/85 hover:text-white',
            )}
            style={{
              backgroundColor:
                zone === 'header' && headerIndex === (canAdd ? 1 : 0) ? tokens.surfaceElevated : tokens.surface,
              boxShadow:
                zone === 'header' && headerIndex === (canAdd ? 1 : 0)
                  ? `inset 0 0 0 1.5px ${accent}, 0 0 18px ${glow1}`
                  : `inset 0 0 0 1px ${tokens.glassBorder}`,
            }}
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      {/* Center Stage: Apple TV 4K + Google TV Smoked-Glass Profile Cards */}
      <div
        className={cn(
          'relative z-10 my-auto flex flex-col items-center justify-center px-[5vw] transition-transform duration-200',
          editingId ? '-translate-y-[12vh]' : '',
        )}
      >
        <ul className="no-scrollbar flex max-w-full items-stretch justify-center gap-[1.8vw] overflow-x-auto px-4 py-[2.5vh]">
          {profiles.map((profile, index) => {
            const isFocused = zone === 'cards' && cardIndex === index
            const isActive = profile.id === activeId
            const profileThemeName =
              themes.find((t) => t.id === profile.themeId)?.name ?? BUILT_IN_THEMES[0].name
            const hiddenCount = profile.hidden.length

            return (
              <li key={profile.id} className="shrink-0">
                <button
                  ref={(el) => {
                    cardRefs.current[index] = el
                  }}
                  type="button"
                  onMouseEnter={() => {
                    if (!pointerReadyRef.current) return
                    setConfirmDeleteId(null)
                    setPickingColorFor(null)
                    setZone('cards')
                    setCardIndex(index)
                  }}
                  onClick={() => activateCard(index)}
                  aria-label={`Switch to ${profile.name}${isActive ? ' (active)' : ''}`}
                  className={cn(
                    'group relative flex w-[clamp(148px,13vw,224px)] flex-col items-center rounded-[clamp(18px,1.4vw,26px)] px-[1.2vw] pt-[clamp(22px,2.4vh,34px)] pb-[clamp(16px,1.8vh,24px)] text-center outline-none transition-transform duration-150 ease-out',
                    isFocused ? 'z-10 scale-[1.05]' : 'scale-100',
                  )}
                  style={{
                    backgroundColor: isFocused ? tokens.surface : tokens.glass,
                    boxShadow: isFocused
                      ? `inset 0 0 0 1.5px ${accent}, 0 22px 48px -10px rgba(0,0,0,0.9), 0 0 24px ${glow1}`
                      : `inset 0 0 0 1px ${tokens.glassBorder}`,
                  }}
                >
                  {/* Active Indicator Dot */}
                  {isActive && (
                    <span
                      aria-label="Active profile"
                      className="absolute right-3.5 top-3.5 grid size-5 place-items-center rounded-full shadow-sm"
                      style={{ backgroundColor: accent, color: accentText }}
                    >
                      <Check className="size-3 stroke-[3]" />
                    </span>
                  )}

                  {/* Circular Avatar Emblem matching TopHeader */}
                  <div
                    className={cn(
                      'relative grid size-[clamp(64px,5.5vw,96px)] place-items-center rounded-full text-[clamp(26px,2.3vw,40px)] font-bold leading-none shadow-[0_10px_24px_rgba(0,0,0,0.5)] transition-transform duration-150',
                      isFocused ? 'scale-[1.03]' : 'opacity-90 group-hover:opacity-100',
                    )}
                    style={{
                      backgroundColor: profile.color,
                      color: getContrastText(profile.color),
                      boxShadow: isActive
                        ? `0 0 0 2px ${accent}, 0 10px 24px rgba(0,0,0,0.55)`
                        : 'inset 0 0 0 1px rgba(255,255,255,0.22), 0 10px 24px rgba(0,0,0,0.5)',
                    }}
                  >
                    {profile.name.slice(0, 1).toUpperCase()}
                  </div>

                  {/* Profile Title & Quiet Unboxed Metadata */}
                  <span
                    className={cn(
                      'mt-[1.8vh] w-full truncate text-[clamp(15px,1.08vw,20px)] font-semibold tracking-tight transition-colors',
                      isFocused ? 'text-white' : 'text-white/85 group-hover:text-white',
                    )}
                    style={isFocused ? { color: accent } : undefined}
                  >
                    {profile.name}
                  </span>

                  <span className="mt-1 w-full truncate text-[clamp(10px,0.72vw,13px)] text-white/50">
                    {isActive ? `Active · ${profileThemeName}` : profileThemeName}
                    {hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}
                  </span>
                </button>
              </li>
            )
          })}

          {canAdd && (
            <li className="shrink-0">
              <button
                ref={(el) => {
                  cardRefs.current[profiles.length] = el
                }}
                type="button"
                onMouseEnter={() => {
                  if (!pointerReadyRef.current) return
                  setConfirmDeleteId(null)
                  setPickingColorFor(null)
                  setZone('cards')
                  setCardIndex(profiles.length)
                }}
                onClick={triggerAddProfile}
                aria-label="Add a new profile"
                className={cn(
                  'group relative flex w-[clamp(148px,13vw,224px)] flex-col items-center rounded-[clamp(18px,1.4vw,26px)] px-[1.2vw] pt-[clamp(22px,2.4vh,34px)] pb-[clamp(16px,1.8vh,24px)] text-center outline-none transition-transform duration-150 ease-out',
                  zone === 'cards' && cardIndex === profiles.length ? 'z-10 scale-[1.05]' : 'scale-100',
                )}
                style={{
                  backgroundColor:
                    zone === 'cards' && cardIndex === profiles.length ? tokens.surface : tokens.glass,
                  boxShadow:
                    zone === 'cards' && cardIndex === profiles.length
                      ? `inset 0 0 0 1.5px ${accent}, 0 22px 48px -10px rgba(0,0,0,0.9), 0 0 24px ${glow1}`
                      : `inset 0 0 0 1px ${tokens.glassBorder}`,
                }}
              >
                <div
                  className={cn(
                    'grid size-[clamp(64px,5.5vw,96px)] place-items-center rounded-full border border-dashed transition-colors duration-150',
                    zone === 'cards' && cardIndex === profiles.length
                      ? 'border-transparent bg-white/15 text-white'
                      : 'border-white/25 bg-white/[0.05] text-white/65 group-hover:text-white',
                  )}
                  style={
                    zone === 'cards' && cardIndex === profiles.length
                      ? { color: accent }
                      : undefined
                  }
                >
                  <Plus className="size-[38%] stroke-[2]" />
                </div>

                <span
                  className={cn(
                    'mt-[1.8vh] w-full truncate text-[clamp(15px,1.08vw,20px)] font-semibold tracking-tight transition-colors',
                    zone === 'cards' && cardIndex === profiles.length
                      ? 'text-white'
                      : 'text-white/75 group-hover:text-white',
                  )}
                  style={
                    zone === 'cards' && cardIndex === profiles.length
                      ? { color: accent }
                      : undefined
                  }
                >
                  Add Profile
                </span>

                <span className="mt-1 w-full truncate text-[clamp(10px,0.72vw,13px)] text-white/45">
                  Personalize home
                </span>
              </button>
            </li>
          )}
        </ul>

        {/* Contextual Profile Management Bar (Fixed height slot so cards never jump) */}
        <div className="mt-[2vh] flex min-h-[52px] items-center justify-center">
          {pickingColorFor && selectedProfile?.id === pickingColorFor ? (
            <div
              className="w-full max-w-[660px] rounded-2xl px-4 py-3"
              style={{
                backgroundColor: tokens.surface,
                boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}, 0 14px 36px rgba(0,0,0,0.65)`,
              }}
            >
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                  Theme Studio Colors
                </span>
                <span className="text-xs font-medium text-white/80">
                  {STUDIO_COLOR_SWATCHES.find(
                    (sw) => sw.hex.toLowerCase() === selectedProfile.color.toLowerCase(),
                  )?.label ?? selectedProfile.color.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-8 items-center gap-2 sm:grid-cols-12">
                {STUDIO_COLOR_SWATCHES.map((sw, idx) => {
                  const isSelectedColor = selectedProfile.color.toLowerCase() === sw.hex.toLowerCase()
                  const isSwatchFocused = zone === 'colors' && colorIndex === idx
                  const ringColor = sw.hex === '#000000' ? '#ffffff' : sw.hex
                  return (
                    <button
                      key={sw.label}
                      ref={(el) => {
                        colorRefs.current[idx] = el
                      }}
                      type="button"
                      title={sw.label}
                      aria-label={`Select avatar color ${sw.label} (${sw.hex})`}
                      onMouseEnter={() => {
                        if (!pointerReadyRef.current) return
                        setZone('colors')
                        setColorIndex(idx)
                      }}
                      onClick={() => onUpdateColor?.(pickingColorFor, sw.hex)}
                      className={cn(
                        'mx-auto grid size-7 place-items-center rounded-full outline-none transition-transform duration-150',
                        isSwatchFocused ? 'scale-120' : 'hover:scale-110',
                      )}
                      style={{
                        backgroundColor: sw.hex,
                        boxShadow: isSwatchFocused
                          ? `0 0 0 2px ${tokens.surface}, 0 0 0 3.5px ${ringColor}, 0 0 14px ${colorWithAlpha(ringColor, 0.5)}`
                          : isSelectedColor
                            ? `0 0 0 2px ${tokens.surface}, 0 0 0 3px ${ringColor}`
                            : 'inset 0 0 0 1px rgba(255,255,255,0.28)',
                      }}
                    >
                      {isSelectedColor && (
                        <Check
                          className="size-3.5 stroke-[3]"
                          style={{ color: getContrastText(sw.hex) }}
                        />
                      )}
                    </button>
                  )
                })}

                <button
                  ref={(el) => {
                    colorRefs.current[STUDIO_COLOR_SWATCHES.length] = el
                  }}
                  type="button"
                  aria-label="Done picking avatar color"
                  onMouseEnter={() => {
                    if (!pointerReadyRef.current) return
                    setZone('colors')
                    setColorIndex(STUDIO_COLOR_SWATCHES.length)
                  }}
                  onClick={() => {
                    setPickingColorFor(null)
                    setZone('actions')
                  }}
                  className="mx-auto grid size-7 place-items-center rounded-full text-[11px] font-bold outline-none transition-transform duration-150"
                  style={
                    zone === 'colors' && colorIndex === STUDIO_COLOR_SWATCHES.length
                      ? { backgroundColor: accent, color: accentText, boxShadow: `0 0 14px ${glow1}` }
                      : {
                          backgroundColor: tokens.glass,
                          color: '#ffffff',
                          boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                        }
                  }
                >
                  <Check className="size-3.5 stroke-[2.8]" />
                </button>
              </div>
            </div>
          ) : selectedProfile ? (
            <div className="flex flex-wrap items-center justify-center gap-[0.65vw]">
              {actions.map((action, idx) => {
                const Icon = action.icon
                const isFocused = zone === 'actions' && actionIndex === idx
                const isDanger = action.id === 'delete' && confirmDeleteId === selectedProfile.id

                return (
                  <button
                    key={action.id}
                    ref={(el) => {
                      actionRefs.current[idx] = el
                    }}
                    type="button"
                    onMouseEnter={() => {
                      if (!pointerReadyRef.current) return
                      setZone('actions')
                      setActionIndex(idx)
                    }}
                    onClick={() => {
                      setZone('actions')
                      setActionIndex(idx)
                      runAction(action.id)
                    }}
                    className={cn(
                      'flex h-[clamp(36px,2.45vw,44px)] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-full px-4 text-[clamp(11px,0.8vw,14px)] font-medium outline-none transition-all duration-150',
                      isFocused
                        ? 'scale-[1.03]'
                        : isDanger
                          ? 'bg-rose-500/20 text-rose-200 ring-1 ring-inset ring-rose-400/50 hover:bg-rose-500/30'
                          : 'text-white/80 hover:text-white',
                    )}
                    style={
                      isFocused
                        ? isDanger
                          ? { backgroundColor: '#f43f5e', color: '#ffffff' }
                          : { backgroundColor: accent, color: accentText, boxShadow: `0 0 18px ${glow1}` }
                        : !isDanger
                          ? {
                              backgroundColor: tokens.surface,
                              boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                            }
                          : undefined
                    }
                  >
                    <Icon className="size-3.5" />
                    <span>{action.label}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div aria-hidden="true" className="h-[clamp(36px,2.45vw,44px)]" />
          )}
        </div>
      </div>

      {/* Custom Remote-Friendly Smoked-Glass Keyboard for Renaming & Naming New Profiles */}
      <TvKeyboard
        isOpen={Boolean(editingId)}
        mode="text"
        value={draftName}
        placeholder="Profile name"
        submitLabel="Save"
        currentTheme={resolvedTheme}
        onChange={(next) => setDraftName(next.slice(0, 14))}
        onSubmit={commitRename}
        onClose={cancelRename}
      />
    </div>
  )
}
