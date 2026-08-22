import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  IconBranchOutline16,
  IconRefreshOutline14,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { GitFileStatus, GitStatus } from '../contracts.ts'
import type { WorkbenchController } from './controller.ts'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import css from './Workbench.module.css'

interface GitPanelProps {
  controller: WorkbenchController
  sessionId: string | undefined
  t: TranslateNS<'workbench'>
}

/** Git status, index controls, diff navigation, and explicit commit form. */
export function GitPanel({ controller, sessionId, t }: GitPanelProps) {
  const [status, setStatus] = useState<GitStatus | null>(null)
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
      setStatus(await controller.api.gitStatus(sessionId))
    } catch (reason: unknown) {
      setError(messageOf(reason))
    } finally {
      setLoading(false)
    }
  }, [controller, sessionId])

  useEffect(() => {
    setStatus(null)
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
      setStatus(await controller.api.gitStatus(sessionId))
    } catch (reason: unknown) {
      setError(messageOf(reason))
    } finally {
      setCommitting(false)
    }
  }

  if (sessionId === undefined) return <div className={css.emptyState}>{t('git.emptySession')}</div>
  const staged = status?.files.some(file => isStaged(file)) ?? false
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
      {status?.available === true && status.files.length === 0 && <div className={css.emptyState}>{t('git.clean')}</div>}
      {status?.available === true && status.files.length > 0 && (
        <div className={css.gitFiles}>
          {status.files.map(file => (
            <GitRow
              key={`${file.path}:${file.originalPath ?? ''}`}
              file={file}
              onOpen={() => { void controller.openFile(sessionId, file.path) }}
              onDiff={stagedDiff => { void controller.openDiff(sessionId, file.path, stagedDiff) }}
              onStage={() => { void update(() => controller.api.gitStage(sessionId, file.path)) }}
              onUnstage={() => { void update(() => controller.api.gitUnstage(sessionId, file.path)) }}
              t={t}
            />
          ))}
        </div>
      )}
      {status?.available === true && (
        <div className={css.commitBox}>
          <textarea
            value={message}
            placeholder={t('git.commitPlaceholder')}
            aria-label={t('git.commitPlaceholder')}
            rows={3}
            onChange={event => { setMessage(event.currentTarget.value) }}
          />
          <Button variant="primary" size="sm" disabled={!staged || message.trim() === '' || committing} onClick={() => { void commit() }}>
            {committing ? t('git.committing') : t('git.commit')}
          </Button>
        </div>
      )}
    </div>
  )
}

function GitRow(props: {
  file: GitFileStatus
  onOpen: () => void
  onDiff: (staged: boolean) => void
  onStage: () => void
  onUnstage: () => void
  t: TranslateNS<'workbench'>
}) {
  const staged = isStaged(props.file)
  const unstaged = props.file.worktree !== ' ' || props.file.index === '?'
  return (
    <div className={css.gitRow}>
      <button type="button" className={css.gitFile} onClick={props.onOpen} title={props.file.path}>
        <span className={css.statusCode}>{props.file.index}{props.file.worktree}</span>
        <span className={css.rowName}>{props.file.path}</span>
      </button>
      <div className={css.gitActions}>
        <button type="button" onClick={() => { props.onDiff(staged && !unstaged) }}>{props.t('git.diff')}</button>
        {unstaged && <button type="button" onClick={props.onStage}>{props.t('git.stage')}</button>}
        {staged && <button type="button" onClick={props.onUnstage}>{props.t('git.unstage')}</button>}
      </div>
    </div>
  )
}

function isStaged(file: GitFileStatus): boolean {
  return file.index !== ' ' && file.index !== '?'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
