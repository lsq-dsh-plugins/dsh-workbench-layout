import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconCloseOutline16,
  IconCodeOutline16,
  IconFolderClose16,
  IconFolderOpen16,
  IconPlusOutline16,
  IconTrashOutline16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitFileStatus } from '../contracts.ts'
import { buildGitPathTree, type GitFileLayout, type GitPathTreeNode } from './git-tree.ts'
import css from './Workbench.module.css'

interface GitChangesViewProps {
  stagedFiles: GitFileStatus[]
  changedFiles: GitFileStatus[]
  layout: GitFileLayout
  selectedKind: 'staged' | 'worktree' | undefined
  selectedPath: string | undefined
  busy: boolean
  onOpen: (file: GitFileStatus, staged: boolean) => void
  onStage: (file: GitFileStatus) => void
  onUnstage: (file: GitFileStatus) => void
  onStageAll: () => void
  onUnstageAll: () => void
  onDiscard: (file: GitFileStatus) => void
  onDiscardAll: () => void
  t: TranslateNS<'workbench'>
}

/** VS Code 风格的暂存区/工作区视图，支持扁平列表和目录树。 */
export function GitChangesView(props: GitChangesViewProps) {
  return (
    <div className={css.gitContent} data-change-layout={props.layout}>
      <ChangeSection
        title={props.t('git.staged')}
        files={props.stagedFiles}
        empty={props.t('git.noStaged')}
        layout={props.layout}
        selected={file => props.selectedKind === 'staged' && props.selectedPath === file.path}
        status={file => normalizeStatus(file.index)}
        onOpen={file => { props.onOpen(file, true) }}
        onAction={props.onUnstage}
        actionLabel={props.t('git.unstage')}
        actionIcon={<IconCloseOutline16 size={12} />}
        headerActions={[{ label: props.t('git.unstageAll'), icon: <IconCloseOutline16 size={14} />, action: props.onUnstageAll }]}
        busy={props.busy}
      />
      <ChangeSection
        title={props.t('git.changes')}
        files={props.changedFiles}
        empty={props.t('git.noChanges')}
        layout={props.layout}
        selected={file => props.selectedKind === 'worktree' && props.selectedPath === file.path}
        status={file => normalizeStatus(file.worktree === ' ' ? file.index : file.worktree)}
        onOpen={file => { props.onOpen(file, false) }}
        onAction={props.onStage}
        actionLabel={props.t('git.stage')}
        actionIcon={<IconPlusOutline16 size={12} />}
        secondaryAction={props.onDiscard}
        secondaryActionLabel={props.t('git.discard')}
        secondaryActionIcon={<IconTrashOutline16 size={12} />}
        headerActions={[
          { label: props.t('git.stageAll'), icon: <IconPlusOutline16 size={14} />, action: props.onStageAll },
          { label: props.t('git.discardAll'), icon: <IconTrashOutline16 size={14} />, action: props.onDiscardAll },
        ]}
        busy={props.busy}
      />
    </div>
  )
}

