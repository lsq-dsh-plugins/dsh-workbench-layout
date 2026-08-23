import {
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconFolderClose16,
  IconFolderOpen16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DirectoryListing, WorkspaceEntry } from '../contracts.ts'
import { IconFileOutline16 } from './CreateEntryIcons.tsx'
import { FileTreeCreateRow, type FileTreeCreateKind } from './FileTreeCreateRow.tsx'
import css from './Workbench.module.css'

export interface FileTreeCreateDraft {
  parent: string
  kind: FileTreeCreateKind
}

interface FileTreeLevelProps {
  entries: WorkspaceEntry[]
  directoryPath: string
  depth: number
  expanded: Set<string>
  listings: Record<string, DirectoryListing | undefined>
  loading: Set<string>
  selected: string | undefined
  createDraft: FileTreeCreateDraft | null
  createLabel: string
  onCreate: (draft: FileTreeCreateDraft, name: string) => Promise<boolean>
  onCancelCreate: () => void
  onToggle: (path: string) => void
  onOpen: (path: string) => void
  onContextMenu: (entry: WorkspaceEntry, rect: DOMRect) => void
}

/** Recursive, lazy file-tree rows kept separate from the operation orchestration. */
export function FileTreeLevel(props: FileTreeLevelProps) {
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
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              props.onContextMenu(entry, new DOMRect(event.clientX, event.clientY, 0, 0))
            }}
            onKeyDown={(event) => {
              if (!isContextMenuKey(event.key, event.shiftKey)) return
              event.preventDefault()
              event.stopPropagation()
              props.onContextMenu(entry, event.currentTarget.getBoundingClientRect())
            }}
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
            <FileTreeLevel {...props} entries={children.entries} directoryPath={entry.path} depth={props.depth + 1} />
          )}
        </div>
      )
    })}
  </>
}

export function isContextMenuKey(key: string, shiftKey: boolean): boolean {
  return key === 'ContextMenu' || (shiftKey && key === 'F10')
}
