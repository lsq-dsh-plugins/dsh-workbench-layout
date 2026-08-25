import { useEffect, useRef, useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceEntry } from '../contracts.ts'
import type { WorkbenchController, WorkbenchTab } from './controller.ts'

interface FileTreeMutationOptions {
  controller: WorkbenchController
  workspaceId: string | undefined
  tabs: WorkbenchTab[]
  onError: (message: string | null) => void
  onResult: (message: string | null) => void
  onInvalidate: (path: string) => void
  onSelect: (entry: { path: string; kind: 'file' | 'directory' } | null) => void
  onReloadParent: (workspaceId: string, path: string) => Promise<void>
  t: TranslateNS<'workbench'>
}

/** Mutation state and dirty-tab fences for file-tree rename/delete operations. */
export function useFileTreeMutations(options: FileTreeMutationOptions) {
  const [renameTarget, setRenameTarget] = useState<WorkspaceEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceEntry | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const activeWorkspace = useRef(options.workspaceId)

  useEffect(() => {
    activeWorkspace.current = options.workspaceId
    setRenameTarget(null)
    setDeleteTarget(null)
    setDialogError(null)
    setBusy(false)
    return () => { activeWorkspace.current = undefined }
  }, [options.workspaceId])

  const rejectDirty = (entry: WorkspaceEntry): boolean => {
    const dirty = options.tabs.some(tab => (
      tab.kind === 'file' && tab.dirty && isSameOrDescendantPath(tab.path, entry.path)
    ))
    if (!dirty) return false
    options.onError(options.t('files.unsavedMutation', { path: entry.path }))
    options.onResult(null)
    return true
  }

  const requestRename = (entry: WorkspaceEntry): void => {
    if (rejectDirty(entry)) return
    options.onError(null)
    setDialogError(null)
    setRenameTarget(entry)
  }

  const requestDelete = (entry: WorkspaceEntry): void => {
    if (rejectDirty(entry)) return
    options.onError(null)
    setDialogError(null)
    setDeleteTarget(entry)
  }

  const rename = async (name: string): Promise<void> => {
    const workspaceId = options.workspaceId
    if (workspaceId === undefined || renameTarget === null || busy) return
    const source = renameTarget
    setBusy(true)
    setDialogError(null)
    try {
      const renamed = await options.controller.api.renameEntry(workspaceId, source.path, name)
      options.controller.closeWorkspaceEntries(workspaceId, source.path)
      void options.controller.refreshGitDecorations?.(workspaceId)
      if (activeWorkspace.current !== workspaceId) return
      options.onInvalidate(source.path)
      options.onSelect({ path: renamed.path, kind: renamed.kind })
      setRenameTarget(null)
      options.onResult(options.t('files.renamed', { name: renamed.name }))
      await options.onReloadParent(workspaceId, parentPath(source.path))
    } catch (reason: unknown) {
      if (activeWorkspace.current === workspaceId) setDialogError(messageOf(reason))
    } finally {
      if (activeWorkspace.current === workspaceId) setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    const workspaceId = options.workspaceId
    if (workspaceId === undefined || deleteTarget === null || busy) return
    const source = deleteTarget
    setBusy(true)
    setDialogError(null)
    try {
      await options.controller.api.deleteEntry(workspaceId, source.path)
      options.controller.closeWorkspaceEntries(workspaceId, source.path)
      void options.controller.refreshGitDecorations?.(workspaceId)
      if (activeWorkspace.current !== workspaceId) return
      options.onInvalidate(source.path)
      options.onSelect(null)
      setDeleteTarget(null)
      options.onResult(options.t('files.deleted', { path: source.path }))
      await options.onReloadParent(workspaceId, parentPath(source.path))
    } catch (reason: unknown) {
      if (activeWorkspace.current === workspaceId) setDialogError(messageOf(reason))
    } finally {
      if (activeWorkspace.current === workspaceId) setBusy(false)
    }
  }

  const close = (): void => {
    if (busy) return
    setRenameTarget(null)
    setDeleteTarget(null)
    setDialogError(null)
  }

  return { renameTarget, deleteTarget, dialogError, busy, requestRename, requestDelete, rename, remove, close }
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator)
}

function isSameOrDescendantPath(candidate: string, parent: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}/`)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
