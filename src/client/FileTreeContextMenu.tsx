import {
  IconCopyOutline16,
  IconEditOutline16,
  IconFolderOpenOutline16,
  IconRefreshOutline16,
  IconTrashOutline16,
  Menu,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceEntry } from '../contracts.ts'
import { IconFileAddOutline16, IconFileOutline16, IconFolderAddOutline16 } from './CreateEntryIcons.tsx'
import css from './Workbench.module.css'

export type FileTreeMenuAction =
  | 'open'
  | 'new-file'
  | 'new-directory'
  | 'rename'
  | 'delete'
  | 'copy-relative-path'
  | 'copy-absolute-path'
  | 'refresh'

export interface FileTreeMenuTarget {
  entry: WorkspaceEntry | null
  expanded: boolean
  rect: DOMRect
}

interface FileTreeContextMenuProps {
  target: FileTreeMenuTarget | null
  onClose: () => void
  onSelect: (action: FileTreeMenuAction) => void
  t: TranslateNS<'workbench'>
}

/** DSH 原生菜单承载文件树鼠标与键盘上下文操作。 */
export function FileTreeContextMenu(props: FileTreeContextMenuProps) {
  const entry = props.target?.entry ?? null
  return (
    <Menu
      open={props.target !== null}
      onClose={props.onClose}
      items={entry === null ? rootItems(props.t) : entryItems(entry, props.target?.expanded === true, props.t)}
      onSelect={(id) => {
        props.onClose()
        if (isFileTreeMenuAction(id)) props.onSelect(id)
      }}
      getAnchorRect={() => props.target?.rect ?? null}
      dense
      compact
      portal
      anchor={<span className={css.contextMenuAnchor} aria-hidden="true" />}
    />
  )
}

function rootItems(t: TranslateNS<'workbench'>): MenuEntry[] {
  return [
    { id: 'new-file', label: t('files.newFile'), icon: <IconFileAddOutline16 size={14} /> },
    { id: 'new-directory', label: t('files.newDirectory'), icon: <IconFolderAddOutline16 size={14} /> },
    { type: 'separator', id: 'root-refresh-separator' },
    { id: 'refresh', label: t('files.refresh'), icon: <IconRefreshOutline16 size={14} /> },
  ]
}

function entryItems(entry: WorkspaceEntry, expanded: boolean, t: TranslateNS<'workbench'>): MenuEntry[] {
  const mutable = entry.kind === 'file' || entry.kind === 'directory'
  const openLabel = entry.kind === 'directory'
    ? t(expanded ? 'files.collapseDirectory' : 'files.expandDirectory')
    : t('files.open')
  return [
    {
      id: 'open',
      label: openLabel,
      icon: entry.kind === 'directory' ? <IconFolderOpenOutline16 size={14} /> : <IconFileOutline16 size={14} />,
      disabled: entry.kind !== 'file' && entry.kind !== 'directory',
    },
    ...(entry.kind === 'directory' ? [
      { type: 'separator' as const, id: 'entry-create-separator' },
      { id: 'new-file', label: t('files.newFile'), icon: <IconFileAddOutline16 size={14} /> },
      { id: 'new-directory', label: t('files.newDirectory'), icon: <IconFolderAddOutline16 size={14} /> },
    ] : []),
    { type: 'separator', id: 'entry-edit-separator' },
    { id: 'rename', label: t('files.rename'), icon: <IconEditOutline16 size={14} />, disabled: !mutable },
    { id: 'delete', label: t('files.delete'), icon: <IconTrashOutline16 size={14} />, danger: true, disabled: !mutable },
    { type: 'separator', id: 'entry-copy-separator' },
    { id: 'copy-relative-path', label: t('files.copyRelativePath'), icon: <IconCopyOutline16 size={14} /> },
    { id: 'copy-absolute-path', label: t('files.copyAbsolutePath'), icon: <IconCopyOutline16 size={14} /> },
  ]
}

function isFileTreeMenuAction(id: string): id is FileTreeMenuAction {
  return id === 'open'
    || id === 'new-file'
    || id === 'new-directory'
    || id === 'rename'
    || id === 'delete'
    || id === 'copy-relative-path'
    || id === 'copy-absolute-path'
    || id === 'refresh'
}
