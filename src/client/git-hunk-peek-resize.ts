export type GitHunkPeekStorageOperation = 'load' | 'save'

export interface GitHunkPeekResizeOptions {
  label: string
  requestMeasure: () => void
  onCommit?: (width: number) => void
  onStorageError?: (operation: GitHunkPeekStorageOperation) => void
}

export interface GitHunkPeekResizeBinding {
  destroy: () => void
}

export const GIT_HUNK_PEEK_DEFAULT_WIDTH = 480
export const GIT_HUNK_PEEK_MIN_WIDTH = 320
export const GIT_HUNK_PEEK_VIEWPORT_INSET = 16
export const GIT_HUNK_PEEK_STORAGE_KEY = 'dsh-workbench-layout:git-hunk-peek-width:v2'

const RESIZE_STEP = 8
const RESIZE_LARGE_STEP = 32

interface ResizeDrag {
  pointerId: number
  startX: number
  startWidth: number
}

/** Keep a preferred popup width inside the visible browser viewport. */
export function clampGitHunkPeekWidth(preferred: number, viewportWidth: number): number {
  const maximum = Math.max(1, Math.floor(viewportWidth - GIT_HUNK_PEEK_VIEWPORT_INSET * 2))
  const minimum = Math.min(GIT_HUNK_PEEK_MIN_WIDTH, maximum)
  const finite = Number.isFinite(preferred) ? Math.round(preferred) : minimum
  return Math.min(maximum, Math.max(minimum, finite))
}

/** Restore a valid persisted popup width; corrupt storage falls back cleanly. */
export function loadGitHunkPeekWidth(
  storage: Pick<Storage, 'getItem'>,
  onError?: () => void,
): number | null {
  try {
    const serialized = storage.getItem(GIT_HUNK_PEEK_STORAGE_KEY)
    if (serialized === null) return null
    const candidate = JSON.parse(serialized) as { width?: unknown }
    if (typeof candidate.width !== 'number' || !Number.isFinite(candidate.width) || candidate.width <= 0) {
      throw new TypeError('Invalid Git hunk popup width')
    }
    return Math.round(candidate.width)
  } catch {
    onError?.()
    return null
  }
}

/** Persist only the completed user resize, avoiding writes on every pointer move. */
export function saveGitHunkPeekWidth(
  storage: Pick<Storage, 'setItem'>,
  width: number,
  onError?: () => void,
): boolean {
  try {
    storage.setItem(GIT_HUNK_PEEK_STORAGE_KEY, JSON.stringify({ width }))
    return true
  } catch {
    onError?.()
    return false
  }
}

