import {
  IconCodeOutline16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitCommit, GitCommitFiles, GitHistory } from '../contracts.ts'
import css from './Workbench.module.css'

export type CommitFilesState =
  | { state: 'loading' }
  | { state: 'ready'; value: GitCommitFiles }
  | { state: 'error'; message: string }

interface GitHistoryViewProps {
  history: GitHistory | null
  expandedCommit: string | null
  commitFiles: Record<string, CommitFilesState>
  selectedRevision: string | undefined
  selectedPath: string | undefined
  onToggle: (commit: GitCommit) => void
  onOpen: (commit: GitCommit, path: string) => void
  t: TranslateNS<'workbench'>
}

/** 单行提交记录；点击整行后在原位置展开该提交的文件。 */
export function GitHistoryView(props: GitHistoryViewProps) {
  return (
    <div className={css.gitHistory}>
      {props.history === null
        ? <div className={css.gitSectionEmpty}>{props.t('git.historyLoading')}</div>
        : props.history.commits.length === 0
          ? <div className={css.gitSectionEmpty}>{props.t('git.noHistory')}</div>
          : props.history.commits.map(commit => (
            <CommitEntry
              key={commit.hash}
              commit={commit}
              expanded={props.expandedCommit === commit.hash}
              files={props.commitFiles[commit.hash]}
              selectedRevision={props.selectedRevision}
              selectedPath={props.selectedPath}
              onToggle={() => { props.onToggle(commit) }}
              onOpen={path => { props.onOpen(commit, path) }}
              t={props.t}
            />
          ))}
      {props.history?.truncated === true && <div className={css.gitSectionEmpty}>{props.t('git.historyTruncated')}</div>}
    </div>
  )
}

function CommitEntry(props: {
  commit: GitCommit
  expanded: boolean
  files: CommitFilesState | undefined
  selectedRevision: string | undefined
  selectedPath: string | undefined
  onToggle: () => void
  onOpen: (path: string) => void
  t: TranslateNS<'workbench'>
}) {
  return (
    <div className={css.commitEntry} data-expanded={props.expanded || undefined}>
      <Tooltip label={() => commitTooltip(props.commit)} side="right" delayMs={450} maxWidth={380}>
        <button type="button" className={css.commitRow} aria-expanded={props.expanded} onClick={props.onToggle}>
          {props.commit.references.length > 0 && (
            <span className={css.commitRefs}>
              {props.commit.references.slice(0, 2).map(reference => (
                <span key={`${reference.kind}:${reference.name}`} data-kind={reference.kind}>{reference.name}</span>
              ))}
              {props.commit.references.length > 2 && <span data-kind="more">+{props.commit.references.length - 2}</span>}
            </span>
          )}
          <span className={css.commitSubject}>{props.commit.subject}</span>
          <span className={css.commitAuthor}>{props.commit.author}</span>
        </button>
      </Tooltip>
      {props.expanded && (
        <div className={css.commitFiles}>
          {props.files === undefined || props.files.state === 'loading'
            ? <div className={css.gitSectionEmpty}>{props.t('git.commitFilesLoading')}</div>
            : props.files.state === 'error'
              ? <div className={css.error} role="alert">{props.files.message}</div>
              : props.files.value.files.length === 0
                ? <div className={css.gitSectionEmpty}>{props.t('git.noCommitFiles')}</div>
                : props.files.value.files.map(file => (
                  <button
                    type="button"
                    key={`${props.commit.hash}:${file.path}`}
                    className={css.historyFileRow}
                    data-selected={props.selectedRevision === props.commit.hash && props.selectedPath === file.path || undefined}
                    title={file.originalPath === undefined ? file.path : `${file.originalPath} → ${file.path}`}
                    onClick={() => { props.onOpen(file.path) }}
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
}

function commitTooltip(commit: GitCommit): string {
  const references = commit.references.map(reference => reference.name).join(' · ')
  return [
    commit.subject,
    `${commit.author} · ${formatCommitTime(commit.authoredAt)}`,
    commit.hash,
    references,
  ].filter(line => line !== '').join('\n')
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
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}
