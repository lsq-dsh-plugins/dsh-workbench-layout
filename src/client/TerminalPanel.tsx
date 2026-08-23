/** 左栏终端实例管理，与工作区而非会话绑定。 */

import { useEffect, useRef } from 'react'
import { IconCloseOutline16, IconPlusOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchController, WorkbenchTerminalTab } from './controller.ts'
import type { WorkbenchKey } from './locales.ts'
import { useWorkbench } from './use-workbench.ts'
import css from './Workbench.module.css'

export interface TerminalPanelProps {
  controller: WorkbenchController
  workspaceId: string | undefined
  t: TranslateNS<'workbench'>
}

export function TerminalPanel({ controller, workspaceId, t }: TerminalPanelProps) {
  const state = useWorkbench(controller)
  const terminals = state.workspaceId === workspaceId
    ? state.tabs.filter((tab): tab is WorkbenchTerminalTab => tab.kind === 'terminal')
    : []
  const openedWorkspace = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (workspaceId === undefined || openedWorkspace.current === workspaceId) return
    openedWorkspace.current = workspaceId
    if (terminals.length === 0) controller.openTerminal(workspaceId)
  }, [controller, terminals.length, workspaceId])

  if (workspaceId === undefined) return <div className={css.emptyState}>{t('terminal.emptyWorkspace')}</div>
  return (
    <div className={css.panelBody}>
      <header className={css.panelHeader}>
        <span>{t('terminal.title')}</span>
        <Tooltip label={t('terminal.new')} delayMs={500}>
          <button
            type="button"
            className={css.iconButton}
            aria-label={t('terminal.new')}
            onClick={() => { controller.openTerminal(workspaceId) }}
          >
            <IconPlusOutline16 size={16} />
          </button>
        </Tooltip>
      </header>
      <div className={css.terminalList} role="list">
        {terminals.length === 0 && <div className={css.emptyState}>{t('terminal.empty')}</div>}
        {terminals.map((terminal) => {
          const name = t('terminal.name', { index: String(terminal.sequence) })
          return (
            <div
              key={terminal.id}
              className={css.terminalRow}
              data-active={terminal.id === state.activeTabId || undefined}
              role="listitem"
            >
              <button
                type="button"
                className={css.terminalSelect}
                onClick={() => { controller.selectTab(terminal.id) }}
              >
                <span className={css.terminalStatusDot} data-status={terminal.status} aria-hidden />
                <span className={css.terminalRowName}>{name}</span>
                <span className={css.terminalRowStatus}>{terminalStatus(terminal, t)}</span>
              </button>
              <button
                type="button"
                className={css.terminalClose}
                aria-label={t('terminal.close', { name })}
                onClick={() => { controller.closeTab(terminal.id) }}
              >
                <IconCloseOutline16 size={13} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function terminalStatus(tab: WorkbenchTerminalTab, t: TranslateNS<'workbench'>): string {
  switch (tab.status) {
    case 'connecting': return t('terminal.connecting')
    case 'running': return tab.shell ?? t('terminal.running')
    case 'exited': return t('terminal.exited')
    case 'error': return t('terminal.failed')
  }
}
