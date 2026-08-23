/** 收起侧栏的模式化快捷操作；复用官方 36px rail 几何。 */

import {
  IconListPenOutline16,
  IconPlusOutline16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { IconCommitGraphOutline16 } from './CommitGraphIcon.tsx'
import type { WorkbenchController, WorkbenchTerminalTab } from './controller.ts'
import { IconFileAddOutline16, IconFolderAddOutline16 } from './CreateEntryIcons.tsx'
import { IconTerminalOutline16 } from './TerminalIcon.tsx'
import { useWorkbench } from './use-workbench.ts'
import css from './Workbench.module.css'

interface WorkbenchRailProps {
  controller: WorkbenchController
  workspaceId: string | undefined
  expandSidebar(): void
  t: TranslateNS<'workbench'>
}

export function WorkbenchRail({ controller, workspaceId, expandSidebar, t }: WorkbenchRailProps) {
  const state = useWorkbench(controller)
  const requestAndExpand = (action: 'files.newFile' | 'files.newDirectory'): void => {
    controller.requestSidebarAction(action, workspaceId)
    expandSidebar()
  }

  if (state.sidebarMode === 'files') {
    return (
      <RailActions label={t('mode.files')}>
        <RailButton label={t('files.newFile')} disabled={workspaceId === undefined} onClick={() => { requestAndExpand('files.newFile') }}>
          <IconFileAddOutline16 size={18} />
        </RailButton>
        <RailButton label={t('files.newDirectory')} disabled={workspaceId === undefined} onClick={() => { requestAndExpand('files.newDirectory') }}>
          <IconFolderAddOutline16 size={18} />
        </RailButton>
      </RailActions>
    )
  }

  if (state.sidebarMode === 'git') {
    const graph = state.gitView === 'graph'
    return (
      <RailActions label={t('mode.git')}>
        <RailButton
          label={graph ? t('git.switchToChanges') : t('git.switchToGraph')}
          active={graph}
          disabled={workspaceId === undefined}
          onClick={() => {
            controller.toggleGitView()
            expandSidebar()
          }}
        >
          {graph ? <IconListPenOutline16 size={18} /> : <IconCommitGraphOutline16 size={18} />}
        </RailButton>
      </RailActions>
    )
  }

  if (state.sidebarMode === 'terminal') {
    const terminals = state.tabs.filter((tab): tab is WorkbenchTerminalTab => tab.kind === 'terminal')
    return (
      <RailActions label={t('mode.terminal')}>
        <RailButton label={t('terminal.new')} disabled={workspaceId === undefined} onClick={() => { controller.openTerminal(workspaceId) }}>
          <span className={css.railTerminalAdd} aria-hidden>
            <IconTerminalOutline16 size={18} />
            <IconPlusOutline16 className={css.railAddGlyph} size={8} />
          </span>
        </RailButton>
        {terminals.map(terminal => {
          const name = t('terminal.name', { index: String(terminal.sequence) })
          return (
            <RailButton
              key={terminal.id}
              label={name}
              active={terminal.id === state.activeTabId}
              status={terminal.status}
              onClick={() => { controller.selectTab(terminal.id) }}
            >
              <IconTerminalOutline16 size={18} />
            </RailButton>
          )
        })}
      </RailActions>
    )
  }

  return null
}

function RailActions({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className={css.collapsedBody} role="toolbar" aria-label={label}>{children}</div>
}

function RailButton({
  label,
  children,
  active = false,
  disabled = false,
  status,
  onClick,
}: {
  label: string
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  status?: WorkbenchTerminalTab['status']
  onClick(): void
}) {
  return (
    <Tooltip label={label} delayMs={500}>
      <button
        type="button"
        className={css.railButton}
        data-active={active || undefined}
        data-status={status}
        aria-label={label}
        aria-pressed={active || undefined}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  )
}
