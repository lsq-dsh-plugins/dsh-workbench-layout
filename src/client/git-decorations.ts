import type { GitFileStatus } from '../contracts.ts'

export type GitFileDecoration = 'conflict' | 'untracked' | 'deleted' | 'added' | 'modified' | 'renamed'
export type GitDecorationMap = Record<string, GitFileDecoration>

const PRIORITY: Record<GitFileDecoration, number> = {
  conflict: 6,
  untracked: 5,
  deleted: 4,
  added: 3,
  modified: 2,
  renamed: 1,
}

const CONFLICT_PAIRS = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

/** Convert the two porcelain columns into one visual state without hiding conflicts. */
export function gitFileDecoration(file: GitFileStatus): GitFileDecoration | undefined {
  const pair = `${file.index}${file.worktree}`
  if (file.index === 'U' || file.worktree === 'U' || CONFLICT_PAIRS.has(pair)) return 'conflict'
  if (file.index === '?' || file.worktree === '?') return 'untracked'
  if (file.index === 'D' || file.worktree === 'D') return 'deleted'
  if (file.index === 'A' || file.worktree === 'A') return 'added'
  if ('MT'.includes(file.index) || 'MT'.includes(file.worktree)) return 'modified'
  if ('RC'.includes(file.index) || 'RC'.includes(file.worktree)) return 'renamed'
  return undefined
}

/** Decorate files and aggregate the strongest descendant state onto every parent directory. */
export function buildGitDecorations(files: readonly GitFileStatus[]): GitDecorationMap {
  const decorations: GitDecorationMap = {}
  for (const file of files) {
    const decoration = gitFileDecoration(file)
    if (decoration === undefined) continue
    mergeDecoration(decorations, file.path, decoration)
    let parent = parentPath(file.path)
    while (parent !== '') {
      mergeDecoration(decorations, parent, decoration)
      parent = parentPath(parent)
    }
  }
  return decorations
}

function mergeDecoration(target: GitDecorationMap, path: string, decoration: GitFileDecoration): void {
  const current = target[path]
  if (current === undefined || PRIORITY[decoration] > PRIORITY[current]) target[path] = decoration
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator)
}
