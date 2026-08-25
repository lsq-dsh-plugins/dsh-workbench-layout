export interface GitHunkPeekSize {
  width: number
  height: number
}

export type GitHunkPeekStorageOperation = 'load' | 'save'
export type GitHunkPeekResizeAxis = 'width' | 'height' | 'both'

export interface GitHunkPeekResizeLabels {
  width: string
  height: string
  both: string
}

export interface GitHunkPeekResizeOptions {
  labels: GitHunkPeekResizeLabels
  requestMeasure: () => void
  onCommit?: (size: GitHunkPeekSize) => void
  onStorageError?: (operation: GitHunkPeekStorageOperation) => void
}

export interface GitHunkPeekResizeBinding {
  destroy: () => void
}

export const GIT_HUNK_PEEK_DEFAULT_SIZE: GitHunkPeekSize = { width: 480, height: 320 }
export const GIT_HUNK_PEEK_MIN_SIZE: GitHunkPeekSize = { width: 320, height: 180 }
export const GIT_HUNK_PEEK_VIEWPORT_INSET = 16
export const GIT_HUNK_PEEK_STORAGE_KEY = 'dsh-workbench-layout:git-hunk-peek-size:v1'

const RESIZE_STEP = 8
const RESIZE_LARGE_STEP = 32

interface GitHunkPeekViewport {
  width: number
  height: number
}

interface ResizeDrag {
  pointerId: number
  axis: GitHunkPeekResizeAxis
  startX: number
  startY: number
  startSize: GitHunkPeekSize
}

/** Keep a preferred popup size inside the visible browser viewport. */
export function clampGitHunkPeekSize(
  preferred: GitHunkPeekSize,
  viewport: GitHunkPeekViewport,
): GitHunkPeekSize {
  const maximumWidth = Math.max(1, Math.floor(viewport.width - GIT_HUNK_PEEK_VIEWPORT_INSET * 2))
  const maximumHeight = Math.max(1, Math.floor(viewport.height - GIT_HUNK_PEEK_VIEWPORT_INSET * 2))
  const minimumWidth = Math.min(GIT_HUNK_PEEK_MIN_SIZE.width, maximumWidth)
  const minimumHeight = Math.min(GIT_HUNK_PEEK_MIN_SIZE.height, maximumHeight)
  return {
    width: clampDimension(preferred.width, minimumWidth, maximumWidth),
    height: clampDimension(preferred.height, minimumHeight, maximumHeight),
  }
}

/** Restore a valid persisted popup size; corrupt storage falls back cleanly. */
export function loadGitHunkPeekSize(
  storage: Pick<Storage, 'getItem'>,
  onError?: () => void,
): GitHunkPeekSize | null {
  try {
    const serialized = storage.getItem(GIT_HUNK_PEEK_STORAGE_KEY)
    if (serialized === null) return null
    const candidate = JSON.parse(serialized) as Partial<GitHunkPeekSize>
    if (!validDimension(candidate.width) || !validDimension(candidate.height)) {
      throw new TypeError('Invalid Git hunk popup size')
    }
    return { width: Math.round(candidate.width), height: Math.round(candidate.height) }
  } catch {
    onError?.()
    return null
  }
}

/** Persist only the completed user resize, avoiding writes on every pointer move. */
export function saveGitHunkPeekSize(
  storage: Pick<Storage, 'setItem'>,
  size: GitHunkPeekSize,
  onError?: () => void,
): boolean {
  try {
    storage.setItem(GIT_HUNK_PEEK_STORAGE_KEY, JSON.stringify(size))
    return true
  } catch {
    onError?.()
    return false
  }
}

/**
 * Add DSH-style pointer and keyboard resize handles to the CodeMirror hunk popup.
 * Width and height preferences survive popup navigation, file changes, and reloads.
 */
