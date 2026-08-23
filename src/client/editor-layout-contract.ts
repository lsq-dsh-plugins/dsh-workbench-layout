/** 中栏显隐布局与终端尺寸同步共享的稳定 DOM 契约。 */

export const FRAME_ATTRIBUTE = 'data-dsh-workbench-frame'
export const EDITOR_COLLAPSED_ATTRIBUTE = 'data-dsh-workbench-editor-collapsed'
export const EDITOR_TRANSITION_ATTRIBUTE = 'data-dsh-workbench-editor-transition'
export const EDITOR_RELEASE_ATTRIBUTE = 'data-dsh-workbench-editor-release'

export const TRANSITION_SIDEBAR_WIDTH = '--dsh-workbench-transition-sidebar-width'
export const TRANSITION_EDITOR_WIDTH = '--dsh-workbench-transition-editor-width'
export const TRANSITION_CONVERSATION_WIDTH = '--dsh-workbench-transition-conversation-width'

export const EDITOR_TRANSITION_START_EVENT = 'dsh-workbench:editor-transition-start'
export const EDITOR_TRANSITION_END_EVENT = 'dsh-workbench:editor-transition-end'

export interface EditorTransitionEventDetail {
  expanded: boolean
}

/** 只有工作台中栏处于展开态时，xterm 才能采用宿主宽度。 */
export function isEditorTrackExpanded(element: Element): boolean {
  const frame = element.closest(`[${FRAME_ATTRIBUTE}]`)
  return frame === null || !frame.hasAttribute(EDITOR_COLLAPSED_ATTRIBUTE)
}

/** 处理在过渡已经开始后才挂载的文件或终端视图。 */
export function isEditorTrackTransitioning(element: Element): boolean {
  const frame = element.closest(`[${FRAME_ATTRIBUTE}]`)
  return frame?.hasAttribute(EDITOR_TRANSITION_ATTRIBUTE) === true
    || frame?.hasAttribute(EDITOR_RELEASE_ATTRIBUTE) === true
}
