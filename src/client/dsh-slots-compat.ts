/**
 * Local SlotMap and standard-props augmentation for DSH 0.1.5-rc.1.
 *
 * Module augmentations from linked .d.ts packages are not reliably picked
 * up under this project's tsconfig (skipLibCheck + verbatimModuleSyntax).
 * Declaring them in a local .ts source file ensures they are always included
 * in the program. At runtime DSH's own module table provides the real slots.
 */
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceMembership } from './workspace-binding.ts'

export interface RightbarOwnerProps {
  width: number
  viewportWidth: number
  canShow: boolean
}

export interface SidebarOwnerProps {
  collapsed: boolean
  width: number
}

export interface SidebarWorkspacesOwnerProps {
  wide: boolean
  expandSidebar: () => void
}

export interface SidebarFooterActionOwnerProps {
  wide: boolean
}

export type UsePanelInfo = SnapshotSelectorHook<{ activePanelId: string | null }>

export interface WorkspaceSnapshot {
  items: readonly WorkspaceMembership[]
  recentWorkspaceId: string | undefined
}

export interface SessionsSnapshot {
  current: string
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface GlobalStandardProps {
    usePanelInfo: UsePanelInfo
  }
  interface SessionStandardProps {
    useSession: SnapshotSelectorHook<unknown>
    sessionId: string
    useProjection: SnapshotSelectorHook<unknown>
    useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
    useSessions: SnapshotSelectorHook<SessionsSnapshot>
    useSessionPendingInteraction: SnapshotSelectorHook<unknown>
  }
  interface SlotMap {
    'sidebar': { kind: 'single'; scope: 'root'; owner: SidebarOwnerProps }
    'main': { kind: 'keyed'; scope: 'root' }
    'rightbar': { kind: 'single'; scope: 'root'; owner: RightbarOwnerProps }
    'rightbar.session': { kind: 'single'; scope: 'session' }
    'shell.overlay': { kind: 'list'; scope: 'root' }
    'sidebar.workspaces': { kind: 'single'; scope: 'session'; owner: SidebarWorkspacesOwnerProps }
    'sidebar.footer.action': { kind: 'single'; scope: 'root'; owner: SidebarFooterActionOwnerProps }
    'conversation.session': { kind: 'single'; scope: 'session' }
    'conversation.session.header.utilities': { kind: 'single'; scope: 'session' }
    'conversation.session.header.corner': { kind: 'single'; scope: 'session' }
    'conversation.input.model': { kind: 'single'; scope: 'session' }
    'settings.general': { kind: 'single'; scope: 'root' }
    'settings.locale': { kind: 'single'; scope: 'root' }
  }
}
