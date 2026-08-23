import { useEffect, useRef, useState } from 'react'
import {
  IconRefreshOutline14,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DirectoryListing, WorkspaceEntry } from '../contracts.ts'
import type { WorkbenchController } from './controller.ts'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { childWorkspacePath } from '../path-policy.ts'
import { IconFileAddOutline16, IconFolderAddOutline16 } from './CreateEntryIcons.tsx'
import type { FileTreeCreateKind } from './FileTreeCreateRow.tsx'
import { FileTreeContextMenu, type FileTreeMenuAction, type FileTreeMenuTarget } from './FileTreeContextMenu.tsx'
import { FileTreeDialogs } from './FileTreeDialogs.tsx'
import { FileTreeLevel, isContextMenuKey, type FileTreeCreateDraft } from './FileTreeLevel.tsx'
import { copyTextToClipboard } from './clipboard.ts'
import { useFileTreeMutations } from './use-file-tree-mutations.ts'
import { useWorkbench } from './use-workbench.ts'
import css from './Workbench.module.css'

interface FileTreeProps {
  controller: WorkbenchController
  workspaceId: string | undefined
  workspacePath: string | undefined
  t: TranslateNS<'workbench'>
}

interface TreeSelection {
  path: string
  kind: 'file' | 'directory'
}

