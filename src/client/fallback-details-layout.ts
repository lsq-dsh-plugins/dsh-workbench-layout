/** Empty-Session fallback for the AppFrame details track used by the workbench. */

export const FALLBACK_DETAILS_ATTRIBUTE = 'data-dsh-workbench-fallback-details'
export const FALLBACK_DRAGGING_ATTRIBUTE = 'data-dsh-workbench-fallback-dragging'
export const FALLBACK_HANDLE_ATTRIBUTE = 'data-dsh-workbench-fallback-handle'
export const FALLBACK_SIDEBAR_WIDTH = '--dsh-workbench-fallback-sidebar-width'
export const FALLBACK_DETAILS_WIDTH = '--dsh-workbench-fallback-details-width'

const CENTER_MIN = 640
const DETAILS_MIN = 300
const DETAILS_MAX = 520
const DETAILS_DEFAULT = 360

const FIRST_PIXEL_TRACK = /^\s*(\d+(?:\.\d+)?)px(?:\s|$)/u

export interface FallbackDetailsLogger {
  info(message: string): void
}

export interface FallbackDetailsTrack {
  reconcile(): void
  dispose(): void
}

/** Match AppFrame's details concession without changing its stored preference. */
export function resolveFallbackDetailsWidth(
  frameWidth: number,
  sidebarWidth: number,
  preferredWidth: number,
): number {
  const available = Math.floor(frameWidth - sidebarWidth - CENTER_MIN)
  if (available < DETAILS_MIN) return 0
  return Math.min(clampDetailsWidth(preferredWidth), available)
}

/** Read the sidebar track resolved by AppFrame before fallback CSS reorders it. */
export function readNativeSidebarWidth(frame: HTMLElement, sidebar: HTMLElement): number {
  const match = FIRST_PIXEL_TRACK.exec(frame.style.gridTemplateColumns)
  const inlineWidth = match === null ? Number.NaN : Number(match[1])
  const width = Number.isFinite(inlineWidth) && inlineWidth > 0
    ? inlineWidth
    : sidebar.getBoundingClientRect().width
  return Math.max(0, Math.round(width))
}

/**
 * Supply the workbench track only while AppFrame hides details for its
 * blank-Session Hero. Active conversations and narrow-screen concessions stay
 * under AppFrame's native solver.
 */
