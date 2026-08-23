import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  IconBranchOutline16,
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconCloseOutline16,
  IconCodeOutline16,
  IconPlusOutline16,
  IconRefreshOutline14,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitCommit, GitCommitFiles, GitFileStatus, GitHistory, GitStatus } from '../contracts.ts'
import type { WorkbenchController } from './controller.ts'
import { useWorkbench } from './use-workbench.ts'
import css from './Workbench.module.css'

interface GitPanelProps {
  controller: WorkbenchController
  sessionId: string | undefined
  t: TranslateNS<'workbench'>
}

type GitView = 'changes' | 'history'
type CommitFilesState =
  | { state: 'loading' }
  | { state: 'ready'; value: GitCommitFiles }
  | { state: 'error'; message: string }

/** 参考 VS Code Source Control 组织更改、暂存区与历史提交。 */
export function GitPanel({ controller, sessionId, t }: GitPanelProps) {
  const workbench = useWorkbench(controller)
  const [view, setView] = useState<GitView>('changes')
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [history, setHistory] = useState<GitHistory | null>(null)
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null)
  const [commitFiles, setCommitFiles] = useState<Record<string, CommitFilesState>>({})
  const [loading, setLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (sessionId === undefined) return
    setLoading(true)
    setError(null)
    try {
      const nextStatus = await controller.api.gitStatus(sessionId)
      setStatus(nextStatus)
      setHistory(nextStatus.available ? await controller.api.gitHistory(sessionId) : null)
      setCommitFiles({})
      setExpandedCommit(null)
    } catch (reason: unknown) {
      setError(messageOf(reason))
    } finally {
      setLoading(false)
    }
  }, [controller, sessionId])

  useEffect(() => {
    setStatus(null)
    setHistory(null)
    setResult(null)
    setExpandedCommit(null)
    setCommitFiles({})
    void refresh()
  }, [refresh])

  const update = async (operation: () => Promise<GitStatus>): Promise<boolean> => {
    setError(null)
    try {
      setStatus(await operation())
      return true
    } catch (reason: unknown) {
      setError(messageOf(reason))
      return false
    }
  }

  const stage = async (file: GitFileStatus): Promise<void> => {
    if (sessionId === undefined) return
    if (await update(() => controller.api.gitStage(sessionId, file.path))) {
      await controller.openDiff(sessionId, file.path, true)
    }
  }

  const unstage = async (file: GitFileStatus): Promise<void> => {
    if (sessionId === undefined) return
    if (await update(() => controller.api.gitUnstage(sessionId, file.path))) {
      await controller.openDiff(sessionId, file.path, false)
    }
  }

  const commit = async (): Promise<void> => {
    if (sessionId === undefined) return
    setCommitting(true)
    setError(null)
    setResult(null)
    try {
      const committed = await controller.api.gitCommit(sessionId, message)
      setMessage('')
      setResult(committed.summary)
      controller.showFile()
      await refresh()
    } catch (reason: unknown) {
      setError(messageOf(reason))
    } finally {
      setCommitting(false)
    }
  }

  const toggleCommit = async (commitValue: GitCommit): Promise<void> => {
    if (sessionId === undefined) return
    if (expandedCommit === commitValue.hash) {
      setExpandedCommit(null)
      return
    }
    setExpandedCommit(commitValue.hash)
    if (commitFiles[commitValue.hash] !== undefined) return
    setCommitFiles(current => ({ ...current, [commitValue.hash]: { state: 'loading' } }))
    try {
      const value = await controller.api.gitCommitFiles(sessionId, commitValue.hash)
      setCommitFiles(current => ({ ...current, [commitValue.hash]: { state: 'ready', value } }))
    } catch (reason: unknown) {
      setCommitFiles(current => ({
        ...current,
        [commitValue.hash]: { state: 'error', message: messageOf(reason) },
      }))
    }
  }

  if (sessionId === undefined) return <div className={css.emptyState}>{t('git.emptySession')}</div>
  const stagedFiles = status?.files.filter(isStaged) ?? []
  const changedFiles = status?.files.filter(hasWorktreeChange) ?? []
  return (
    <div className={css.panelBody}>
      <div className={css.panelHeader}>
        <span className={css.gitTitle}><IconBranchOutline16 size={16} />{status?.branch ?? t('git.title')}</span>
        <Tooltip label={t('git.refresh')} delayMs={500}>
          <button type="button" className={css.iconButton} aria-label={t('git.refresh')} onClick={() => { void refresh() }}>
            <IconRefreshOutline14 size={14} />
          </button>
        </Tooltip>
      </div>
      <div className={css.gitViewTabs} role="tablist" aria-label={t('git.title')}>
        <button type="button" role="tab" aria-selected={view === 'changes'} data-active={view === 'changes' || undefined} onClick={() => { setView('changes') }}>
          {t('git.changesTab')}<span>{stagedFiles.length + changedFiles.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={view === 'history'} data-active={view === 'history' || undefined} onClick={() => { setView('history') }}>
          {t('git.historyTab')}<span>{history?.commits.length ?? 0}</span>
        </button>
      </div>
      {error !== null && <div className={css.error} role="alert">{error}</div>}
      {result !== null && <div className={css.success} role="status">{result}</div>}
      {loading && status === null && <div className={css.emptyState}>{t('files.loading')}</div>}
      {status?.available === false && <div className={css.emptyState}>{status.message}</div>}
      {status?.available === true && view === 'changes' && (
        <>
          <div className={css.commitBox}>
            <textarea
              value={message}
              placeholder={t('git.commitPlaceholder')}
              aria-label={t('git.commitPlaceholder')}
              rows={2}
              onChange={event => { setMessage(event.currentTarget.value) }}
            />
            <Button variant="primary" size="sm" disabled={stagedFiles.length === 0 || message.trim() === '' || committing} onClick={() => { void commit() }}>
              {committing ? t('git.committing') : t('git.commit')}
            </Button>
          </div>
          <div className={css.gitContent}>
            <ChangeSection title={t('git.staged')} files={stagedFiles} empty={t('git.noStaged')}>
              {file => (
                <GitChangeRow
                  key={`staged:${file.path}`}
                  file={file}
                  status={normalizeStatus(file.index)}
                  selected={workbench.diff?.kind === 'staged' && workbench.diff.path === file.path}
                  onDiff={() => { void controller.openDiff(sessionId, file.path, true) }}
                  onAction={() => { void unstage(file) }}
                  actionLabel={t('git.unstage')}
                  actionIcon={<IconCloseOutline16 size={14} />}
                />
              )}
            </ChangeSection>
            <ChangeSection title={t('git.changes')} files={changedFiles} empty={t('git.noChanges')}>
              {file => (
                <GitChangeRow
                  key={`worktree:${file.path}`}
                  file={file}
                  status={normalizeStatus(file.worktree === ' ' ? file.index : file.worktree)}
                  selected={workbench.diff?.kind === 'worktree' && workbench.diff.path === file.path}
                  onDiff={() => { void controller.openDiff(sessionId, file.path, false) }}
                  onAction={() => { void stage(file) }}
                  actionLabel={t('git.stage')}
                  actionIcon={<IconPlusOutline16 size={14} />}
                />
              )}
            </ChangeSection>
          </div>
        </>
      )}
      {status?.available === true && view === 'history' && (
        <HistoryView
          history={history}
          expandedCommit={expandedCommit}
          commitFiles={commitFiles}
          selectedRevision={workbench.diff?.revision}
          selectedPath={workbench.diff?.path}
          onToggle={commitValue => { void toggleCommit(commitValue) }}
          onOpen={(commitValue, path) => { void controller.openCommitDiff(sessionId, commitValue, path) }}
          t={t}
        />
      )}
    </div>
  )
}

