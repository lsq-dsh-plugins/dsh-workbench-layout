/** 工作台右侧会话轨道：沿用 AppFrame 让步规则，并在大屏上解除固定宽度上限。 */

export const DETAILS_TRACK_ATTRIBUTE = 'data-dsh-workbench-details-track'
export const DETAILS_TRACK_FALLBACK_ATTRIBUTE = 'data-dsh-workbench-fallback-details'
export const DETAILS_TRACK_DRAGGING_ATTRIBUTE = 'data-dsh-workbench-details-dragging'
export const DETAILS_TRACK_HANDLE_ATTRIBUTE = 'data-dsh-workbench-fallback-handle'
export const DETAILS_TRACK_NATIVE_HANDLE_ATTRIBUTE = 'data-dsh-workbench-native-details-handle'
export const DETAILS_TRACK_SIDEBAR_WIDTH = '--dsh-workbench-details-sidebar-width'
export const DETAILS_TRACK_WIDTH = '--dsh-workbench-details-width'

const CENTER_MIN = 640
const DETAILS_MIN = 300
const DETAILS_DEFAULT_MIN = 420
const DETAILS_DEFAULT_MAX = 720
const DETAILS_DEFAULT_RATIO = 0.32

const FIRST_PIXEL_TRACK = /^\s*(\d+(?:\.\d+)?)px(?:\s|$)/u

export interface DetailsTrackLogger {
  info(message: string): void
}

export interface DetailsTrackLayout {
  reconcile(): void
  setEnabled(enabled: boolean): void
  resolvePreferredWidth(availableWidth: number): number
  dispose(): void
}

/** 根据窗口大小给右栏一个更适合大屏的初始宽度。 */
export function resolveResponsiveDetailsDefault(frameWidth: number): number {
  return Math.min(
    DETAILS_DEFAULT_MAX,
    Math.max(DETAILS_DEFAULT_MIN, Math.round(frameWidth * DETAILS_DEFAULT_RATIO)),
  )
}

/** 保留官方中栏下限后，计算右栏当前可使用的最大宽度。 */
export function resolveDetailsTrackMaximum(frameWidth: number, sidebarWidth: number): number {
  return Math.max(0, Math.floor(frameWidth - sidebarWidth - CENTER_MIN))
}

/** 窗口缩小时只收缩渲染宽度，不覆盖用户在大屏上选择的偏好。 */
export function resolveDetailsTrackWidth(
  frameWidth: number,
  sidebarWidth: number,
  preferredWidth: number,
): number {
  const maximum = resolveDetailsTrackMaximum(frameWidth, sidebarWidth)
  if (maximum < DETAILS_MIN) return 0
  return Math.min(maximum, Math.max(DETAILS_MIN, Math.round(preferredWidth)))
}

/** 从 AppFrame 的行内网格读取官方已经解析好的左栏宽度。 */
export function readNativeSidebarWidth(frame: HTMLElement, sidebar: HTMLElement): number {
  const match = FIRST_PIXEL_TRACK.exec(frame.style.gridTemplateColumns)
  const inlineWidth = match === null ? Number.NaN : Number(match[1])
  const width = Number.isFinite(inlineWidth) && inlineWidth > 0
    ? inlineWidth
    : sidebar.getBoundingClientRect().width
  return Math.max(0, Math.round(width))
}

/**
 * 工作台展开时接管右栏的宽度和原生分隔线；空会话没有原生分隔线时，
 * 才挂载同几何形态的后备拖拽区域。原生聊天与 AppFrame 节点均不移动。
 */
