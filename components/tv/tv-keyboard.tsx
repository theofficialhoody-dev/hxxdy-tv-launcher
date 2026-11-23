'use client'

import { useEffect, useState } from 'react'
import { CornerDownLeft, Delete, Pencil, Search, Space, X } from 'lucide-react'
import { colorWithAlpha, resolveThemeTokens, type ThemeConfig } from '@/lib/theme-data'
import { cn } from '@/lib/utils'

type KeyDef = {
  id: string
  label: string
  value?: string
  action?: 'symbols' | 'space' | 'backspace' | 'clear' | 'submit'
  span?: number
}

const LETTER_ROWS: KeyDef[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((c) => ({ id: c, label: c, value: c })),
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'].map((c) => ({ id: c, label: c, value: c })),
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '-'].map((c) => ({ id: c, label: c, value: c })),
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '_', '+'].map((c) => ({ id: c, label: c, value: c })),
  [
    { id: 'symbols', label: '123', action: 'symbols', span: 2 },
    { id: 'space', label: 'Space', action: 'space', span: 3 },
    { id: 'backspace', label: 'Delete', action: 'backspace', span: 2 },
    { id: 'clear', label: 'Clear', action: 'clear', span: 1 },
    { id: 'submit', label: 'Search', action: 'submit', span: 2 },
  ],
]

const SYMBOL_ROWS: KeyDef[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((c) => ({ id: c, label: c, value: c })),
  ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'].map((c) => ({ id: c, label: c, value: c })),
  ['-', '_', '=', '+', '[', ']', '{', '}', '/', '\\'].map((c) => ({ id: c, label: c, value: c })),
  [':', ';', "'", '"', ',', '.', '<', '>', '?', '~'].map((c) => ({ id: c, label: c, value: c })),
  [
    { id: 'symbols', label: 'abc', action: 'symbols', span: 2 },
    { id: 'space', label: 'Space', action: 'space', span: 3 },
    { id: 'backspace', label: 'Delete', action: 'backspace', span: 2 },
    { id: 'clear', label: 'Clear', action: 'clear', span: 1 },
    { id: 'submit', label: 'Search', action: 'submit', span: 2 },
  ],
]

type TvKeyboardProps = {
  isOpen: boolean
  value: string
  placeholder: string
  submitLabel?: string
  mode?: 'search' | 'text'
  currentTheme: ThemeConfig
  onChange: (next: string) => void
  onSubmit: () => void
  onClose: () => void
}

