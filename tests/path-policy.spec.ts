import { describe, expect, it } from 'vitest'
import { childWorkspacePath, normalizeWorkspacePath } from '../src/path-policy.ts'

describe('workspace path policy', () => {
  it('accepts the root and slash-delimited relative file paths', () => {
    expect(normalizeWorkspacePath('')).toBe('')
    expect(normalizeWorkspacePath('src/client/index.ts')).toBe('src/client/index.ts')
    expect(childWorkspacePath('src/client', 'index.ts')).toBe('src/client/index.ts')
  })

  it.each(['/outside', '../outside', 'src/../outside', 'src//file', 'src\\file', 'src/./file'])(
    'rejects paths that can escape or have ambiguous segments: %s',
    (path) => { expect(() => normalizeWorkspacePath(path)).toThrow() },
  )

  it('rejects unsafe names supplied by a filesystem listing', () => {
    expect(() => childWorkspacePath('', '..')).toThrow()
    expect(() => childWorkspacePath('', 'nested/name')).toThrow()
  })
})