function ChangeSection(props: {
  title: string
  files: GitFileStatus[]
  empty: string
  children: (file: GitFileStatus) => React.ReactNode
}) {
  const [expanded, setExpanded] = useState(true)
  return (
    <section className={css.gitSection}>
      <button type="button" className={css.gitSectionHeader} aria-expanded={expanded} onClick={() => { setExpanded(value => !value) }}>
        {expanded ? <IconChevronDownOutline14 size={14} /> : <IconChevronRightOutline14 size={14} />}
        <span>{props.title}</span><span className={css.gitCount}>{props.files.length}</span>
      </button>
      {expanded && (props.files.length === 0
        ? <div className={css.gitSectionEmpty}>{props.empty}</div>
        : props.files.map(props.children))}
    </section>
  )
}

function GitChangeRow(props: {
  file: GitFileStatus
  status: string
  selected: boolean
  onDiff: () => void
  onAction: () => void
  actionLabel: string
  actionIcon: React.ReactNode
}) {
  const renamed = props.file.originalPath !== undefined && props.file.originalPath !== props.file.path
  return (
    <div className={css.gitChangeRow} data-selected={props.selected || undefined}>
      <button type="button" className={css.gitChangeMain} onClick={props.onDiff} title={renamed ? `${props.file.originalPath} → ${props.file.path}` : props.file.path}>
        <IconCodeOutline16 size={15} />
        <span className={css.gitFileText}>
          <span className={css.rowName}>{fileName(props.file.path)}</span>
          <span className={css.gitFileDirectory}>{directoryName(props.file.path)}</span>
        </span>
        <span className={css.statusBadge} data-status={props.status}>{props.status}</span>
      </button>
      <Tooltip label={props.actionLabel} delayMs={400}>
        <button type="button" className={css.gitRowAction} aria-label={`${props.actionLabel} ${props.file.path}`} onClick={props.onAction}>
          {props.actionIcon}
        </button>
      </Tooltip>
    </div>
  )
}