export function TvKeyboard({
  isOpen,
  value,
  placeholder,
  submitLabel = 'Done',
  mode = 'search',
  currentTheme,
  onChange,
  onSubmit,
  onClose,
}: TvKeyboardProps) {
  const [symbolsMode, setSymbolsMode] = useState(false)
  const [row, setRow] = useState(1)
  const [col, setCol] = useState(0)

  const rows = symbolsMode ? SYMBOL_ROWS : LETTER_ROWS
  const tokens = resolveThemeTokens(currentTheme)
  const accent = tokens.accent
  const accentText = tokens.accentText

  useEffect(() => {
    if (!isOpen) return
    setSymbolsMode(false)
    setRow(1)
    setCol(0)
  }, [isOpen])

  const triggerKey = (keyDef: KeyDef) => {
    if (keyDef.value !== undefined) {
      onChange(value + keyDef.value)
      return
    }
    switch (keyDef.action) {
      case 'symbols':
        setSymbolsMode((s) => !s)
        break
      case 'space':
        onChange(value + ' ')
        break
      case 'backspace':
        onChange(value.slice(0, -1))
        break
      case 'clear':
        onChange('')
        break
      case 'submit':
        onSubmit()
        break
    }
  }

  // Compute proportional horizontal position so vertical Up/Down feels natural across uneven rows
  const colCenterRatio = (r: number, c: number) => {
    const items = rows[r]
    const totalCols = items.reduce((acc, item) => acc + (item.span ?? 1), 0)
    let cursor = 0
    for (let i = 0; i < items.length; i++) {
      const span = items[i].span ?? 1
      if (i === c) return (cursor + span / 2) / totalCols
      cursor += span
    }
    return 0.5
  }

  const findNearestCol = (targetRow: number, targetRatio: number) => {
    const items = rows[targetRow]
    const totalCols = items.reduce((acc, item) => acc + (item.span ?? 1), 0)
    let bestIdx = 0
    let bestDist = Infinity
    let cursor = 0
    for (let i = 0; i < items.length; i++) {
      const span = items[i].span ?? 1
      const center = (cursor + span / 2) / totalCols
      const dist = Math.abs(center - targetRatio)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
      cursor += span
    }
    return bestIdx
  }

  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      const { key, keyCode: code, ctrlKey, metaKey, altKey } = event

      // Android TV Back / Escape closes keyboard
      if (
        ['Escape', 'Back', 'GoBack', 'BrowserBack'].includes(key) ||
        code === 4 ||
        code === 27
      ) {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }

      // Backspace key deletes character
      if (key === 'Backspace' || code === 8) {
        event.preventDefault()
        event.stopPropagation()
        onChange(value.slice(0, -1))
        return
      }

      // D-Pad navigation (standard + Android TV keyCodes 19/20/21/22)
      if (key === 'ArrowUp' || code === 38 || code === 19) {
        event.preventDefault()
        event.stopPropagation()
        if (row > 0) {
          const ratio = colCenterRatio(row, col)
          const nextRow = row - 1
          setRow(nextRow)
          setCol(findNearestCol(nextRow, ratio))
        }
        return
      }

      if (key === 'ArrowDown' || code === 40 || code === 20) {
        event.preventDefault()
        event.stopPropagation()
        if (row < rows.length - 1) {
          const ratio = colCenterRatio(row, col)
          const nextRow = row + 1
          setRow(nextRow)
          setCol(findNearestCol(nextRow, ratio))
        }
        return
      }

      if (key === 'ArrowLeft' || code === 37 || code === 21) {
        event.preventDefault()
        event.stopPropagation()
        setCol((prev) => (prev > 0 ? prev - 1 : rows[row].length - 1))
        return
      }

      if (key === 'ArrowRight' || code === 39 || code === 22) {
        event.preventDefault()
        event.stopPropagation()
        setCol((prev) => (prev < rows[row].length - 1 ? prev + 1 : 0))
        return
      }

      // D-Pad Select / Enter / Space activates focused virtual key
      if (
        ['Enter', ' ', 'Select', 'Ok', 'MediaSelect'].includes(key) ||
        code === 13 ||
        code === 23 ||
        code === 66
      ) {
        event.preventDefault()
        event.stopPropagation()
        const keyDef = rows[row]?.[col]
        if (keyDef) triggerKey(keyDef)
        return
      }

      // Hardware / physical keyboard pass-through typing
      if (key.length === 1 && !ctrlKey && !metaKey && !altKey) {
        event.preventDefault()
        event.stopPropagation()
        const lower = key.toLowerCase()
        onChange(value + key)
        // Highlight the matching virtual key if present
        for (let r = 0; r < rows.length; r++) {
          const c = rows[r].findIndex((item) => item.value === lower || item.value === key)
          if (c >= 0) {
            setRow(r)
            setCol(c)
            break
          }
        }
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  })

  if (!isOpen) return null

  return (
    <div
      role="region"
      aria-label={mode === 'text' ? 'On-screen keyboard' : 'On-screen search keyboard'}
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-[4vw] pb-[2.8vh] pt-2 animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      <div
        className="w-full max-w-[780px] rounded-[24px] border p-4 shadow-[0_-16px_60px_rgba(0,0,0,0.92)]"
        style={{
          backgroundColor: tokens.surface,
          borderColor: tokens.glassBorder,
          boxShadow: `0 -12px 50px rgba(0,0,0,0.9), 0 0 36px ${tokens.glow1}`,
        }}
      >
        {/* Live Typed Input Bar */}
        <div
          className="mb-3 flex items-center gap-3 rounded-2xl border px-4 py-2.5"
          style={{
            backgroundColor: colorWithAlpha(tokens.bg, 0.78),
            borderColor: tokens.glassBorder,
          }}
        >
          {mode === 'text' ? (
            <Pencil className="size-4 shrink-0 text-white/55" aria-hidden="true" />
          ) : (
            <Search className="size-4 shrink-0 text-white/55" aria-hidden="true" />
          )}
          <div className="flex min-w-0 flex-1 items-center text-[clamp(14px,1.05vw,18px)]">
            {value ? (
              <span className="truncate font-medium text-white">{value}</span>
            ) : (
              <span className="truncate text-white/40">{placeholder}</span>
            )}
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-[1.1em] w-[2px] animate-pulse rounded-full"
              style={{ backgroundColor: accent }}
            />
          </div>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label="Clear search text"
              className="grid size-6 shrink-0 place-items-center rounded-full text-white/75 transition-colors hover:bg-white/15 hover:text-white"
              style={{
                backgroundColor: tokens.glass,
                boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
              }}
            >
              <X className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard"
            className="rounded-full px-3 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            style={{
              backgroundColor: tokens.glass,
              boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
            }}
          >
            Back
          </button>
        </div>

        {/* Virtual 10-Column Key Matrix */}
        <div className="flex flex-col gap-1.5">
          {rows.map((rowKeys, rIdx) => (
            <div key={rIdx} className="grid grid-cols-10 gap-1.5">
              {rowKeys.map((keyDef, cIdx) => {
                const isFocused = row === rIdx && col === cIdx
                const isSubmit = keyDef.action === 'submit'
                const spanClass =
                  keyDef.span === 3
                    ? 'col-span-3'
                    : keyDef.span === 2
                      ? 'col-span-2'
                      : 'col-span-1'

                return (
                  <button
                    key={keyDef.id}
                    type="button"
                    tabIndex={-1}
                    onMouseEnter={() => {
                      setRow(rIdx)
                      setCol(cIdx)
                    }}
                    onClick={() => triggerKey(keyDef)}
                    className={cn(
                      spanClass,
                      'flex h-[clamp(36px,4.4vh,46px)] items-center justify-center gap-1.5 rounded-xl text-[clamp(13px,0.95vw,17px)] font-medium outline-none transition-all duration-100',
                      isFocused ? 'scale-[1.04] font-semibold' : 'hover:brightness-125',
                    )}
                    style={
                      isFocused
                        ? {
                            backgroundColor: accent,
                            color: accentText,
                            boxShadow: `inset 0 0 0 1px ${accent}, 0 0 16px ${tokens.glow1}`,
                          }
                        : isSubmit
                          ? {
                              backgroundColor: colorWithAlpha(accent, 0.16),
                              color: '#ffffff',
                              boxShadow: `inset 0 0 0 1px ${colorWithAlpha(accent, 0.42)}`,
                            }
                          : {
                              backgroundColor: tokens.glass,
                              color: 'rgba(255, 255, 255, 0.9)',
                              boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                            }
                    }
                  >
                    {keyDef.action === 'space' && <Space className="size-4" aria-hidden="true" />}
                    {keyDef.action === 'backspace' && <Delete className="size-4" aria-hidden="true" />}
                    {keyDef.action === 'submit' && (
                      <CornerDownLeft className="size-3.5" aria-hidden="true" />
                    )}
                    <span>{isSubmit ? submitLabel : keyDef.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
