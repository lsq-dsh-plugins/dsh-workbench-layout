import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  GitBranches,
  GitCommit,
  GitFileStatus,
  GitGraph,
  GitRemoteOperation,
  GitStatus,
} from '../contracts.ts'
import type { WorkbenchController } from './controller.ts'
import { GitChangesView, type GitChangeLayout } from './GitChangesView.tsx'
import { GitGraphView, type CommitFilesState } from './GitGraphView.tsx'
import { GitRepositoryToolbar } from './GitRepositoryToolbar.tsx'
import { useWorkbench } from './use-workbench.ts'
import css from './Workbench.module.css'

interface GitPanelProps {
  controller: WorkbenchController
  workspaceId: string | undefined
  t: TranslateNS<'workbench'>
}

type GitView = 'changes' | 'graph'

/** 组合源码管理状态；具体的更改、提交图和仓库工具栏各自保持独立。 */
export function GitPanel({ controller, workspaceId, t }: GitPanelProps) {
  const workbench = useWorkbench(controller)
  const refreshId = useRef(0)
  const activeWorkspace = useRef(workspaceId)
  activeWorkspace.current = workspaceId
  const [view, setView] = useState<GitView>('changes')
  const [changeLayout, setChangeLayout] = useState<GitChangeLayout>('list')
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [branches, setBranches] = useState<GitBranches | null>(null)
  const [graph, setGraph] = useState<GitGraph | null>(null)
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null)
  const [commitFiles, setCommitFiles] = useState<Record<string, CommitFilesState>>({})
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (workspaceId === undefined) return
    const request = ++refreshId.current
    setLoading(true)
    setError(null)
    try {
      const nextStatus = await controller.api.gitStatus(workspaceId)
      const [nextGraph, nextBranches] = nextStatus.available
        ? await Promise.all([controller.api.gitGraph(workspaceId), controller.api.gitBranches(workspaceId)])
        : [null, null]
      if (request !== refreshId.current) return
      setStatus(nextStatus)
      setGraph(nextGraph)
      setBranches(nextBranches)
      setCommitFiles({})
      setExpandedCommit(null)
    } catch (reason: unknown) {
      if (request === refreshId.current) setError(messageOf(reason))
    } finally {
      if (request === refreshId.current) setLoading(false)
    }
  }, [controller, workspaceId])

  useEffect(() => {
    refreshId.current += 1
    setStatus(null)
    setBranches(null)
    setGraph(null)
    setBusy(null)
    setMessage('')
    setError(null)
    setResult(null)
    setExpandedCommit(null)
    setCommitFiles({})
    void refresh()
  }, [refresh])

  const update = async (targetWorkspace: string, operation: () => Promise<GitStatus>): Promise<boolean> => {
    setError(null)
    try {
      const next = await operation()
      if (activeWorkspace.current !== targetWorkspace) return false
      setStatus(next)
      return true
    } catch (reason: unknown) {
      if (activeWorkspace.current !== targetWorkspace) return false
      setError(messageOf(reason))
      return false
    }
  }

  const stage = async (file: GitFileStatus): Promise<void> => {
    if (workspaceId === undefined) return
    if (await update(workspaceId, () => controller.api.gitStage(workspaceId, file.path))) {
      await controller.openDiff(workspaceId, file.path, true)
    }
  }

  const unstage = async (file: GitFileStatus): Promise<void> => {
    if (workspaceId === undefined) return
    if (await update(workspaceId, () => controller.api.gitUnstage(workspaceId, file.path))) {
      await controller.openDiff(workspaceId, file.path, false)
    }
  }

  const commit = async (): Promise<void> => {
    if (workspaceId === undefined) return
    const targetWorkspace = workspaceId
    setBusy('commit')
    setError(null)
    setResult(null)
    try {
      const committed = await controller.api.gitCommit(targetWorkspace, message)
      if (activeWorkspace.current !== targetWorkspace) return
      setMessage('')
      setResult(committed.summary)
      controller.showFile()
      await refresh()
    } catch (reason: unknown) {
      if (activeWorkspace.current !== targetWorkspace) return
      setError(messageOf(reason))
    } finally {
      if (activeWorkspace.current === targetWorkspace) setBusy(null)
    }
  }

  const toggleCommit = async (commitValue: GitCommit): Promise<void> => {
    if (workspaceId === undefined) return
    const targetWorkspace = workspaceId
    if (expandedCommit === commitValue.hash) {
      setExpandedCommit(null)
      return
    }
    setExpandedCommit(commitValue.hash)
    if (commitFiles[commitValue.hash] !== undefined) return
    setCommitFiles(current => ({ ...current, [commitValue.hash]: { state: 'loading' } }))
    try {
      const value = await controller.api.gitCommitFiles(targetWorkspace, commitValue.hash)
      if (activeWorkspace.current !== targetWorkspace) return
      setCommitFiles(current => ({ ...current, [commitValue.hash]: { state: 'ready', value } }))
    } catch (reason: unknown) {
      if (activeWorkspace.current !== targetWorkspace) return
      setCommitFiles(current => ({
        ...current,
        [commitValue.hash]: { state: 'error', message: messageOf(reason) },
      }))
    }
  }

  const switchBranch = async (ref: string): Promise<void> => {
    if (workspaceId === undefined) return
    const targetWorkspace = workspaceId
    if (workbench.tabs.some(tab => tab.dirty)) {
      setError(t('git.unsavedOperation'))
      return
    }
    const target = branches?.branches.find(branch => branch.ref === ref)
    setBusy('switch')
    setError(null)
    setResult(null)
    try {
      await controller.api.gitSwitchBranch(targetWorkspace, ref)
      controller.resetWorkspaceView(targetWorkspace)
      if (activeWorkspace.current !== targetWorkspace) return
      setResult(`${t('git.switchedBranch')} ${target?.name ?? ref}`)
      await refresh()
    } catch (reason: unknown) {
      if (activeWorkspace.current !== targetWorkspace) return
      setError(messageOf(reason))
    } finally {
      if (activeWorkspace.current === targetWorkspace) setBusy(null)
    }
  }

  const remoteOperation = async (operation: GitRemoteOperation): Promise<void> => {
    if (workspaceId === undefined) return
    const targetWorkspace = workspaceId
    if ((operation === 'pull' || operation === 'sync') && workbench.tabs.some(tab => tab.dirty)) {
      setError(t('git.unsavedOperation'))
      return
    }
    setBusy(operation)
    setError(null)
    setResult(null)
    try {
      await controller.api.gitRemoteOperation(targetWorkspace, operation)
      if (operation === 'pull' || operation === 'sync') controller.resetWorkspaceView(targetWorkspace)
      if (activeWorkspace.current !== targetWorkspace) return
      setResult(t(`git.${operation}Done`))
      await refresh()
    } catch (reason: unknown) {
      if (activeWorkspace.current !== targetWorkspace) return
      setError(messageOf(reason))
    } finally {
      if (activeWorkspace.current === targetWorkspace) setBusy(null)
    }
  }

  if (workspaceId === undefined) return <div className={css.emptyState}>{t('git.emptyWorkspace')}</div>
  const stagedFiles = status?.files.filter(isStaged) ?? []
  const changedFiles = status?.files.filter(hasWorktreeChange) ?? []
  return (
    <div className={css.panelBody}>
      <GitRepositoryToolbar
        status={status}
        branches={branches}
        showViewOptions={view === 'changes'}
        changeLayout={changeLayout}
        busy={busy}
        onChangeLayout={setChangeLayout}
        onSwitchBranch={ref => { void switchBranch(ref) }}
        onRemoteOperation={operation => { void remoteOperation(operation) }}
        onRefresh={() => { void refresh() }}
        t={t}
      />
      <div className={css.gitViewTabs} role="tablist" aria-label={t('git.title')}>
        <button type="button" role="tab" aria-selected={view === 'changes'} data-active={view === 'changes' || undefined} onClick={() => { setView('changes') }}>
          {t('git.changesTab')}<span>{stagedFiles.length + changedFiles.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={view === 'graph'} data-active={view === 'graph' || undefined} onClick={() => { setView('graph') }}>
          {t('git.graphTab')}<span>{graph?.commits.length ?? 0}</span>
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
            <Button variant="primary" size="sm" disabled={stagedFiles.length === 0 || message.trim() === '' || busy !== null} onClick={() => { void commit() }}>
              {busy === 'commit' ? t('git.committing') : t('git.commit')}
            </Button>
          </div>
          <GitChangesView
            stagedFiles={stagedFiles}
            changedFiles={changedFiles}
            layout={changeLayout}
            selectedKind={workbench.diff?.kind === 'staged' || workbench.diff?.kind === 'worktree' ? workbench.diff.kind : undefined}
            selectedPath={workbench.diff?.path}
            onOpen={(file, staged) => { void controller.openDiff(workspaceId, file.path, staged) }}
            onStage={file => { void stage(file) }}
            onUnstage={file => { void unstage(file) }}
            t={t}
          />
        </>
      )}
      {status?.available === true && view === 'graph' && (
        <GitGraphView
          graph={graph}
          expandedCommit={expandedCommit}
          commitFiles={commitFiles}
          selectedRevision={workbench.diff?.revision}
          selectedPath={workbench.diff?.path}
          onToggle={commitValue => { void toggleCommit(commitValue) }}
          onOpen={(commitValue, path) => { void controller.openCommitDiff(workspaceId, commitValue, path) }}
          t={t}
        />
      )}
    </div>
  )
}

function isStaged(file: GitFileStatus): boolean {
  return file.index !== ' ' && file.index !== '?'
}

function hasWorktreeChange(file: GitFileStatus): boolean {
  return file.worktree !== ' ' || file.index === '?'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
