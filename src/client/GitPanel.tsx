import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  IconBranchOutline16,
  IconCodeOutline16,
  IconCloseOutline16,
  IconPlusOutline16,
  IconRefreshOutline14,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { GitCommit, GitFileStatus, GitHistory, GitStatus } from '../contracts.ts'
import type { WorkbenchController } from './controller.ts'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { useWorkbench } from './use-workbench.ts'
import css from './Workbench.module.css'

interface GitPanelProps {
  controller: WorkbenchController
  sessionId: string | undefined
  t: TranslateNS<'workbench'>
}

/** Grouped Git changes, index, history, and explicit commit form. */
export function GitPanel({ controller, sessionId, t }: GitPanelProps) {
  const workbench = useWorkbench(controller)
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [history, setHistory] = useState<GitHistory | null>(null)
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
    void refresh()
  }, [refresh])

  const update = async (operation: () => Promise<GitStatus>): Promise<void> => {
    setError(null)
    try {
      setStatus(await operation())
    } catch (reason: unknown) {
      setError(messageOf(reason))
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
      await refresh()
    } catch (reason: unknown) {
      setError(messageOf(reason))
    } finally {
      setCommitting(false)
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
      {error !== null && <div className={css.error} role="alert">{error}</div>}
      {result !== null && <div className={css.success} role="status">{result}</div>}
      {loading && status === null && <div className={css.emptyState}>{t('files.loading')}</div>}
      {status?.available === false && <div className={css.emptyState}>{status.message}</div>}
      {status?.available === true && (
        <div className={css.gitContent}>
          <ChangeSection title={t('git.changes')} files={changedFiles} empty={t('git.noChanges')}>
            {file => (
              <GitChangeRow
                key={`worktree:${file.path}`}
                file={file}
                scope="worktree"
                selected={workbench.diff?.kind === 'worktree' && workbench.diff.path === file.path}
                onDiff={() => { void controller.openDiff(sessionId, file.path, false) }}
                onAction={() => { void update(() => controller.api.gitStage(sessionId, file.path)) }}
                actionLabel={t('git.stage')}
                actionIcon={<IconPlusOutline16 size={14} />}
              />
            )}
          </ChangeSection>
          <ChangeSection title={t('git.staged')} files={stagedFiles} empty={t('git.noStaged')}>
            {file => (
              <GitChangeRow
                key={`staged:${file.path}`}
                file={file}
                scope="staged"
                selected={workbench.diff?.kind === 'staged' && workbench.diff.path === file.path}
                onDiff={() => { void controller.openDiff(sessionId, file.path, true) }}
                onAction={() => { void update(() => controller.api.gitUnstage(sessionId, file.path)) }}
                actionLabel={t('git.unstage')}
                actionIcon={<IconCloseOutline16 size={14} />}
              />
            )}
          </ChangeSection>
          <HistorySection
            history={history}
            selectedRevision={workbench.diff?.revision}
            onOpen={commit => { void controller.openCommitDiff(sessionId, commit) }}
            t={t}
          />
        </div>
      )}
      {status?.available === true && (
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
  return (
    <section className={css.gitSection}>
      <header className={css.gitSectionHeader}>
        <span>{props.title}</span><span className={css.gitCount}>{props.files.length}</span>
      </header>
      {props.files.length === 0
        ? <div className={css.gitSectionEmpty}>{props.empty}</div>
        : props.files.map(props.children)}
    </section>
  )
}

function GitChangeRow(props: {
  file: GitFileStatus
  scope: 'worktree' | 'staged'
  selected: boolean
  onDiff: () => void
  onAction: () => void
  actionLabel: string
  actionIcon: React.ReactNode
}) {
  const status = props.scope === 'staged' ? props.file.index : props.file.worktree
  return (
    <div className={css.gitChangeRow} data-selected={props.selected || undefined}>
      <button type="button" className={css.gitChangeMain} onClick={props.onDiff} title={props.file.path}>
        <IconCodeOutline16 size={15} />
        <span className={css.rowName}>{props.file.path}</span>
        <span className={css.statusBadge}>{status === '?' ? 'U' : status}</span>
      </button>
      <Tooltip label={props.actionLabel} delayMs={400}>
        <button type="button" className={css.gitRowAction} aria-label={`${props.actionLabel} ${props.file.path}`} onClick={props.onAction}>
          {props.actionIcon}
        </button>
      </Tooltip>
    </div>
  )
}

function HistorySection(props: {
  history: GitHistory | null
  selectedRevision: string | undefined
  onOpen: (commit: GitCommit) => void
  t: TranslateNS<'workbench'>
}) {
  return (
    <section className={css.gitSection}>
      <header className={css.gitSectionHeader}>
        <span>{props.t('git.history')}</span>
        <span className={css.gitCount}>{props.history?.commits.length ?? 0}</span>
      </header>
      {props.history === null
        ? <div className={css.gitSectionEmpty}>{props.t('git.historyLoading')}</div>
        : props.history.commits.length === 0
          ? <div className={css.gitSectionEmpty}>{props.t('git.noHistory')}</div>
          : props.history.commits.map(commit => (
            <button
              type="button"
              key={commit.hash}
              className={css.commitRow}
              data-selected={props.selectedRevision === commit.hash || undefined}
              onClick={() => { props.onOpen(commit) }}
            >
              <span className={css.commitSubject}>{commit.subject}</span>
              <span className={css.commitHash}>{commit.shortHash}</span>
              <span className={css.commitMeta}>{commit.author} · {formatCommitTime(commit.authoredAt)}</span>
            </button>
          ))}
      {props.history?.truncated === true && <div className={css.gitSectionEmpty}>{props.t('git.historyTruncated')}</div>}
    </section>
  )
}

function isStaged(file: GitFileStatus): boolean {
  return file.index !== ' ' && file.index !== '?'
}

function hasWorktreeChange(file: GitFileStatus): boolean {
  return file.worktree !== ' ' || file.index === '?'
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
