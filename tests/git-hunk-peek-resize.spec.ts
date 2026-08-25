import { describe, expect, it, vi } from 'vitest'
import {
  GIT_HUNK_PEEK_STORAGE_KEY,
  clampGitHunkPeekSize,
  loadGitHunkPeekSize,
  saveGitHunkPeekSize,
} from '../src/client/git-hunk-peek-resize.ts'

describe('Git hunk popup resize preferences', () => {
  it('clamps both dimensions to the usable viewport while preserving compact viewports', () => {
    expect(clampGitHunkPeekSize(
      { width: 900, height: 700 },
      { width: 800, height: 600 },
    )).toEqual({ width: 768, height: 568 })
    expect(clampGitHunkPeekSize(
      { width: 100, height: 100 },
      { width: 280, height: 160 },
    )).toEqual({ width: 248, height: 128 })
  })

  it('round-trips a valid preference through browser storage', () => {
    const storage = memoryStorage()
    expect(saveGitHunkPeekSize(storage, { width: 536, height: 384 })).toBe(true)
    expect(storage.values.get(GIT_HUNK_PEEK_STORAGE_KEY)).toBe('{"width":536,"height":384}')
    expect(loadGitHunkPeekSize(storage)).toEqual({ width: 536, height: 384 })
  })

  it('reports malformed values and storage exceptions without breaking the popup', () => {
    const invalid = memoryStorage()
    invalid.values.set(GIT_HUNK_PEEK_STORAGE_KEY, '{"width":"wide","height":300}')
    const onLoadError = vi.fn()
    expect(loadGitHunkPeekSize(invalid, onLoadError)).toBeNull()
    expect(onLoadError).toHaveBeenCalledOnce()

    const onSaveError = vi.fn()
    expect(saveGitHunkPeekSize({ setItem: () => { throw new Error('blocked') } }, { width: 480, height: 320 }, onSaveError)).toBe(false)
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
