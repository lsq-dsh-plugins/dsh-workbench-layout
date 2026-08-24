/** Route DSH's native produced-file mentions into the Workspace editor. */

const FILE_MENTION_BUTTON_SELECTOR = "button[type='button'][title][aria-label]"
const TOOL_FILE_VARIANTS = new Set(['read', 'write', 'edit'])

export interface ConversationFileController {
  store: {
    getSnapshot(): { workspaceId?: string }
  }
  openConversationFile(workspaceId: string, path: string): Promise<void>
}

export interface ConversationFileRoutingLogger {
  info(message: string): void
}

export interface ConversationFileRouting {
  dispose(): void
}

/**
 * DSH renders a settled produced-file mention as `code > button`, with the
 * tool-provided path in `title`, and file-tool paths as a direct button in its
 * DisclosureRow. Capture only those native affordances before ui-conversation's
 * system opener runs; ordinary Markdown links and code stay under the official
 * renderer.
 */
export function createConversationFileRouting(
  column: HTMLElement,
  controller: ConversationFileController,
  logger: ConversationFileRoutingLogger,
): ConversationFileRouting {
  const onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0) return
    const path = nativeFileReferencePath(column, event.target)
    if (path === undefined) return
    const workspaceId = controller.store.getSnapshot().workspaceId
    if (workspaceId === undefined) return

    event.preventDefault()
    event.stopPropagation()
    void controller.openConversationFile(workspaceId, path)
  }

  column.addEventListener('click', onClick, true)
  logger.info('workbench-layout: native conversation file references route to the middle Workspace editor')
  return {
    dispose: () => { column.removeEventListener('click', onClick, true) },
  }
}

/** Recognize only the semantic DOM contracts emitted by official file openers. */
export function nativeFileReferencePath(column: HTMLElement, target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined
  const button = target.closest<HTMLButtonElement>("button[type='button']")
  if (button === null || !column.contains(button)) return undefined

  const code = button.parentElement
  if (button.matches(FILE_MENTION_BUTTON_SELECTOR)
    && code?.tagName === 'CODE'
    && code.closest('pre') === null) {
    const path = button.getAttribute('title')
    return path === null || path === '' ? undefined : path
  }

  const row = button.parentElement
  const tool = button.closest<HTMLElement>('[data-tool][data-variant]')
  if (row?.hasAttribute('data-disclosure-row') !== true
    || button.hasAttribute('aria-expanded')
    || tool === null
    || !TOOL_FILE_VARIANTS.has(tool.dataset.variant ?? '')) return undefined
  const path = button.textContent?.trim()
  return path === undefined || path === '' ? undefined : path
}
