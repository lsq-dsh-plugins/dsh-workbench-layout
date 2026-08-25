import {
  FishLogo,
  Pill,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitFileDiff } from '../contracts.ts'
import type { DiffViewMode } from './controller.ts'
import { DiffSurface } from './DiffSurface.tsx'
import { diffKindText } from './git-diff-labels.ts'
import css from './Workbench.module.css'

export interface GitDiffEditorProps {
  diff: GitFileDiff
  viewMode: DiffViewMode
  onViewModeChange: (mode: DiffViewMode) => void
  t: TranslateNS<'workbench'>
}

/** 类似 VS Code Diff Editor 的三模式单文件只读审阅界面。 */
export function GitDiffEditor(props: GitDiffEditorProps) {
  const effectiveMode = props.viewMode
  const labels = diffLabels(props.diff, props.t)
  const renamed = props.diff.originalPath !== undefined && props.diff.originalPath !== props.diff.path
  const noChanges = !props.diff.binary && props.diff.original === props.diff.modified
  const showPaneLabels = props.diff.kind === 'worktree' || props.diff.kind === 'staged'
  return (
    <section className={css.diffDocument} data-diff-effective-mode={effectiveMode}>
      <div className={css.diffMetadata}>
        <span title={props.diff.path}>{renamed ? `${props.diff.originalPath} → ${props.diff.path}` : props.diff.path}</span>
        <span className={css.diffFileStatus} data-status={props.diff.status}>{props.diff.status}</span>
        <Pill>{diffKindText(props.diff.kind, props.t)}</Pill>
        {props.diff.commit !== undefined && (
          <span>{props.diff.commit.shortHash} · {props.diff.commit.author} · {formatCommitTime(props.diff.commit.authoredAt)}</span>
        )}
        <span className={css.diffStats}>
          {props.diff.additions !== undefined && <span data-kind="added">+{props.diff.additions}</span>}
          {props.diff.deletions !== undefined && <span data-kind="deleted">-{props.diff.deletions}</span>}
        </span>
        <div className={css.diffViewSwitch} role="group" aria-label={props.t('editor.diffView')}>
          <button
            type="button"
            data-active={effectiveMode === 'split' || undefined}
            onClick={() => { props.onViewModeChange('split') }}
          >
            {props.t('editor.diffSplit')}
          </button>
          <button
            type="button"
            data-active={effectiveMode === 'unified' || undefined}
            onClick={() => { props.onViewModeChange('unified') }}
          >
            {props.t('editor.diffUnified')}
          </button>
          <button
            type="button"
            data-active={effectiveMode === 'inline' || undefined}
            onClick={() => { props.onViewModeChange('inline') }}
          >
            {props.t('editor.diffInline')}
          </button>
        </div>
      </div>
      {props.diff.binary
        ? <DiffNotice text={props.t('editor.diffBinary')} />
        : noChanges
          ? <DiffNotice text={props.t('editor.diffEmpty')} />
          : (
            <div className={css.diffEditorBody}>
              {showPaneLabels && (
                <div className={css.diffPaneLabels} data-diff-pane-labels="" data-mode={effectiveMode}>
                  {effectiveMode === 'split'
                    ? <><span>{labels.original}</span><span>{labels.modified}</span></>
                    : <span>{labels.original} ↔ {labels.modified}</span>}
                </div>
              )}
              <div className={css.diffSurfaceHost}>
                <DiffSurface
                  key={`${props.diff.kind}:${props.diff.revision ?? ''}:${props.diff.path}:${effectiveMode}`}
                  original={props.diff.original}
                  modified={props.diff.modified}
                  originalLabel={labels.original}
                  modifiedLabel={labels.modified}
                  mode={effectiveMode}
                />
              </div>
            </div>
          )}
    </section>
  )
}

function DiffNotice({ text }: { text: string }) {
  return <div className={css.diffEmpty}><FishLogo size={28} /><span>{text}</span></div>
}

function diffLabels(diff: GitFileDiff, t: TranslateNS<'workbench'>): { original: string; modified: string } {
  switch (diff.kind) {
    case 'worktree':
      return {
        original: diff.status === 'U' ? t('editor.diffEmptyFile') : t('editor.diffIndex'),
        modified: t('editor.diffWorkingTree'),
      }
    case 'staged':
      return { original: t('editor.diffHead'), modified: t('editor.diffIndex') }
    case 'commit':
      return {
        original: diff.parentRevision?.slice(0, 7) ?? t('editor.diffEmptyFile'),
        modified: diff.revision?.slice(0, 7) ?? t('editor.diffCommit'),
      }
    case 'comparison':
      return {
        original: diff.revision?.slice(0, 7) ?? t('editor.diffCommit'),
        modified: t('editor.diffWorkingTree'),
      }
  }
}

function formatCommitTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}