function ChangeSection(props: {
  title: string
  files: GitFileStatus[]
  empty: string
  layout: GitFileLayout
  selected: (file: GitFileStatus) => boolean
  status: (file: GitFileStatus) => string
  onOpen: (file: GitFileStatus) => void
  onAction: (file: GitFileStatus) => void
  actionLabel: string
  actionIcon: ReactNode
  secondaryAction?: (file: GitFileStatus) => void
  secondaryActionLabel?: string
  secondaryActionIcon?: ReactNode
  headerActions: Array<{ label: string; icon: ReactNode; action: () => void }>
  busy: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  return (
    <section className={css.gitSection}>
      <div className={css.gitSectionHeader}>
        <button type="button" className={css.gitSectionToggle} aria-expanded={expanded} onClick={() => { setExpanded(value => !value) }}>
          {expanded ? <IconChevronDownOutline14 size={14} /> : <IconChevronRightOutline14 size={14} />}
          <span>{props.title}</span><span className={css.gitCount}>{props.files.length}</span>
        </button>
        <div className={css.gitSectionActions}>
          {props.headerActions.map(action => (
            <Tooltip key={action.label} label={action.label} delayMs={400}>
              <button type="button" className={css.gitSectionAction} aria-label={action.label} disabled={props.busy || props.files.length === 0} onClick={action.action}>
                {action.icon}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>
      {expanded && (props.files.length === 0
        ? <div className={css.gitSectionEmpty}>{props.empty}</div>
        : props.layout === 'list'
          ? props.files.map(file => <ChangeRow key={file.path} file={file} {...rowProps(props, file)} showDirectory />)
          : <ChangeTree files={props.files} rowProps={file => rowProps(props, file)} />)}
    </section>
  )
}

function rowProps(props: Parameters<typeof ChangeSection>[0], file: GitFileStatus) {
  return {
    status: props.status(file),
    selected: props.selected(file),
    onOpen: () => { props.onOpen(file) },
    onAction: () => { props.onAction(file) },
    actionLabel: props.actionLabel,
    actionIcon: props.actionIcon,
    busy: props.busy,
    ...(props.secondaryAction === undefined ? {} : {
      secondaryAction: () => { props.secondaryAction?.(file) },
      secondaryActionLabel: props.secondaryActionLabel,
      secondaryActionIcon: props.secondaryActionIcon,
    }),
  }
}

function ChangeTree(props: {
  files: GitFileStatus[]
  rowProps: (file: GitFileStatus) => Omit<ChangeRowProps, 'file'>
}) {
  const root = useMemo(() => buildGitPathTree(props.files), [props.files])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const toggle = (path: string) => {
    setCollapsed(current => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }
  return <TreeChildren node={root} depth={0} collapsed={collapsed} onToggle={toggle} rowProps={props.rowProps} />
}

function TreeChildren(props: {
  node: GitPathTreeNode<GitFileStatus>
  depth: number
  collapsed: Set<string>
  onToggle: (path: string) => void
  rowProps: (file: GitFileStatus) => Omit<ChangeRowProps, 'file'>
}) {
  return (
    <>
      {props.node.directories.map(directory => {
        const expanded = !props.collapsed.has(directory.path)
        return (
          <div key={directory.path}>
            <button
              type="button"
              className={css.gitFolderRow}
              style={{ '--git-tree-depth': props.depth } as CSSProperties}
              aria-expanded={expanded}
              title={directory.path}
              onClick={() => { props.onToggle(directory.path) }}
            >
              {expanded ? <IconChevronDownOutline14 size={12} /> : <IconChevronRightOutline14 size={12} />}
              {expanded ? <IconFolderOpen16 size={15} /> : <IconFolderClose16 size={15} />}
              <span className={css.rowName}>{directory.name}</span>
            </button>
            {expanded && <TreeChildren {...props} node={directory} depth={props.depth + 1} />}
          </div>
        )
      })}
      {props.node.files.map(file => (
        <ChangeRow
          key={file.path}
          file={file}
          {...props.rowProps(file)}
          depth={props.depth}
        />
      ))}
    </>
  )
}

interface ChangeRowProps {
  file: GitFileStatus
  status: string
  selected: boolean
  onOpen: () => void
  onAction: () => void
  actionLabel: string
  actionIcon: ReactNode
  secondaryAction?: () => void
  secondaryActionLabel?: string
  secondaryActionIcon?: ReactNode
  busy: boolean
  showDirectory?: boolean
  depth?: number
}

function ChangeRow(props: ChangeRowProps) {
  const renamed = props.file.originalPath !== undefined && props.file.originalPath !== props.file.path
  return (
    <div
      className={css.gitChangeRow}
      data-git-change-row=""
      data-selected={props.selected || undefined}
      data-tree={props.depth === undefined ? undefined : ''}
      style={props.depth === undefined ? undefined : { '--git-tree-depth': props.depth } as CSSProperties}
    >
      <button type="button" className={css.gitChangeMain} onClick={props.onOpen} title={renamed ? `${props.file.originalPath} → ${props.file.path}` : props.file.path}>
        <IconCodeOutline16 size={15} />
        <span className={css.gitFileText}>
          <span className={css.rowName}>{fileName(props.file.path)}</span>
          {props.showDirectory === true && <span className={css.gitFileDirectory}>{directoryName(props.file.path)}</span>}
        </span>
        <span className={css.statusBadge} data-status={props.status}>{props.status}</span>
      </button>
      <div className={css.gitRowActions} data-git-row-actions="">
        <Tooltip label={props.actionLabel} delayMs={400}>
          <button type="button" className={`${css.gitSectionAction} ${css.gitRowAction}`} aria-label={`${props.actionLabel} ${props.file.path}`} disabled={props.busy} onClick={props.onAction}>
            {props.actionIcon}
          </button>
        </Tooltip>
        {props.secondaryAction !== undefined && props.secondaryActionLabel !== undefined && (
          <Tooltip label={props.secondaryActionLabel} delayMs={400}>
            <button type="button" className={`${css.gitSectionAction} ${css.gitRowAction}`} aria-label={`${props.secondaryActionLabel} ${props.file.path}`} disabled={props.busy} onClick={props.secondaryAction}>
              {props.secondaryActionIcon}
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

function normalizeStatus(status: string): string {
  return status === '?' ? 'U' : status === ' ' ? 'M' : status
}

function fileName(path: string): string {
  return path.split('/').at(-1) ?? path
}

function directoryName(path: string): string {
  const boundary = path.lastIndexOf('/')
  return boundary < 0 ? '' : path.slice(0, boundary)
}
