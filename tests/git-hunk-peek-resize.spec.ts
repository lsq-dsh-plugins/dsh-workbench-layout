import { describe, expect, it, vi } from 'vitest'
import {
  GIT_HUNK_PEEK_STORAGE_KEY,
  clampGitHunkPeekWidth,
  loadGitHunkPeekWidth,
  saveGitHunkPeekWidth,
} from '../src/client/git-hunk-peek-resize.ts'

describe('Git hunk popup width preference', () => {
  it('clamps width to the usable viewport while preserving compact viewports', () => {
    expect(clampGitHunkPeekWidth(900, 800)).toBe(768)
    expect(clampGitHunkPeekWidth(100, 280)).toBe(248)
  })

  it('round-trips a valid preference through browser storage', () => {
    const storage = memoryStorage()
    expect(saveGitHunkPeekWidth(storage, 536)).toBe(true)
    expect(storage.values.get(GIT_HUNK_PEEK_STORAGE_KEY)).toBe('{"width":536}')
    expect(loadGitHunkPeekWidth(storage)).toBe(536)
  })

  it('reports malformed values and storage exceptions without breaking the popup', () => {
    const invalid = memoryStorage()
    invalid.values.set(GIT_HUNK_PEEK_STORAGE_KEY, '{"width":"wide","height":300}')
    const onLoadError = vi.fn()
    expect(loadGitHunkPeekWidth(invalid, onLoadError)).toBeNull()
    expect(onLoadError).toHaveBeenCalledOnce()

    const onSaveError = vi.fn()
    expect(saveGitHunkPeekWidth({ setItem: () => { throw new Error('blocked') } }, 480, onSaveError)).toBe(false)
    expect(onSaveError).toHaveBeenCalledOnce()
  })
})

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
  }
}