/** Lazy directory tree; each expansion performs one bounded Host listing. */
export function FileTree({ controller, workspaceId, workspacePath, t }: FileTreeProps) {
  const workbench = useWorkbench(controller)
  const activeTab = workbench.tabs.find(tab => tab.id === workbench.activeTabId)
  const activeWorkspace = useRef(workspaceId)
  activeWorkspace.current = workspaceId
  const [listings, setListings] = useState<Record<string, DirectoryListing | undefined>>({})
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']))
  const [loading, setLoading] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [selection, setSelection] = useState<TreeSelection | null | undefined>(undefined)
  const [createDraft, setCreateDraft] = useState<FileTreeCreateDraft | null>(null)
  const [contextTarget, setContextTarget] = useState<FileTreeMenuTarget | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const selectedPath = selection === undefined
    ? activeTab?.kind === 'file' ? activeTab.path : undefined
    : selection?.path
  const selectedKind = selection === undefined && activeTab?.kind === 'file'
    ? 'file'
    : selection?.kind

  useEffect(() => {
    setListings({})
    setExpanded(new Set(['']))
    setError(null)
    setSelection(undefined)
    setCreateDraft(null)
    setContextTarget(null)
    setResult(null)
    if (workspaceId === undefined) return
    let active = true
    setLoading(new Set(['']))
    void controller.api.listDirectory(workspaceId, '').then((listing) => {
      if (!active) return
      setListings({ '': listing })
      setLoading(new Set())
    }, (reason: unknown) => {
      if (!active) return
      setLoading(new Set())
      setError(messageOf(reason))
    })
    return () => { active = false }
  }, [controller, workspaceId, revision])

  const loadDirectory = async (path: string): Promise<void> => {
    if (workspaceId === undefined) return
    const targetWorkspace = workspaceId
    if (listings[path] !== undefined || loading.has(path)) return
    setLoading(previous => new Set(previous).add(path))
    try {
      const listing = await controller.api.listDirectory(targetWorkspace, path)
      if (activeWorkspace.current !== targetWorkspace) return
      setListings(previous => ({ ...previous, [path]: listing }))
    } catch (reason: unknown) {
      if (activeWorkspace.current !== targetWorkspace) return
      setError(messageOf(reason))
    } finally {
      if (activeWorkspace.current === targetWorkspace) {
        setLoading(previous => {
          const next = new Set(previous)
          next.delete(path)
          return next
        })
      }
    }
  }

  const toggle = (path: string): void => {
    if (expanded.has(path)) {
      setExpanded(previous => {
        const next = new Set(previous)
        next.delete(path)
        return next
      })
      return
    }
    setExpanded(previous => new Set(previous).add(path))
    void loadDirectory(path)
  }

  const beginCreate = (kind: FileTreeCreateKind, parentOverride?: string): void => {
    const parent = parentOverride
      ?? (selectedKind === 'directory' && selectedPath !== undefined ? selectedPath : parentPath(selectedPath))
    setError(null)
    setResult(null)
    setCreateDraft({ parent, kind })
    setExpanded(previous => new Set(previous).add(parent))
    void loadDirectory(parent)
  }

  useEffect(() => {
    const request = workbench.sidebarAction
    if (request === undefined || request.workspaceId !== workspaceId || !request.action.startsWith('files.')) return
    if (listings[''] === undefined && error === null) return
    controller.consumeSidebarAction(request.id)
    if (error !== null) return
    beginCreate(request.action === 'files.newFile' ? 'file' : 'directory')
  }, [controller, error, listings, workbench.sidebarAction, workspaceId])

  const createEntry = async (draft: FileTreeCreateDraft, name: string): Promise<boolean> => {
    if (workspaceId === undefined) return false
    const targetWorkspace = workspaceId
    let path: string
    try {
      path = childWorkspacePath(draft.parent, name)
      setError(null)
      if (draft.kind === 'file') await controller.api.createFile(targetWorkspace, path)
      else await controller.api.createDirectory(targetWorkspace, path)
    } catch (reason: unknown) {
      if (activeWorkspace.current === targetWorkspace) setError(messageOf(reason))
      return false
    }
    if (activeWorkspace.current !== targetWorkspace) return true
    setSelection({ path, kind: draft.kind })
    try {
      const listing = await controller.api.listDirectory(targetWorkspace, draft.parent)
      if (activeWorkspace.current === targetWorkspace) {
        setListings(previous => ({ ...previous, [draft.parent]: listing }))
      }
    } catch (reason: unknown) {
      if (activeWorkspace.current === targetWorkspace) setError(messageOf(reason))
    }
    if (draft.kind === 'file' && activeWorkspace.current === targetWorkspace) {
      void controller.openFile(targetWorkspace, path)
    }
    return true
  }

  const reloadDirectory = async (targetWorkspace: string, path: string): Promise<void> => {
    try {
      const listing = await controller.api.listDirectory(targetWorkspace, path)
      if (activeWorkspace.current === targetWorkspace) {
        setListings(previous => ({ ...previous, [path]: listing }))
      }
    } catch (reason: unknown) {
      if (activeWorkspace.current === targetWorkspace) setError(messageOf(reason))
    }
  }

  const mutations = useFileTreeMutations({
    controller,
    workspaceId,
    tabs: workbench.tabs,
    t,
    onError: setError,
    onResult: setResult,
    onInvalidate: (path) => {
      setListings(previous => omitPathListings(previous, path))
      setExpanded(previous => omitExpandedPaths(previous, path))
    },
    onSelect: setSelection,
    onReloadParent: reloadDirectory,
  })

  const runContextAction = async (action: FileTreeMenuAction): Promise<void> => {
    const entry = contextTarget?.entry ?? null
    const targetWorkspace = workspaceId
    if (targetWorkspace === undefined) return
    setError(null)
    setResult(null)
    if (action === 'refresh') {
      setRevision(value => value + 1)
      return
    }
    if (action === 'new-file' || action === 'new-directory') {
      beginCreate(action === 'new-file' ? 'file' : 'directory', entry?.kind === 'directory' ? entry.path : '')
      return
    }
    if (entry === null) return
    if (action === 'open') {
      if (entry.kind === 'directory') toggle(entry.path)
      else if (entry.kind === 'file') void controller.openFile(targetWorkspace, entry.path)
      return
    }
    if (action === 'rename') {
      mutations.requestRename(entry)
      return
    }
    if (action === 'delete') {
      mutations.requestDelete(entry)
      return
    }
    try {
      if (action === 'copy-relative-path') {
        await copyTextToClipboard(entry.path)
        setResult(t('files.relativePathCopied'))
      } else if (action === 'copy-absolute-path') {
        const resolved = await controller.api.absolutePath(targetWorkspace, entry.path)
        if (activeWorkspace.current !== targetWorkspace) return
        await copyTextToClipboard(resolved.absolutePath)
        setResult(t('files.absolutePathCopied'))
      }
    } catch {
      if (activeWorkspace.current === targetWorkspace) setError(t('files.copyFailed'))
    }
  }

  const openContextMenu = (entry: WorkspaceEntry | null, rect: DOMRect): void => {
    setCreateDraft(null)
    setContextTarget({ entry, expanded: entry?.kind === 'directory' && expanded.has(entry.path), rect })
    setSelection(entry === null ? null : entry.kind === 'file' || entry.kind === 'directory'
      ? { path: entry.path, kind: entry.kind }
      : null)
  }

  if (workspaceId === undefined) return <div className={css.emptyState}>{t('files.emptyWorkspace')}</div>
  const root = listings['']
  return (
    <div className={css.panelBody}>
      <div className={css.panelHeader}>
        <div className={css.fileHeaderTitle}>
          <span className={css.fileHeaderLabel}>{t('files.title')}</span>
          {workspacePath !== undefined && (
            <span className={css.fileHeaderPath} title={workspacePath}>{workspacePath}</span>
          )}
        </div>
        <div className={css.fileHeaderActions}>
          <Tooltip label={t('files.newFile')} delayMs={500}>
            <button type="button" className={css.iconButton} aria-label={t('files.newFile')} onClick={() => { beginCreate('file') }}>
              <IconFileAddOutline16 size={16} />
            </button>
          </Tooltip>
          <Tooltip label={t('files.newDirectory')} delayMs={500}>
            <button type="button" className={css.iconButton} aria-label={t('files.newDirectory')} onClick={() => { beginCreate('directory') }}>
              <IconFolderAddOutline16 size={16} />
            </button>
          </Tooltip>
          <Tooltip label={t('files.refresh')} delayMs={500}>
            <button type="button" className={css.iconButton} aria-label={t('files.refresh')} onClick={() => { setRevision(value => value + 1) }}>
              <IconRefreshOutline14 size={14} />
            </button>
          </Tooltip>
        </div>
      </div>
      {error !== null && <div className={css.error} role="alert">{error}</div>}
      {result !== null && <div className={css.success} role="status">{result}</div>}
      {root === undefined
        ? error === null && <div className={css.emptyState}>{t('files.loading')}</div>
        : (
          <div
            className={css.tree}
            role="tree"
            tabIndex={0}
            data-selection-root={selection === null ? true : undefined}
            onClick={(event) => {
              if (event.target instanceof Element && event.target.closest('[role="treeitem"]') !== null) return
              setSelection(null)
            }}
            onContextMenu={(event) => {
              if (event.target instanceof Element && event.target.closest('[role="treeitem"]') !== null) return
              event.preventDefault()
              openContextMenu(null, pointerRect(event.clientX, event.clientY))
            }}
            onKeyDown={(event) => {
              if (event.currentTarget !== event.target || !isContextMenuKey(event.key, event.shiftKey)) return
              event.preventDefault()
              openContextMenu(null, event.currentTarget.getBoundingClientRect())
            }}
          >
            <FileTreeLevel
              entries={root.entries}
              directoryPath=""
              depth={0}
              expanded={expanded}
              listings={listings}
              loading={loading}
              selected={selectedPath}
              createDraft={createDraft}
              createLabel={createDraft?.kind === 'file' ? t('files.fileName') : t('files.directoryName')}
              onCreate={(draft, name) => createEntry(draft, name)}
              onCancelCreate={() => { setCreateDraft(null) }}
              onToggle={(path) => { setSelection({ path, kind: 'directory' }); toggle(path) }}
              onOpen={(path) => { setSelection({ path, kind: 'file' }); void controller.openFile(workspaceId, path) }}
              onContextMenu={openContextMenu}
            />
            {root.entries.length === 0 && createDraft === null && <div className={css.emptyState}>{t('files.empty')}</div>}
            {root.truncated && <div className={css.notice}>{t('files.truncated')}</div>}
          </div>
        )}
      <FileTreeContextMenu
        target={contextTarget}
        onClose={() => { setContextTarget(null) }}
        onSelect={action => { void runContextAction(action) }}
        t={t}
      />
      <FileTreeDialogs
        renameTarget={mutations.renameTarget}
        deleteTarget={mutations.deleteTarget}
        busy={mutations.busy}
        error={mutations.dialogError}
        onClose={mutations.close}
        onRename={name => { void mutations.rename(name) }}
        onDelete={() => { void mutations.remove() }}
        t={t}
      />
    </div>
  )
}

function parentPath(path: string | undefined): string {
  if (path === undefined) return ''
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function omitPathListings(
  listings: Record<string, DirectoryListing | undefined>,
  path: string,
): Record<string, DirectoryListing | undefined> {
  return Object.fromEntries(Object.entries(listings).filter(([candidate]) => !isSameOrDescendantPath(candidate, path)))
}

function omitExpandedPaths(expanded: Set<string>, path: string): Set<string> {
  return new Set([...expanded].filter(candidate => !isSameOrDescendantPath(candidate, path)))
}

function isSameOrDescendantPath(candidate: string, parent: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}/`)
}

function pointerRect(x: number, y: number): DOMRect {
  return new DOMRect(x, y, 0, 0)
}