export function createDetailsTrackLayout(
  frame: HTMLElement,
  logger: DetailsTrackLogger,
  initiallyEnabled = true,
): DetailsTrackLayout {
  const fallbackHandle = document.createElement('div')
  fallbackHandle.hidden = true
  fallbackHandle.setAttribute(DETAILS_TRACK_HANDLE_ATTRIBUTE, '')
  frame.appendChild(fallbackHandle)

  let preferredWidth: number | undefined
  let renderedWidth = 0
  let activeMode: 'native' | 'fallback' | undefined
  let enabled = initiallyEnabled
  let dragHandle: HTMLElement | null = null
  let dragPointerId: number | undefined
  let dragOrigin = 0
  let dragBase = 0
  let latestPointer = 0
  let dragFrame: number | null = null
  let sidebarCollapsed: boolean | undefined
  let nativeHandleAttributes: Record<string, string | null> | undefined

  const preferredForFrame = (frameWidth: number): number => {
    if (preferredWidth !== undefined) return preferredWidth
    const responsive = resolveResponsiveDetailsDefault(frameWidth)
    if (frameWidth > 0) {
      preferredWidth = responsive
      logger.info(`workbench-layout: initialized responsive conversation width at ${responsive}px`)
    }
    return responsive
  }

  const resolvePreferredWidth = (availableWidth: number): number => {
    const frameWidth = Math.max(0, Math.round(frame.getBoundingClientRect().width))
    const sidebarWidth = Math.max(0, frameWidth - Math.max(0, Math.round(availableWidth)))
    return resolveDetailsTrackWidth(frameWidth, sidebarWidth, preferredForFrame(frameWidth))
  }

  const announceMode = (next: 'native' | 'fallback' | undefined): void => {
    if (activeMode === next) return
    activeMode = next
    if (next === 'native') {
      logger.info('workbench-layout: adopted native AppFrame divider with responsive conversation width')
    } else if (next === 'fallback') {
      logger.info('workbench-layout: activated blank-Session responsive conversation track')
    } else {
      logger.info('workbench-layout: released responsive conversation track to native AppFrame')
    }
  }

  const restoreNativeHandleAttributes = (): void => {
    if (dragHandle === null || nativeHandleAttributes === undefined) return
    for (const [name, value] of Object.entries(nativeHandleAttributes)) {
      if (value === null) dragHandle.removeAttribute(name)
      else dragHandle.setAttribute(name, value)
    }
    nativeHandleAttributes = undefined
  }

  const cancelDrag = (): void => {
    if (dragFrame !== null) cancelAnimationFrame(dragFrame)
    dragFrame = null
    dragPointerId = undefined
    frame.removeAttribute(DETAILS_TRACK_DRAGGING_ATTRIBUTE)
  }

  const detachDragHandle = (): void => {
    if (dragHandle === null) return
    cancelDrag()
    dragHandle.removeEventListener('pointerdown', onPointerDown)
    dragHandle.removeEventListener('pointermove', onPointerMove)
    dragHandle.removeEventListener('pointerup', onPointerUp)
    dragHandle.removeEventListener('pointercancel', onPointerCancel)
    restoreNativeHandleAttributes()
    dragHandle = null
  }

  const attachDragHandle = (next: HTMLElement, native: boolean): void => {
    if (dragHandle === next) return
    detachDragHandle()
    dragHandle = next
    if (native) {
      const names = [
        DETAILS_TRACK_NATIVE_HANDLE_ATTRIBUTE,
        'role',
        'aria-orientation',
        'aria-valuemin',
        'aria-valuemax',
        'aria-valuenow',
      ]
      nativeHandleAttributes = Object.fromEntries(names.map(name => [name, next.getAttribute(name)]))
      next.setAttribute(DETAILS_TRACK_NATIVE_HANDLE_ATTRIBUTE, '')
    }
    next.setAttribute('role', 'separator')
    next.setAttribute('aria-orientation', 'vertical')
    next.setAttribute('aria-valuemin', String(DETAILS_MIN))
    next.addEventListener('pointerdown', onPointerDown)
    next.addEventListener('pointermove', onPointerMove)
    next.addEventListener('pointerup', onPointerUp)
    next.addEventListener('pointercancel', onPointerCancel)
  }

  const clearPresentation = (): void => {
    detachDragHandle()
    frame.removeAttribute(DETAILS_TRACK_ATTRIBUTE)
    frame.removeAttribute(DETAILS_TRACK_FALLBACK_ATTRIBUTE)
    frame.removeAttribute(DETAILS_TRACK_DRAGGING_ATTRIBUTE)
    removeStyleProperty(frame, DETAILS_TRACK_SIDEBAR_WIDTH)
    removeStyleProperty(frame, DETAILS_TRACK_WIDTH)
    fallbackHandle.hidden = true
    renderedWidth = 0
    sidebarCollapsed = undefined
    announceMode(undefined)
  }

  const reconcile = (): void => {
    if (!enabled) {
      clearPresentation()
      return
    }
    const sidebar = frame.children.item(0) as HTMLElement | null
    const conversation = frame.children.item(1) as HTMLElement | null
    const details = frame.children.item(2) as HTMLElement | null
    const phase = conversation?.querySelector<HTMLElement>('[data-phase]')?.dataset.phase
    const blankSurface = phase === 'hero' || phase === 'settling'
    const nativeCollapsed = frame.hasAttribute('data-details-collapsed')
    const fallback = blankSurface && nativeCollapsed
    const native = !blankSurface && !nativeCollapsed
    if ((!fallback && !native) || details === null || details.childElementCount === 0 || sidebar === null) {
      clearPresentation()
      return
    }

    const frameWidth = Math.max(0, Math.round(frame.getBoundingClientRect().width))
    const sidebarWidth = readNativeSidebarWidth(frame, sidebar)
    const width = resolveDetailsTrackWidth(frameWidth, sidebarWidth, preferredForFrame(frameWidth))
    if (width === 0) {
      clearPresentation()
      return
    }

    const maximum = resolveDetailsTrackMaximum(frameWidth, sidebarWidth)
    renderedWidth = width
    setStyleProperty(frame, DETAILS_TRACK_SIDEBAR_WIDTH, `${sidebarWidth}px`)
    setStyleProperty(frame, DETAILS_TRACK_WIDTH, `${width}px`)
    frame.setAttribute(DETAILS_TRACK_ATTRIBUTE, '')
    frame.toggleAttribute(DETAILS_TRACK_FALLBACK_ATTRIBUTE, fallback)
    fallbackHandle.hidden = !fallback
    const nativeHandle = native ? findNativeDetailsHandle(frame, fallbackHandle) : null
    const nextHandle = fallback ? fallbackHandle : nativeHandle
    if (nextHandle !== null) {
      attachDragHandle(nextHandle, native)
      nextHandle.setAttribute('aria-valuemax', String(maximum))
      nextHandle.setAttribute('aria-valuenow', String(width))
    } else {
      detachDragHandle()
    }
    announceMode(fallback ? 'fallback' : 'native')

    const nextSidebarCollapsed = frame.hasAttribute('data-sidebar-collapsed')
    if (sidebarCollapsed !== nextSidebarCollapsed) {
      sidebarCollapsed = nextSidebarCollapsed
      logger.info(`workbench-layout: synchronized responsive conversation track with ${nextSidebarCollapsed ? 'collapsed' : 'expanded'} sidebar at ${sidebarWidth}px`)
    }
  }

  const applyPointer = (clientX: number): void => {
    const sidebar = frame.children.item(0) as HTMLElement | null
    if (sidebar === null) return
    const frameWidth = Math.max(0, Math.round(frame.getBoundingClientRect().width))
    const sidebarWidth = readNativeSidebarWidth(frame, sidebar)
    const maximum = resolveDetailsTrackMaximum(frameWidth, sidebarWidth)
    preferredWidth = Math.min(maximum, Math.max(DETAILS_MIN, Math.round(dragBase - (clientX - dragOrigin))))
    reconcile()
  }

  const flushPointer = (): void => {
    if (dragFrame !== null) {
      cancelAnimationFrame(dragFrame)
      dragFrame = null
    }
    applyPointer(latestPointer)
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || renderedWidth === 0 || dragHandle === null) return
    event.preventDefault()
    event.stopPropagation()
    dragPointerId = event.pointerId
    dragOrigin = event.clientX
    latestPointer = event.clientX
    dragBase = renderedWidth
    dragHandle.setPointerCapture?.(event.pointerId)
    frame.setAttribute(DETAILS_TRACK_DRAGGING_ATTRIBUTE, '')
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== dragPointerId) return
    event.stopPropagation()
    latestPointer = event.clientX
    dragFrame ??= requestAnimationFrame(() => {
      dragFrame = null
      applyPointer(latestPointer)
    })
  }

  function finishDrag(event: PointerEvent): void {
    if (event.pointerId !== dragPointerId || dragHandle === null) return
    event.stopPropagation()
    latestPointer = event.clientX
    flushPointer()
    dragHandle.releasePointerCapture?.(event.pointerId)
    dragPointerId = undefined
    frame.removeAttribute(DETAILS_TRACK_DRAGGING_ATTRIBUTE)
    logger.info(`workbench-layout: resized conversation track to ${renderedWidth}px`)
  }

  function onPointerUp(event: PointerEvent): void {
    finishDrag(event)
  }

  function onPointerCancel(event: PointerEvent): void {
    finishDrag(event)
  }

  const mutationObserver = new MutationObserver(reconcile)
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
    setEnabled: (next) => {
      if (enabled === next) return
      enabled = next
      reconcile()
      logger.info(`workbench-layout: ${next ? 'enabled' : 'disabled'} responsive conversation track`)
    },
    resolvePreferredWidth,
    dispose: () => {
      mutationObserver.disconnect()
      resizeObserver?.disconnect()
      clearPresentation()
      fallbackHandle.remove()
    },
  }
}

function findNativeDetailsHandle(frame: HTMLElement, fallbackHandle: HTMLElement): HTMLElement | null {
  return Array.from(frame.children).find((child): child is HTMLElement => (
    child instanceof HTMLElement
      && child !== fallbackHandle
      && child.dataset.side === 'details'
  )) ?? null
}

function setStyleProperty(element: HTMLElement, property: string, value: string): void {
  if (element.style.getPropertyValue(property) === value) return
  element.style.setProperty(property, value)
}

function removeStyleProperty(element: HTMLElement, property: string): void {
  if (element.style.getPropertyValue(property) === '') return
  element.style.removeProperty(property)
}
