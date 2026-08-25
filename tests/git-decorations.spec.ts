import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildGitDecorations, gitFileDecoration } from '../src/client/git-decorations.ts'

describe('Git file decorations', () => {
  it('maps porcelain states to stable semantic colors', () => {
    expect(gitFileDecoration({ path: 'untracked.ts', index: '?', worktree: '?' })).toBe('untracked')
    expect(gitFileDecoration({ path: 'added.ts', index: 'A', worktree: ' ' })).toBe('added')
    expect(gitFileDecoration({ path: 'modified.ts', index: ' ', worktree: 'M' })).toBe('modified')
    expect(gitFileDecoration({ path: 'deleted.ts', index: 'D', worktree: ' ' })).toBe('deleted')
    expect(gitFileDecoration({ path: 'renamed.ts', index: 'R', worktree: ' ' })).toBe('renamed')
    expect(gitFileDecoration({ path: 'conflicted.ts', index: 'U', worktree: 'U' })).toBe('conflict')
  })

  it('uses the warning color for VS Code-style modified file labels', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/client/Workbench.module.css'), 'utf8')
    const treeRule = stylesheet.match(/\.treeRow\[data-git-decoration='modified'\]\s*\{[^}]+\}/u)?.[0]
    const tabRule = stylesheet.match(/\.editorTab\[data-git-decoration='modified'\] \.editorTabName\s*\{[^}]+\}/u)?.[0]

    expect(treeRule).toContain('color: var(--dsw-alias-state-warn-label)')
    expect(tabRule).toContain('color: var(--dsw-alias-state-warn-label)')
  })

  it('aggregates tracked descendant states without propagating untracked red to directories', () => {
    expect(buildGitDecorations([
      { path: 'src/added.ts', index: 'A', worktree: ' ' },
      { path: 'src/nested/modified.ts', index: ' ', worktree: 'M' },
      { path: 'docs/renamed.md', index: 'R', worktree: ' ' },
      { path: 'src/nested/untracked.ts', index: '?', worktree: '?' },
    ])).toEqual({
      'src/added.ts': 'added',
      'src/nested/modified.ts': 'modified',
      'docs/renamed.md': 'renamed',
      'src/nested/untracked.ts': 'untracked',
      src: 'added',
      'src/nested': 'modified',
      docs: 'renamed',
    })
  })
})
