import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  GitBranches,
  GitCommit,
  GitFileStatus,
  GitGraph,
  GitRemoteOperation,
  GitRemotes,
  GitStatus,
  GitTargetRemoteOperation,
} from '../contracts.ts'
import type { WorkbenchController } from './controller.ts'
import { GitChangesView } from './GitChangesView.tsx'
import { GitBranchDialog, type GitBranchDialogMode } from './GitBranchDialog.tsx'
import { GitGraphView, type CommitFilesState } from './GitGraphView.tsx'
import { GitRepositoryToolbar } from './GitRepositoryToolbar.tsx'
import { GitRemoteDialog, type GitRemoteDialogMode, type GitRemoteDraft } from './GitRemoteDialog.tsx'
import { useWorkbench } from './use-workbench.ts'
import css from './Workbench.module.css'

interface GitPanelProps {
  controller: WorkbenchController
  workspaceId: string | undefined
  t: TranslateNS<'workbench'>
}

/** 组合源码管理状态；具体的更改、提交图和仓库工具栏各自保持独立。 */
export function GitPanel({ controller, workspaceId, t }: GitPanelProps) {
  const workbench = useWorkbench(controller)
  const activeTab = workbench.tabs.find(tab => tab.id === workbench.activeTabId)
  const activeDiff = activeTab?.kind === 'diff' ? activeTab.diff : null
  const refreshId = useRef(0)
  const activeWorkspace = useRef(workspaceId)
  activeWorkspace.current = workspaceId
  const view = workbench.gitView
  const changeLayout = workbench.gitChangeLayout
  const graphFileLayout = workbench.gitGraphFileLayout
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
  const [branchDialog, setBranchDialog] = useState<GitBranchDialogMode | null>(null)
  const [branchDialogError, setBranchDialogError] = useState<string | null>(null)
  const [remoteDialog, setRemoteDialog] = useState<GitRemoteDialogMode | null>(null)
  const [remotes, setRemotes] = useState<GitRemotes | null>(null)
  const [remoteDialogError, setRemoteDialogError] = useState<string | null>(null)

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
    setBranchDialog(null)
    setBranchDialogError(null)
    setRemoteDialog(null)
    setRemotes(null)
    setRemoteDialogError(null)
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
      controller.closeDiffTabs(workspaceId)
      await controller.openDiff(workspaceId, file.path, true)
    }
  }

  const unstage = async (file: GitFileStatus): Promise<void> => {
    if (workspaceId === undefined) return
    if (await update(workspaceId, () => controller.api.gitUnstage(workspaceId, file.path))) {
      controller.closeDiffTabs(workspaceId)
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
      controller.closeDiffTabs(targetWorkspace)
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
    if (workbench.tabs.some(tab => tab.kind === 'file' && tab.dirty)) {
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

  const manageBranch = async (nameOrRef: string, source?: string): Promise<void> => {
    if (workspaceId === undefined || branchDialog === null) return
    const targetWorkspace = workspaceId
    const operation = branchDialog
    const switchesWorktree = operation === 'create' || operation === 'create-from'
    if (switchesWorktree && workbench.tabs.some(tab => tab.kind === 'file' && tab.dirty)) {
      setBranchDialogError(t('git.unsavedOperation'))
      return
    }
    setBusy(`branch-${operation}`)
    setBranchDialogError(null)
    setError(null)
    setResult(null)
    try {
      if (operation === 'create' || operation === 'create-from') {
        await controller.api.gitCreateBranch(targetWorkspace, nameOrRef, source)
        controller.resetWorkspaceView(targetWorkspace)
      } else if (operation === 'rename') {
        await controller.api.gitRenameBranch(targetWorkspace, nameOrRef)
      } else {
        await controller.api.gitDeleteBranch(targetWorkspace, nameOrRef)
      }
      if (activeWorkspace.current !== targetWorkspace) return
      setBranchDialog(null)
      setResult(t(`git.branchDialog.${operation}.done`))
      await refresh()
    } catch (reason: unknown) {
      if (activeWorkspace.current === targetWorkspace) setBranchDialogError(messageOf(reason))
    } finally {
      if (activeWorkspace.current === targetWorkspace) setBusy(null)
    }
  }

  const remoteOperation = async (operation: GitRemoteOperation): Promise<void> => {
    if (workspaceId === undefined) return
    const targetWorkspace = workspaceId
    if ((operation === 'pull' || operation === 'sync') && workbench.tabs.some(tab => tab.kind === 'file' && tab.dirty)) {
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

  const openRemoteDialog = async (mode: GitRemoteDialogMode): Promise<void> => {
    if (workspaceId === undefined) return
    const targetWorkspace = workspaceId
    setRemoteDialog(mode)
    setRemotes(null)
    setRemoteDialogError(null)
    try {
      const value = await controller.api.gitRemotes(targetWorkspace)
      if (activeWorkspace.current === targetWorkspace) setRemotes(value)
    } catch (reason: unknown) {
      if (activeWorkspace.current === targetWorkspace) setRemoteDialogError(messageOf(reason))
    }
  }

  const saveRemote = async (draft: GitRemoteDraft): Promise<void> => {
    if (workspaceId === undefined) return
    const targetWorkspace = workspaceId
    setBusy('remote-config')
    setRemoteDialogError(null)
    try {
      const value = draft.currentName === undefined
        ? await controller.api.gitAddRemote(targetWorkspace, draft)
        : await controller.api.gitUpdateRemote(targetWorkspace, draft.currentName, draft)
      if (activeWorkspace.current !== targetWorkspace) return
      setRemotes(value)
      setRemoteDialog(null)
      setResult(t('git.remoteDialog.saved'))
      await refresh()
    } catch (reason: unknown) {
      if (activeWorkspace.current === targetWorkspace) setRemoteDialogError(messageOf(reason))
    } finally {
      if (activeWorkspace.current === targetWorkspace) setBusy(null)
    }
  }

  const deleteRemote = async (name: string): Promise<void> => {
    if (workspaceId === undefined) return
    const targetWorkspace = workspaceId
    setBusy('remote-config')
    setRemoteDialogError(null)
    try {
      const value = await controller.api.gitDeleteRemote(targetWorkspace, name)
      if (activeWorkspace.current !== targetWorkspace) return
      setRemotes(value)
      setRemoteDialog(null)
      setResult(t('git.remoteDialog.deleted'))
      await refresh()
    } catch (reason: unknown) {
      if (activeWorkspace.current === targetWorkspace) setRemoteDialogError(messageOf(reason))
    } finally {
      if (activeWorkspace.current === targetWorkspace) setBusy(null)
    }
  }

  const targetRemoteOperation = async (
    operation: GitTargetRemoteOperation,
    remote: string,
    branch?: string,
  ): Promise<void> => {
    if (workspaceId === undefined) return
    const targetWorkspace = workspaceId
    if (operation === 'pull' && workbench.tabs.some(tab => tab.kind === 'file' && tab.dirty)) {
      setRemoteDialogError(t('git.unsavedOperation'))
      return
    }
    setBusy(`remote-${operation}`)
    setRemoteDialogError(null)
    try {
      await controller.api.gitTargetRemoteOperation(targetWorkspace, operation, remote, branch)
      if (operation === 'pull') controller.resetWorkspaceView(targetWorkspace)
      if (activeWorkspace.current !== targetWorkspace) return
      setRemoteDialog(null)
      setResult(t(`git.remoteDialog.target.${operation}Done`, { remote }))
      await refresh()
    } catch (reason: unknown) {
      if (activeWorkspace.current === targetWorkspace) setRemoteDialogError(messageOf(reason))
    } finally {
      if (activeWorkspace.current === targetWorkspace) setBusy(null)
    }
  }

  if (workspaceId === undefined) return <div className={css.emptyState}>{t('git.emptyWorkspace')}</div>
  const stagedFiles = status?.files.filter(isStaged) ?? []
  const changedFiles = status?.files.filter(hasWorktreeChange) ?? []
  const showingChanges = view === 'changes'
  const activeFileLayout = showingChanges ? changeLayout : graphFileLayout
  return (
    <div className={css.panelBody}>
      <GitRepositoryToolbar
        status={status}
        branches={branches}
        view={view}
        fileLayout={activeFileLayout}
        busy={busy}
        onToggleView={() => { controller.toggleGitView() }}
        onFileLayoutChange={layout => {
          controller.setGitFileLayout(view, layout)
        }}
        onSwitchBranch={ref => { void switchBranch(ref) }}
        onOpenBranchDialog={mode => { setBranchDialogError(null); setBranchDialog(mode) }}
        onRemoteOperation={operation => { void remoteOperation(operation) }}
        onOpenRemoteDialog={mode => { void openRemoteDialog(mode) }}
        onRefresh={() => {
          controller.closeDiffTabs(workspaceId)
          void refresh()
        }}
        t={t}
      />
      {error !== null && <div className={css.error} role="alert">{error}</div>}
      {result !== null && <div className={css.success} role="status">{result}</div>}
      {loading && status === null && <div className={css.emptyState}>{t('files.loading')}</div>}
      {status?.available === false && <div className={css.emptyState}>{status.message}</div>}
      {status?.available === true && showingChanges && (
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
            selectedKind={activeDiff?.kind === 'staged' || activeDiff?.kind === 'worktree' ? activeDiff.kind : undefined}
            selectedPath={activeDiff?.path}
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
          fileLayout={graphFileLayout}
          selectedRevision={activeDiff?.revision}
          selectedPath={activeDiff?.path}
          onToggle={commitValue => { void toggleCommit(commitValue) }}
          onOpen={(commitValue, path) => { void controller.openCommitDiff(workspaceId, commitValue, path) }}
          t={t}
        />
      )}
      <GitBranchDialog
        mode={branchDialog}
        status={status}
        branches={branches}
        busy={busy?.startsWith('branch-') === true}
        error={branchDialogError}
        onClose={() => { if (busy === null) setBranchDialog(null) }}
        onSubmit={(nameOrRef, source) => { void manageBranch(nameOrRef, source) }}
        t={t}
      />
      <GitRemoteDialog
        mode={remoteDialog}
        remotes={remotes}
        status={status}
        busy={busy?.startsWith('remote-') === true}
        error={remoteDialogError}
        onClose={() => { if (busy === null) setRemoteDialog(null) }}
        onSave={draft => { void saveRemote(draft) }}
        onDelete={name => { void deleteRemote(name) }}
        onRun={(operation, remote, branch) => { void targetRemoteOperation(operation, remote, branch) }}
        t={t}
      />
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
