import { useState } from 'react'
import {
  IconBranchOutline16,
  IconChevronDownOutline14,
  IconDownloadOutline16,
  IconEllipsisOutline16,
  IconFolderOpenOutline16,
  IconListPenOutline16,
  IconLoadingOutline16,
  IconPersonalizationOutline16,
  IconRefreshOutline16,
  IconSendOutline16,
  Menu,
  Tooltip,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitBranches, GitRemoteOperation, GitStatus } from '../contracts.ts'
import type { GitChangeLayout } from './GitChangesView.tsx'
import css from './Workbench.module.css'

interface GitRepositoryToolbarProps {
  status: GitStatus | null
  branches: GitBranches | null
  showViewOptions: boolean
  changeLayout: GitChangeLayout
  busy: string | null
  onChangeLayout: (layout: GitChangeLayout) => void
  onSwitchBranch: (ref: string) => void
  onRemoteOperation: (operation: GitRemoteOperation) => void
  onRefresh: () => void
  t: TranslateNS<'workbench'>
}

/** 仓库标题工具栏：分支选择、视图切换和显式远程操作。 */
export function GitRepositoryToolbar(props: GitRepositoryToolbarProps) {
  return (
    <div className={css.panelHeader}>
      <BranchMenu {...props} />
      <div className={css.gitHeaderActions}>
        {props.showViewOptions && <ViewMenu {...props} />}
        <Tooltip label={syncLabel(props.status, props.t)} side="bottom" delayMs={450}>
          <button
            type="button"
            className={css.gitSyncButton}
            aria-label={syncLabel(props.status, props.t)}
            disabled={props.status?.upstream === undefined || props.busy !== null}
            onClick={() => { props.onRemoteOperation('sync') }}
          >
            {props.busy === 'sync' ? <IconLoadingOutline16 size={14} /> : <IconRefreshOutline16 size={14} />}
            {props.status?.upstream !== undefined && (
              <span>↓{props.status.behind ?? 0} ↑{props.status.ahead ?? 0}</span>
            )}
          </button>
        </Tooltip>
        <ActionsMenu {...props} />
      </div>
    </div>
  )
}

function BranchMenu(props: GitRepositoryToolbarProps) {
  const [open, setOpen] = useState(false)
  const local = props.branches?.branches.filter(branch => branch.kind === 'local') ?? []
  const remote = props.branches?.branches.filter(branch => branch.kind === 'remote') ?? []
  const items: MenuEntry[] = [
    { type: 'label', id: 'local-label', text: props.t('git.localBranches') },
    ...local.map(branch => ({ id: branch.ref, label: branch.name, icon: <IconBranchOutline16 size={14} /> })),
    { type: 'separator', id: 'branch-separator' },
    { type: 'label', id: 'remote-label', text: props.t('git.remoteBranches') },
    ...remote.map(branch => ({ id: branch.ref, label: branch.name, icon: <IconBranchOutline16 size={14} /> })),
  ]
  if (local.length === 0) items.splice(1, 0, { id: 'no-local', label: props.t('git.noLocalBranches'), disabled: true })
  if (remote.length === 0) items.push({ id: 'no-remote', label: props.t('git.noRemoteBranches'), disabled: true })
  const currentRef = props.branches?.branches.find(branch => branch.current)?.ref
  return (
    <Menu
      open={open}
      className={css.gitBranchMenu!}
      onClose={() => { setOpen(false) }}
      items={items}
      selectedId={currentRef}
      onSelect={(ref) => { setOpen(false); props.onSwitchBranch(ref) }}
      dense
      portal
      anchor={(
        <button
          type="button"
          className={css.gitBranchButton}
          aria-label={props.t('git.switchBranch')}
          aria-expanded={open}
          disabled={props.branches === null || props.busy !== null}
          onClick={() => { setOpen(value => !value) }}
        >
          <IconBranchOutline16 size={16} />
          <span>{props.status?.branch ?? (props.status?.detached === true ? props.t('git.detached') : props.t('git.title'))}</span>
          <IconChevronDownOutline14 size={12} />
        </button>
      )}
    />
  )
}

function ViewMenu(props: GitRepositoryToolbarProps) {
  const [open, setOpen] = useState(false)
  return (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      items={[
        { id: 'list', label: props.t('git.viewList'), icon: <IconListPenOutline16 size={14} /> },
        { id: 'tree', label: props.t('git.viewTree'), icon: <IconFolderOpenOutline16 size={14} /> },
      ]}
      selectedId={props.changeLayout}
      onSelect={(id) => {
        if (id === 'list' || id === 'tree') props.onChangeLayout(id)
        setOpen(false)
      }}
      align="end"
      dense
      portal
      anchor={(
        <Tooltip label={props.t('git.viewOptions')} side="bottom" delayMs={450}>
          <button type="button" className={css.iconButton} aria-label={props.t('git.viewOptions')} onClick={() => { setOpen(value => !value) }}>
            <IconPersonalizationOutline16 size={15} />
          </button>
        </Tooltip>
      )}
    />
  )
}

function ActionsMenu(props: GitRepositoryToolbarProps) {
  const [open, setOpen] = useState(false)
  const hasRemote = props.status?.hasRemote === true
  const hasUpstream = props.status?.upstream !== undefined
  return (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      items={[
        { id: 'fetch', label: props.t('git.fetch'), icon: <IconRefreshOutline16 size={14} />, disabled: !hasRemote },
        { id: 'pull', label: props.t('git.pull'), icon: <IconDownloadOutline16 size={14} />, disabled: !hasUpstream },
        { id: 'push', label: props.status?.upstream === undefined ? props.t('git.publishBranch') : props.t('git.push'), icon: <IconSendOutline16 size={14} />, disabled: !hasRemote },
        { id: 'sync', label: props.t('git.sync'), icon: <IconRefreshOutline16 size={14} />, disabled: !hasUpstream },
        { type: 'separator', id: 'remote-separator' },
        { id: 'refresh', label: props.t('git.refresh'), icon: <IconRefreshOutline16 size={14} /> },
      ]}
      onSelect={(id) => {
        setOpen(false)
        if (id === 'refresh') props.onRefresh()
        else if (id === 'fetch' || id === 'pull' || id === 'push' || id === 'sync') props.onRemoteOperation(id)
      }}
      align="end"
      dense
      portal
      anchor={(
        <Tooltip label={props.t('git.moreActions')} side="bottom" delayMs={450}>
          <button
            type="button"
            className={css.iconButton}
            aria-label={props.t('git.moreActions')}
            disabled={props.busy !== null}
            onClick={() => { setOpen(value => !value) }}
          >
            {props.busy === null ? <IconEllipsisOutline16 size={15} /> : <IconLoadingOutline16 size={15} />}
          </button>
        </Tooltip>
      )}
    />
  )
}

function syncLabel(status: GitStatus | null, t: TranslateNS<'workbench'>): string {
  if (status?.upstream === undefined) return t('git.syncUnavailable')
  return `${t('git.sync')} · ${status.upstream} · ↓${status.behind ?? 0} ↑${status.ahead ?? 0}`
}
