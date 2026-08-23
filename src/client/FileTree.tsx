import { useEffect, useRef, useState } from 'react'
import {
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconFolderClose16,
  IconFolderOpen16,
  IconRefreshOutline14,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DirectoryListing, WorkspaceEntry } from '../contracts.ts'
import type { WorkbenchController } from './controller.ts'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { childWorkspacePath } from '../path-policy.ts'
import { IconFileAddOutline16, IconFileOutline16, IconFolderAddOutline16 } from './CreateEntryIcons.tsx'
import { FileTreeCreateRow, type FileTreeCreateKind } from './FileTreeCreateRow.tsx'
import { useWorkbench } from './use-workbench.ts'
import css from './Workbench.module.css'

interface FileTreeProps {
  controller: WorkbenchController
  workspaceId: string | undefined
  t: TranslateNS<'workbench'>
}

interface TreeSelection {
  path: string
  kind: 'file' | 'directory'
}

interface CreateDraft {
  parent: string
  kind: FileTreeCreateKind
}

/** Lazy directory tree; each expansion performs one bounded Host listing. */
export function FileTree({ controller, workspaceId, t }: FileTreeProps) {
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
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null)
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

  const beginCreate = (kind: FileTreeCreateKind): void => {
    const parent = selectedKind === 'directory' && selectedPath !== undefined ? selectedPath : parentPath(selectedPath)
    setError(null)
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

  const createEntry = async (draft: CreateDraft, name: string): Promise<boolean> => {
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

  if (workspaceId === undefined) return <div className={css.emptyState}>{t('files.emptyWorkspace')}</div>
  const root = listings['']
  return (
    <div className={css.panelBody}>
      <div className={css.panelHeader}>
        <span>{t('files.title')}</span>
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
      {root === undefined
        ? error === null && <div className={css.emptyState}>{t('files.loading')}</div>
        : (
          <div
            className={css.tree}
            role="tree"
            data-selection-root={selection === null ? true : undefined}
            onClick={(event) => {
              if (event.target instanceof Element && event.target.closest('[role="treeitem"]') !== null) return
              setSelection(null)
            }}
          >
            <TreeLevel
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
            />
            {root.entries.length === 0 && createDraft === null && <div className={css.emptyState}>{t('files.empty')}</div>}
            {root.truncated && <div className={css.notice}>{t('files.truncated')}</div>}
          </div>
        )}
    </div>
  )
}

function TreeLevel(props: {
  entries: WorkspaceEntry[]
  directoryPath: string
  depth: number
  expanded: Set<string>
  listings: Record<string, DirectoryListing | undefined>
  loading: Set<string>
  selected: string | undefined
  createDraft: CreateDraft | null
  createLabel: string
  onCreate: (draft: CreateDraft, name: string) => Promise<boolean>
  onCancelCreate: () => void
  onToggle: (path: string) => void
  onOpen: (path: string) => void
}) {
  return <>
    {props.createDraft?.parent === props.directoryPath && (
      <FileTreeCreateRow
        kind={props.createDraft.kind}
        depth={props.depth}
        label={props.createLabel}
        onCreate={name => props.onCreate(props.createDraft!, name)}
        onCancel={props.onCancelCreate}
      />
    )}
    {props.entries.filter(entry => entry.name !== '.git').map((entry) => {
      const directory = entry.kind === 'directory'
      const open = directory && props.expanded.has(entry.path)
      const children = props.listings[entry.path]
      return (
        <div key={entry.path} role="none">
          <button
            type="button"
            role="treeitem"
            aria-expanded={directory ? open : undefined}
            className={css.treeRow}
            data-selected={props.selected === entry.path || undefined}
            style={{ paddingLeft: 8 + props.depth * 16 }}
            onClick={() => { directory ? props.onToggle(entry.path) : props.onOpen(entry.path) }}
          >
            <span className={css.chevron}>
              {directory && (open ? <IconChevronDownOutline14 size={12} /> : <IconChevronRightOutline14 size={12} />)}
            </span>
            {directory
              ? open ? <IconFolderOpen16 size={16} /> : <IconFolderClose16 size={16} />
              : <IconFileOutline16 size={15} />}
            <span className={css.rowName}>{entry.name}</span>
          </button>
          {open && props.loading.has(entry.path) && <div className={css.treeLoading} style={{ paddingLeft: 28 + props.depth * 16 }}>…</div>}
          {open && children !== undefined && (
            <TreeLevel {...props} entries={children.entries} directoryPath={entry.path} depth={props.depth + 1} />
          )}
        </div>
      )
    })}
  </>
}

function parentPath(path: string | undefined): string {
  if (path === undefined) return ''
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