export function makeGitHunkPeekResizable(
  dom: HTMLElement,
  options: GitHunkPeekResizeOptions,
): GitHunkPeekResizeBinding {
  const resizeWindow = dom.ownerDocument.defaultView
  const storage = browserStorage(resizeWindow, () => { options.onStorageError?.('load') })
  let preferred = storage === null
    ? GIT_HUNK_PEEK_DEFAULT_SIZE
    : loadGitHunkPeekSize(storage, () => { options.onStorageError?.('load') }) ?? GIT_HUNK_PEEK_DEFAULT_SIZE
  let rendered = preferred
  let drag: ResizeDrag | null = null
  let latestX = 0
  let latestY = 0
  let animationFrame: number | null = null

  const widthHandle = resizeHandle('width', options.labels.width)
  const heightHandle = resizeHandle('height', options.labels.height)
  const cornerHandle = resizeHandle('both', options.labels.both)
  dom.append(widthHandle, heightHandle, cornerHandle)

  const viewport = (): GitHunkPeekViewport => {
    const root = dom.ownerDocument.documentElement
    return {
      width: root.clientWidth || resizeWindow?.innerWidth || GIT_HUNK_PEEK_DEFAULT_SIZE.width + GIT_HUNK_PEEK_VIEWPORT_INSET * 2,
      height: root.clientHeight || resizeWindow?.innerHeight || GIT_HUNK_PEEK_DEFAULT_SIZE.height + GIT_HUNK_PEEK_VIEWPORT_INSET * 2,
    }
  }

  const apply = (size: GitHunkPeekSize): void => {
    rendered = clampGitHunkPeekSize(size, viewport())
    dom.style.inlineSize = `${rendered.width}px`
    dom.style.blockSize = `${rendered.height}px`
    updateHandleValue(widthHandle, rendered.width, viewport().width, GIT_HUNK_PEEK_MIN_SIZE.width)
    updateHandleValue(heightHandle, rendered.height, viewport().height, GIT_HUNK_PEEK_MIN_SIZE.height)
    options.requestMeasure()
  }

  const persist = (): void => {
    preferred = rendered
    if (storage !== null) {
      saveGitHunkPeekSize(storage, preferred, () => { options.onStorageError?.('save') })
    }
    options.onCommit?.(preferred)
  }

  const applyPointer = (): void => {
    if (drag === null) return
    preferred = {
      width: drag.axis === 'height' ? drag.startSize.width : drag.startSize.width + latestX - drag.startX,
      height: drag.axis === 'width' ? drag.startSize.height : drag.startSize.height + latestY - drag.startY,
    }
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
    const handle = event.currentTarget
    if (!(handle instanceof HTMLElement)) return
    event.preventDefault()
    event.stopPropagation()
    drag = {
      pointerId: event.pointerId,
      axis: handle.dataset.resizeAxis as GitHunkPeekResizeAxis,
      startX: event.clientX,
      startY: event.clientY,
      startSize: rendered,
    }
    latestX = event.clientX
    latestY = event.clientY
    handle.setPointerCapture?.(event.pointerId)
    dom.dataset.resizing = drag.axis
  }

  const pointerMove = (event: PointerEvent): void => {
    if (drag?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    latestX = event.clientX
    latestY = event.clientY
    schedulePointer()
  }

  const finishPointer = (event: PointerEvent): void => {
    if (drag?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    latestX = event.clientX
    latestY = event.clientY
    flushPointer()
    const handle = event.currentTarget
    if (handle instanceof HTMLElement) handle.releasePointerCapture?.(event.pointerId)
    drag = null
    delete dom.dataset.resizing
    persist()
  }

  const keyDown = (event: KeyboardEvent): void => {
    const handle = event.currentTarget
    if (!(handle instanceof HTMLElement)) return
    const axis = handle.dataset.resizeAxis as GitHunkPeekResizeAxis
    const step = event.shiftKey ? RESIZE_LARGE_STEP : RESIZE_STEP
    let widthDelta = 0
    let heightDelta = 0
    if (axis !== 'height' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      widthDelta = event.key === 'ArrowRight' ? step : -step
    } else if (axis !== 'width' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      heightDelta = event.key === 'ArrowDown' ? step : -step
    } else {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    preferred = { width: rendered.width + widthDelta, height: rendered.height + heightDelta }
    apply(preferred)
    persist()
  }

  const handles = [widthHandle, heightHandle, cornerHandle]
  for (const handle of handles) {
    handle.addEventListener('pointerdown', pointerDown)
    handle.addEventListener('pointermove', pointerMove)
    handle.addEventListener('pointerup', finishPointer)
    handle.addEventListener('pointercancel', finishPointer)
    handle.addEventListener('keydown', keyDown)
  }
  const fitViewport = (): void => { apply(preferred) }
  resizeWindow?.addEventListener('resize', fitViewport)
  apply(preferred)

  return {
    destroy: () => {
      if (animationFrame !== null && resizeWindow !== null) resizeWindow.cancelAnimationFrame(animationFrame)
      resizeWindow?.removeEventListener('resize', fitViewport)
      for (const handle of handles) {
        handle.removeEventListener('pointerdown', pointerDown)
        handle.removeEventListener('pointermove', pointerMove)
        handle.removeEventListener('pointerup', finishPointer)
        handle.removeEventListener('pointercancel', finishPointer)
        handle.removeEventListener('keydown', keyDown)
      }
      widthHandle.remove()
      heightHandle.remove()
      cornerHandle.remove()
    },
  }
}

function resizeHandle(axis: GitHunkPeekResizeAxis, label: string): HTMLDivElement {
  const handle = document.createElement('div')
  handle.className = 'cm-gitChangePeekResizeHandle'
  handle.dataset.resizeAxis = axis
  handle.setAttribute('aria-label', label)
  handle.title = label
  if (axis === 'both') {
    handle.tabIndex = -1
    handle.setAttribute('aria-hidden', 'true')
  } else {
    handle.tabIndex = 0
    handle.setAttribute('role', 'separator')
    handle.setAttribute('aria-orientation', axis === 'width' ? 'vertical' : 'horizontal')
  }
  return handle
}

function updateHandleValue(handle: HTMLElement, value: number, viewport: number, minimum: number): void {
  if (handle.dataset.resizeAxis === 'both') return
  const maximum = Math.max(1, Math.floor(viewport - GIT_HUNK_PEEK_VIEWPORT_INSET * 2))
  handle.setAttribute('aria-valuemin', String(Math.min(minimum, maximum)))
  handle.setAttribute('aria-valuemax', String(maximum))
  handle.setAttribute('aria-valuenow', String(value))
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

function clampDimension(value: number, minimum: number, maximum: number): number {
  const finite = Number.isFinite(value) ? Math.round(value) : minimum
  return Math.min(maximum, Math.max(minimum, finite))
}

function validDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