function HistoryView(props: {
  history: GitHistory | null
  expandedCommit: string | null
  commitFiles: Record<string, CommitFilesState>
  selectedRevision: string | undefined
  selectedPath: string | undefined
  onToggle: (commit: GitCommit) => void
  onOpen: (commit: GitCommit, path: string) => void
  t: TranslateNS<'workbench'>
}) {
  return (
    <div className={css.gitHistory}>
      {props.history === null
        ? <div className={css.gitSectionEmpty}>{props.t('git.historyLoading')}</div>
        : props.history.commits.length === 0
          ? <div className={css.gitSectionEmpty}>{props.t('git.noHistory')}</div>
          : props.history.commits.map(commit => {
              const expanded = props.expandedCommit === commit.hash
              const files = props.commitFiles[commit.hash]
              return (
                <div key={commit.hash} className={css.commitEntry}>
                  <button type="button" className={css.commitRow} aria-expanded={expanded} onClick={() => { props.onToggle(commit) }}>
                    <span className={css.commitChevron}>{expanded ? <IconChevronDownOutline14 size={14} /> : <IconChevronRightOutline14 size={14} />}</span>
                    <span className={css.commitGraph}><span /></span>
                    <span className={css.commitContent}>
                      <span className={css.commitSubject}>{commit.subject}</span>
                      <span className={css.commitHash}>{commit.shortHash}</span>
                      <span className={css.commitMeta}>{commit.author} · {formatCommitTime(commit.authoredAt)}</span>
                    </span>
                  </button>
                  {expanded && (
                    <div className={css.commitFiles}>
                      {files === undefined || files.state === 'loading'
                        ? <div className={css.gitSectionEmpty}>{props.t('git.commitFilesLoading')}</div>
                        : files.state === 'error'
                          ? <div className={css.error} role="alert">{files.message}</div>
                          : files.value.files.length === 0
                            ? <div className={css.gitSectionEmpty}>{props.t('git.noCommitFiles')}</div>
                            : files.value.files.map(file => (
                              <button
                                type="button"
                                key={`${commit.hash}:${file.path}`}
                                className={css.historyFileRow}
                                data-selected={props.selectedRevision === commit.hash && props.selectedPath === file.path || undefined}
                                title={file.originalPath === undefined ? file.path : `${file.originalPath} → ${file.path}`}
                                onClick={() => { props.onOpen(commit, file.path) }}
                              >
                                <IconCodeOutline16 size={14} />
                                <span className={css.gitFileText}>
                                  <span className={css.rowName}>{fileName(file.path)}</span>
                                  <span className={css.gitFileDirectory}>{directoryName(file.path)}</span>
                                </span>
                                <span className={css.statusBadge} data-status={normalizeStatus(file.status)}>{normalizeStatus(file.status)}</span>
                              </button>
                            ))}
                    </div>
                  )}
                </div>
              )
            })}
      {props.history?.truncated === true && <div className={css.gitSectionEmpty}>{props.t('git.historyTruncated')}</div>}
    </div>
  )
}

function isStaged(file: GitFileStatus): boolean {
  return file.index !== ' ' && file.index !== '?'
}

function hasWorktreeChange(file: GitFileStatus): boolean {
  return file.worktree !== ' ' || file.index === '?'
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

function formatCommitTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