/** Add the DSH pointer and keyboard width handle to the CodeMirror hunk popup. */
export function makeGitHunkPeekResizable(
  dom: HTMLElement,
  options: GitHunkPeekResizeOptions,
): GitHunkPeekResizeBinding {
  const resizeWindow = dom.ownerDocument.defaultView
  const storage = browserStorage(resizeWindow, () => { options.onStorageError?.('load') })
  let preferred = storage === null
    ? GIT_HUNK_PEEK_DEFAULT_WIDTH
    : loadGitHunkPeekWidth(storage, () => { options.onStorageError?.('load') }) ?? GIT_HUNK_PEEK_DEFAULT_WIDTH
  let rendered = preferred
  let drag: ResizeDrag | null = null
  let latestX = 0
  let animationFrame: number | null = null

  const handle = resizeHandle(dom.ownerDocument, options.label)
  dom.append(handle)

  const viewportWidth = (): number => {
    const rootWidth = dom.ownerDocument.documentElement.clientWidth
    return rootWidth || resizeWindow?.innerWidth || GIT_HUNK_PEEK_DEFAULT_WIDTH + GIT_HUNK_PEEK_VIEWPORT_INSET * 2
  }

  const apply = (width: number): void => {
    rendered = clampGitHunkPeekWidth(width, viewportWidth())
    dom.style.inlineSize = `${rendered}px`
    const maximum = Math.max(1, Math.floor(viewportWidth() - GIT_HUNK_PEEK_VIEWPORT_INSET * 2))
    handle.setAttribute('aria-valuemin', String(Math.min(GIT_HUNK_PEEK_MIN_WIDTH, maximum)))
    handle.setAttribute('aria-valuemax', String(maximum))
    handle.setAttribute('aria-valuenow', String(rendered))
    options.requestMeasure()
  }

  const persist = (): void => {
    preferred = rendered
    if (storage !== null) {
      saveGitHunkPeekWidth(storage, preferred, () => { options.onStorageError?.('save') })
    }
    options.onCommit?.(preferred)
  }

  const applyPointer = (): void => {
    if (drag === null) return
    preferred = drag.startWidth + latestX - drag.startX
    apply(preferred)
  }

  const schedulePointer = (): void => {
    if (animationFrame !== null) return
    if (resizeWindow === null || typeof resizeWindow.requestAnimationFrame !== 'function') {
      applyPointer()
      return
    }
    animationFrame = resizeWindow.requestAnimationFrame(() => {
      animationFrame = null
      applyPointer()
    })
  }

  const flushPointer = (): void => {
    if (animationFrame !== null && resizeWindow !== null) {
      resizeWindow.cancelAnimationFrame(animationFrame)
      animationFrame = null
    }
    applyPointer()
  }

  const pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || drag !== null) return
    event.preventDefault()
    event.stopPropagation()
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: rendered,
    }
    latestX = event.clientX
    handle.setPointerCapture?.(event.pointerId)
    dom.dataset.resizing = 'width'
  }

  const pointerMove = (event: PointerEvent): void => {
    if (drag?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    latestX = event.clientX
    schedulePointer()
  }

  const finishPointer = (event: PointerEvent): void => {
    if (drag?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    latestX = event.clientX
    flushPointer()
    handle.releasePointerCapture?.(event.pointerId)
    drag = null
    delete dom.dataset.resizing
    persist()
  }

  const keyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    const step = event.shiftKey ? RESIZE_LARGE_STEP : RESIZE_STEP
    preferred = rendered + (event.key === 'ArrowRight' ? step : -step)
    apply(preferred)
    persist()
  }

  handle.addEventListener('pointerdown', pointerDown)
  handle.addEventListener('pointermove', pointerMove)
  handle.addEventListener('pointerup', finishPointer)
  handle.addEventListener('pointercancel', finishPointer)
  handle.addEventListener('keydown', keyDown)
  const fitViewport = (): void => { apply(preferred) }
  resizeWindow?.addEventListener('resize', fitViewport)
  apply(preferred)

  return {
    destroy: () => {
      if (animationFrame !== null && resizeWindow !== null) resizeWindow.cancelAnimationFrame(animationFrame)
      resizeWindow?.removeEventListener('resize', fitViewport)
      handle.removeEventListener('pointerdown', pointerDown)
      handle.removeEventListener('pointermove', pointerMove)
      handle.removeEventListener('pointerup', finishPointer)
      handle.removeEventListener('pointercancel', finishPointer)
      handle.removeEventListener('keydown', keyDown)
      handle.remove()
    },
  }
}

function resizeHandle(ownerDocument: Document, label: string): HTMLDivElement {
  const handle = ownerDocument.createElement('div')
  handle.className = 'cm-gitChangePeekResizeHandle'
  handle.tabIndex = 0
  handle.setAttribute('role', 'separator')
  handle.setAttribute('aria-label', label)
  handle.setAttribute('aria-orientation', 'vertical')
  handle.title = label
  return handle
}

function browserStorage(
  resizeWindow: Window | null,
  onError: () => void,
): Storage | null {
  if (resizeWindow === null) return null
  try {
    return resizeWindow.localStorage
  } catch {
    onError()
    return null
  }
}
