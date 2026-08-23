import { describe, expect, it } from 'vitest'
import { buildGitPathTree } from '../src/client/git-tree.ts'

describe('Git change tree', () => {
  it('groups paths into sorted directories without changing file identities', () => {
    const rootFile = { path: 'README.md', index: ' ', worktree: 'M' }
    const nestedFile = { path: 'src/client/z.ts', index: '?', worktree: '?' }
    const siblingFile = { path: 'src/a.ts', index: ' ', worktree: 'M' }
    const tree = buildGitPathTree([nestedFile, rootFile, siblingFile])

    expect(tree.files).toEqual([rootFile])
    expect(tree.directories[0]).toMatchObject({
      name: 'src',
      files: [siblingFile],
      directories: [{ name: 'client', files: [nestedFile] }],
    })
  })
})