export function createFallbackDetailsTrack(
  frame: HTMLElement,
  logger: FallbackDetailsLogger,
): FallbackDetailsTrack {
  const handle = document.createElement('div')
  handle.hidden = true
  handle.setAttribute(FALLBACK_HANDLE_ATTRIBUTE, '')
  handle.setAttribute('role', 'separator')
  handle.setAttribute('aria-orientation', 'vertical')
  handle.setAttribute('aria-valuemin', String(DETAILS_MIN))
  handle.setAttribute('aria-valuemax', String(DETAILS_MAX))
  frame.appendChild(handle)

  let preferredWidth = DETAILS_DEFAULT
  let renderedWidth = 0
  let active = false
  let dragOrigin = 0
  let dragBase = DETAILS_DEFAULT
  let latestPointer = 0
  let dragFrame: number | null = null
  let sidebarCollapsed: boolean | undefined

  const setActive = (next: boolean): void => {
    if (active === next) return
    active = next
    logger.info(next
      ? 'workbench-layout: activated blank-Session details track fallback'
      : 'workbench-layout: released blank-Session details track fallback to native AppFrame')
  }

  const clearPresentation = (): void => {
    frame.removeAttribute(FALLBACK_DETAILS_ATTRIBUTE)
    removeStyleProperty(frame, FALLBACK_SIDEBAR_WIDTH)
    removeStyleProperty(frame, FALLBACK_DETAILS_WIDTH)
    handle.hidden = true
    renderedWidth = 0
    sidebarCollapsed = undefined
    setActive(false)
  }

  const reconcile = (): void => {
    const sidebar = frame.children.item(0) as HTMLElement | null
    const conversation = frame.children.item(1) as HTMLElement | null
    const details = frame.children.item(2) as HTMLElement | null
    const phase = conversation?.querySelector<HTMLElement>('[data-phase]')?.dataset.phase
    const blankSurface = phase === 'hero' || phase === 'settling'
    const nativeCollapsed = frame.hasAttribute('data-details-collapsed')
    if (!blankSurface || !nativeCollapsed || details === null || details.childElementCount === 0 || sidebar === null) {
      clearPresentation()
      return
    }

    const sidebarWidth = readNativeSidebarWidth(frame, sidebar)
    const width = resolveFallbackDetailsWidth(
      frame.getBoundingClientRect().width,
      sidebarWidth,
      preferredWidth,
    )
    if (width === 0) {
      clearPresentation()
      return
    }

    renderedWidth = width
    setStyleProperty(frame, FALLBACK_SIDEBAR_WIDTH, `${sidebarWidth}px`)
    setStyleProperty(frame, FALLBACK_DETAILS_WIDTH, `${width}px`)
    frame.setAttribute(FALLBACK_DETAILS_ATTRIBUTE, '')
    handle.setAttribute('aria-valuenow', String(width))
    handle.hidden = false
    setActive(true)
    const nextSidebarCollapsed = frame.hasAttribute('data-sidebar-collapsed')
    if (sidebarCollapsed !== nextSidebarCollapsed) {
      sidebarCollapsed = nextSidebarCollapsed
      logger.info(`workbench-layout: synchronized blank-Session ${nextSidebarCollapsed ? 'collapsed' : 'expanded'} sidebar track at ${sidebarWidth}px`)
    }
  }

  const applyPointer = (clientX: number): void => {
    preferredWidth = clampDetailsWidth(dragBase - (clientX - dragOrigin))
    reconcile()
  }

  const flushPointer = (): void => {
    if (dragFrame !== null) {
      cancelAnimationFrame(dragFrame)
      dragFrame = null
    }
    applyPointer(latestPointer)
  }

  const finishDrag = (event: PointerEvent): void => {
    if (!handle.hasPointerCapture(event.pointerId)) return
    flushPointer()
    handle.releasePointerCapture(event.pointerId)
    frame.removeAttribute(FALLBACK_DRAGGING_ATTRIBUTE)
  }

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || renderedWidth === 0) return
    event.preventDefault()
    dragOrigin = event.clientX
    latestPointer = event.clientX
    dragBase = renderedWidth
    handle.setPointerCapture(event.pointerId)
    frame.setAttribute(FALLBACK_DRAGGING_ATTRIBUTE, '')
  })
  handle.addEventListener('pointermove', (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) return
    latestPointer = event.clientX
    dragFrame ??= requestAnimationFrame(() => {
      dragFrame = null
      applyPointer(latestPointer)
    })
  })
  handle.addEventListener('pointerup', finishDrag)
  handle.addEventListener('pointercancel', finishDrag)

  const mutationObserver = new MutationObserver((records) => {
    const relevant = records.some(record => record.type === 'childList'
      || record.attributeName !== 'style'
      || record.target === frame)
    if (relevant) reconcile()
  })
  mutationObserver.observe(frame, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-phase', 'data-details-collapsed', 'data-sidebar-collapsed', 'style'],
  })
  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver(reconcile)
  resizeObserver?.observe(frame)
  reconcile()

  return {
    reconcile,
    dispose: () => {
      mutationObserver.disconnect()
      resizeObserver?.disconnect()
      if (dragFrame !== null) cancelAnimationFrame(dragFrame)
      frame.removeAttribute(FALLBACK_DETAILS_ATTRIBUTE)
      frame.removeAttribute(FALLBACK_DRAGGING_ATTRIBUTE)
      removeStyleProperty(frame, FALLBACK_SIDEBAR_WIDTH)
      removeStyleProperty(frame, FALLBACK_DETAILS_WIDTH)
      handle.remove()
    },
  }
}

function clampDetailsWidth(width: number): number {
  return Math.min(DETAILS_MAX, Math.max(DETAILS_MIN, Math.round(width)))
}

/** Avoid self-triggering the style observer when the mirrored value is unchanged. */
function setStyleProperty(element: HTMLElement, property: string, value: string): void {
  if (element.style.getPropertyValue(property) === value) return
  element.style.setProperty(property, value)
}

function removeStyleProperty(element: HTMLElement, property: string): void {
  if (element.style.getPropertyValue(property) === '') return
  element.style.removeProperty(property)
}
