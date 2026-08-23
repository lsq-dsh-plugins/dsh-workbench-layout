import { useEffect, useRef, useState } from 'react'
import {
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconCodeOutline16,
  IconFolderClose16,
  IconFolderOpen16,
  IconRefreshOutline14,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DirectoryListing, WorkspaceEntry } from '../contracts.ts'
import type { WorkbenchController } from './controller.ts'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchKey } from './locales.ts'
import { useWorkbench } from './use-workbench.ts'
import css from './Workbench.module.css'

interface FileTreeProps {
  controller: WorkbenchController
  workspaceId: string | undefined
  t: TranslateNS<'workbench'>
}

/** Lazy directory tree; each expansion performs one bounded Host listing. */
export function FileTree({ controller, workspaceId, t }: FileTreeProps) {
  const workbench = useWorkbench(controller)
  const activeWorkspace = useRef(workspaceId)
  activeWorkspace.current = workspaceId
  const [listings, setListings] = useState<Record<string, DirectoryListing | undefined>>({})
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']))
  const [loading, setLoading] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    setListings({})
    setExpanded(new Set(['']))
    setError(null)
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

  const toggle = async (path: string): Promise<void> => {
    if (workspaceId === undefined) return
    const targetWorkspace = workspaceId
    if (expanded.has(path)) {
      setExpanded(previous => {
        const next = new Set(previous)
        next.delete(path)
        return next
      })
      return
    }
    setExpanded(previous => new Set(previous).add(path))
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

  if (workspaceId === undefined) return <div className={css.emptyState}>{t('files.emptyWorkspace')}</div>
  const root = listings['']
  return (
    <div className={css.panelBody}>
      <div className={css.panelHeader}>
        <span>{t('files.title')}</span>
        <Tooltip label={t('files.refresh')} delayMs={500}>
          <button type="button" className={css.iconButton} aria-label={t('files.refresh')} onClick={() => { setRevision(value => value + 1) }}>
            <IconRefreshOutline14 size={14} />
          </button>
        </Tooltip>
      </div>
      {error !== null && <div className={css.error} role="alert">{error}</div>}
      {root === undefined
        ? error === null && <div className={css.emptyState}>{t('files.loading')}</div>
        : (
          <div className={css.tree} role="tree">
            <TreeLevel
              entries={root.entries}
              depth={0}
              expanded={expanded}
              listings={listings}
              loading={loading}
              selected={workbench.file?.path}
              onToggle={path => { void toggle(path) }}
              onOpen={path => { void controller.openFile(workspaceId, path) }}
            />
            {root.entries.length === 0 && <div className={css.emptyState}>{t('files.empty')}</div>}
            {root.truncated && <div className={css.notice}>{t('files.truncated')}</div>}
          </div>
        )}
    </div>
  )
}

function TreeLevel(props: {
  entries: WorkspaceEntry[]
  depth: number
  expanded: Set<string>
  listings: Record<string, DirectoryListing | undefined>
  loading: Set<string>
  selected: string | undefined
  onToggle: (path: string) => void
  onOpen: (path: string) => void
}) {
  return props.entries.filter(entry => entry.name !== '.git').map((entry) => {
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
            : <IconCodeOutline16 size={15} />}
          <span className={css.rowName}>{entry.name}</span>
        </button>
        {open && props.loading.has(entry.path) && <div className={css.treeLoading} style={{ paddingLeft: 28 + props.depth * 16 }}>…</div>}
        {open && children !== undefined && (
          <TreeLevel {...props} entries={children.entries} depth={props.depth + 1} />
        )}
      </div>
    )
  })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
