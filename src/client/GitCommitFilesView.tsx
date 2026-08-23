import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconCodeOutline16,
  IconFolderClose16,
  IconFolderOpen16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { GitCommitFile } from '../contracts.ts'
import { buildGitPathTree, type GitFileLayout, type GitPathTreeNode } from './git-tree.ts'
import css from './Workbench.module.css'

interface GitCommitFilesViewProps {
  files: GitCommitFile[]
  layout: GitFileLayout
  selectedPath: string | undefined
  onOpen: (path: string) => void
}

/** 提交内文件清单；列表和目录树只改变排列，不改变单文件 Diff 行为。 */
export function GitCommitFilesView(props: GitCommitFilesViewProps) {
  if (props.layout === 'list') {
    return (
      <div data-commit-file-layout="list">
        {props.files.map(file => (
          <CommitFileRow
            key={file.path}
            file={file}
            selected={props.selectedPath === file.path}
            showDirectory
            onOpen={() => { props.onOpen(file.path) }}
          />
        ))}
      </div>
    )
  }
  return <CommitFileTree {...props} />
}

function CommitFileTree(props: GitCommitFilesViewProps) {
  const root = useMemo(() => buildGitPathTree(props.files), [props.files])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const toggle = (path: string): void => {
    setCollapsed(current => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }
  return (
    <div data-commit-file-layout="tree">
      <CommitTreeChildren
        node={root}
        depth={0}
        collapsed={collapsed}
        selectedPath={props.selectedPath}
        onToggle={toggle}
        onOpen={props.onOpen}
      />
    </div>
  )
}

function CommitTreeChildren(props: {
  node: GitPathTreeNode<GitCommitFile>
  depth: number
  collapsed: Set<string>
  selectedPath: string | undefined
  onToggle: (path: string) => void
  onOpen: (path: string) => void
}) {
  return (
    <>
      {props.node.directories.map(directory => {
        const expanded = !props.collapsed.has(directory.path)
        return (
          <div key={directory.path}>
            <button
              type="button"
              className={css.gitFolderRow}
              style={{ '--git-tree-depth': props.depth } as CSSProperties}
              aria-expanded={expanded}
              title={directory.path}
              onClick={() => { props.onToggle(directory.path) }}
            >
              {expanded ? <IconChevronDownOutline14 size={12} /> : <IconChevronRightOutline14 size={12} />}
              {expanded ? <IconFolderOpen16 size={15} /> : <IconFolderClose16 size={15} />}
              <span className={css.rowName}>{directory.name}</span>
            </button>
            {expanded && <CommitTreeChildren {...props} node={directory} depth={props.depth + 1} />}
          </div>
        )
      })}
      {props.node.files.map(file => (
        <CommitFileRow
          key={file.path}
          file={file}
          selected={props.selectedPath === file.path}
          depth={props.depth}
          onOpen={() => { props.onOpen(file.path) }}
        />
      ))}
    </>
  )
}

function CommitFileRow(props: {
  file: GitCommitFile
  selected: boolean
  showDirectory?: boolean
  depth?: number
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className={css.graphFileRow}
      data-selected={props.selected || undefined}
      data-tree={props.depth === undefined ? undefined : ''}
      style={props.depth === undefined ? undefined : { '--git-tree-depth': props.depth } as CSSProperties}
      title={props.file.originalPath === undefined ? props.file.path : `${props.file.originalPath} → ${props.file.path}`}
      onClick={props.onOpen}
    >
      <IconCodeOutline16 size={14} />
      <span className={css.gitFileText}>
        <span className={css.rowName}>{fileName(props.file.path)}</span>
        {props.showDirectory === true && <span className={css.gitFileDirectory}>{directoryName(props.file.path)}</span>}
      </span>
      <span className={css.statusBadge} data-status={normalizeStatus(props.file.status)}>{normalizeStatus(props.file.status)}</span>
    </button>
  )
}

function normalizeStatus(status: string): string {
  return status === '?' ? 'U' : status === ' ' ? 'M' : status
}

function fileName(path: string): string {
  return path.split('/').at(-1) ?? path
}

function directoryName(path: string): string {
  const boundary = path.lastIndexOf('/')
  return boundary < 0 ? '' : path.slice(0, boundary)
}
