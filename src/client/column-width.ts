/** Pure column-width policy and guarded browser persistence. */

export const CHAT_WIDTH_PROPERTY = '--dsh-workbench-chat-width'
export const CHAT_WIDTH_PREFERENCE_ATTRIBUTE = 'data-dsh-workbench-chat-preference'
export const CHAT_WIDTH_STORAGE_KEY = 'dsh-workbench-layout.chat-width'
export const CHAT_WIDTH_DEFAULT = 440
export const CHAT_WIDTH_MIN = 320
export const CHAT_WIDTH_MAX = 680
export const CENTER_WIDTH_MIN = 320

/** Keep the chat useful while reserving a workable editor track. */
export function resolveChatWidth(preferred: number, frameWidth: number, sidebarWidth: number): number {
  const normalized = Number.isFinite(preferred) ? Math.round(preferred) : CHAT_WIDTH_DEFAULT
  if (frameWidth <= 0) return clamp(normalized, CHAT_WIDTH_MIN, CHAT_WIDTH_MAX)
  const available = Math.max(280, Math.floor(frameWidth - sidebarWidth - CENTER_WIDTH_MIN))
  const maximum = Math.max(280, Math.min(CHAT_WIDTH_MAX, available))
  const minimum = Math.min(CHAT_WIDTH_MIN, maximum)
  return clamp(normalized, minimum, maximum)
}

export function parseStoredChatWidth(value: string | null): number | undefined {
  if (value === null || !/^\d{3,4}$/u.test(value)) return undefined
  const width = Number(value)
  return width >= CHAT_WIDTH_MIN && width <= CHAT_WIDTH_MAX ? width : undefined
}

export function loadChatWidth(): number {
  try {
    return parseStoredChatWidth(window.localStorage.getItem(CHAT_WIDTH_STORAGE_KEY)) ?? CHAT_WIDTH_DEFAULT
  } catch {
    return CHAT_WIDTH_DEFAULT
  }
}

export function storeChatWidth(width: number): void {
  try {
    window.localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, String(Math.round(width)))
  } catch {
    // Storage may be disabled; the live width remains valid for this page.
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
