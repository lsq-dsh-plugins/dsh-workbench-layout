import { useEffect, useRef, useState } from 'react'
import {
  Button,
  FishLogo,
  IconCodeOutline16,
  Pill,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitFileDiff } from '../contracts.ts'
import type { DiffViewMode } from './controller.ts'
import { DiffSurface } from './DiffSurface.tsx'
import css from './Workbench.module.css'

const INLINE_THRESHOLD = 720

export interface GitDiffEditorProps {
  diff: GitFileDiff
  error: string | null
  viewMode: DiffViewMode
  onViewModeChange: (mode: DiffViewMode) => void
  onBack: () => void
  t: TranslateNS<'workbench'>
}

/** 类似 VS Code Diff Editor 的单文件只读审阅界面。 */
export function GitDiffEditor(props: GitDiffEditorProps) {
  const root = useRef<HTMLElement>(null)
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    if (root.current === null) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width !== undefined) setNarrow(width < INLINE_THRESHOLD)
    })
    observer.observe(root.current)
    return () => { observer.disconnect() }
  }, [])

  const effectiveMode: DiffViewMode = narrow ? 'inline' : props.viewMode
  const labels = diffLabels(props.diff, props.t)
  const renamed = props.diff.originalPath !== undefined && props.diff.originalPath !== props.diff.path
  const noChanges = !props.diff.binary && props.diff.original === props.diff.modified
  return (
    <section ref={root} className={css.editorRoot} data-dsh-workbench-editor="" data-diff-effective-mode={effectiveMode}>
      <header className={css.editorHeader}>
        <div className={css.editorTitle} title={props.diff.path}>
          <IconCodeOutline16 size={16} />
          <span>{fileName(props.diff.path)}</span>
          <span className={css.diffDirectory}>{directoryName(props.diff.path)}</span>
          <span className={css.diffFileStatus} data-status={props.diff.status}>{props.diff.status}</span>
          <Pill>{diffKindText(props.diff.kind, props.t)}</Pill>
        </div>
        <div className={css.editorActions}>
          <div className={css.diffViewSwitch} role="group" aria-label={props.t('editor.diffView')}>
            <button
              type="button"
              data-active={effectiveMode === 'split' || undefined}
              disabled={narrow}
              onClick={() => { props.onViewModeChange('split') }}
            >
              {props.t('editor.diffSplit')}
            </button>
            <button
              type="button"
              data-active={effectiveMode === 'inline' || undefined}
              onClick={() => { props.onViewModeChange('inline') }}
            >
              {props.t('editor.diffInline')}
            </button>
          </div>
          <Button size="sm" variant="toolbar" onClick={props.onBack}>{props.t('editor.backToFile')}</Button>
        </div>
      </header>
      <div className={css.diffMetadata}>
        <span>{renamed ? `${props.diff.originalPath} → ${props.diff.path}` : props.diff.path}</span>
        {props.diff.commit !== undefined && (
          <span>{props.diff.commit.shortHash} · {props.diff.commit.author} · {formatCommitTime(props.diff.commit.authoredAt)}</span>
        )}
        <span className={css.diffStats}>
          {props.diff.additions !== undefined && <span data-kind="added">+{props.diff.additions}</span>}
          {props.diff.deletions !== undefined && <span data-kind="deleted">-{props.diff.deletions}</span>}
        </span>
      </div>
      {props.error !== null && <div className={css.editorError} role="alert">{props.error}</div>}
      {props.diff.binary
        ? <DiffNotice text={props.t('editor.diffBinary')} />
        : noChanges
          ? <DiffNotice text={props.t('editor.diffEmpty')} />
          : (
            <div className={css.diffEditorBody}>
              <div className={css.diffPaneLabels} data-mode={effectiveMode}>
                {effectiveMode === 'split'
                  ? <><span>{labels.original}</span><span>{labels.modified}</span></>
                  : <span>{labels.original} ↔ {labels.modified}</span>}
              </div>
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
  }
}

function diffKindText(kind: GitFileDiff['kind'], t: TranslateNS<'workbench'>): string {
  switch (kind) {
    case 'worktree': return t('editor.diffWorktree')
    case 'staged': return t('editor.diffStaged')
    case 'commit': return t('editor.diffCommit')
  }
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
