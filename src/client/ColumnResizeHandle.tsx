import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  CHAT_WIDTH_DEFAULT,
  CHAT_WIDTH_MAX,
  CHAT_WIDTH_MIN,
} from './column-width.ts'
import { readWorkbenchChatWidth, setWorkbenchChatWidth } from './layout-styles.ts'
import type { WorkbenchKey } from './locales.ts'
import css from './Workbench.module.css'

export type ColumnResizeHandleProps = PropsLocale<'workbench'> & {
  onCommit: (width: number) => void
}

/** DSH-style pointer/keyboard separator between the editor and conversation. */
export function ColumnResizeHandle({ onCommit, t }: ColumnResizeHandleProps) {
  const [dragging, setDragging] = useState(false)
  const [currentWidth, setCurrentWidth] = useState(CHAT_WIDTH_DEFAULT)
  const origin = useRef(0)
  const latest = useRef(0)
  const base = useRef(CHAT_WIDTH_DEFAULT)
  const frame = useRef<HTMLElement | null>(null)
  const animation = useRef<number | null>(null)

  const applyDelta = useCallback((delta: number, persist: boolean): number | undefined => {
    if (frame.current === null) return undefined
    return setWorkbenchChatWidth(frame.current, base.current - delta, persist)
  }, [])

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const appFrame = event.currentTarget.closest<HTMLElement>('[data-shell-overlay]')?.parentElement ?? null
    if (appFrame === null) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    frame.current = appFrame
    origin.current = event.clientX
    latest.current = event.clientX
    base.current = readWorkbenchChatWidth(appFrame)
    setDragging(true)
  }, [])

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    latest.current = event.clientX
    animation.current ??= requestAnimationFrame(() => {
      animation.current = null
      applyDelta(latest.current - origin.current, false)
    })
  }, [applyDelta])

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (animation.current !== null) cancelAnimationFrame(animation.current)
    animation.current = null
    const width = applyDelta(latest.current - origin.current, true)
    if (width !== undefined) {
      setCurrentWidth(width)
      onCommit(width)
    }
    setDragging(false)
    frame.current = null
  }, [applyDelta, onCommit])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const appFrame = event.currentTarget.closest<HTMLElement>('[data-shell-overlay]')?.parentElement ?? null
    if (appFrame === null) return
    const current = readWorkbenchChatWidth(appFrame)
    const next = event.key === 'ArrowLeft' ? current + 24
      : event.key === 'ArrowRight' ? current - 24
        : event.key === 'Home' ? CHAT_WIDTH_MIN
          : event.key === 'End' ? CHAT_WIDTH_MAX
            : undefined
    if (next === undefined) return
    event.preventDefault()
    const width = setWorkbenchChatWidth(appFrame, next, true)
    setCurrentWidth(width)
    onCommit(width)
  }, [onCommit])

  const reset = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const appFrame = event.currentTarget.closest<HTMLElement>('[data-shell-overlay]')?.parentElement ?? null
    if (appFrame === null) return
    const width = setWorkbenchChatWidth(appFrame, CHAT_WIDTH_DEFAULT, true)
    setCurrentWidth(width)
    onCommit(width)
  }, [onCommit])

  return (
    <div
      role="separator"
      aria-label={t('layout.resize')}
      aria-orientation="vertical"
      aria-valuemin={CHAT_WIDTH_MIN}
      aria-valuemax={CHAT_WIDTH_MAX}
      aria-valuenow={currentWidth}
      className={css.columnResizeHandle}
      data-dragging={dragging || undefined}
      tabIndex={0}
      title={t('layout.resizeHint')}
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}
