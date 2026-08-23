// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitFileDiff } from '../src/contracts.ts'
import type { DiffViewMode } from '../src/client/controller.ts'
import { GitDiffEditor } from '../src/client/GitDiffEditor.tsx'
import { zh } from '../src/client/locales.ts'

let observedWidth = 1000

vi.mock('../src/client/DiffSurface.tsx', () => ({
  DiffSurface: ({ mode, original, modified }: { mode: string; original: string; modified: string }) => (
    <div data-diff-surface={mode} data-original={original} data-modified={modified} />
  ),
}))

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  FishLogo: () => <span />,
  IconCodeOutline16: () => <span />,
  Pill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

beforeEach(() => {
  observedWidth = 1000
  vi.stubGlobal('ResizeObserver', class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(): void {
      this.callback([{ contentRect: { width: observedWidth } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    disconnect(): void {}
    unobserve(): void {}
  })
})

afterEach(() => { cleanup() })

describe('Git Diff editor', () => {
  it('renders one file side by side and allows switching to inline mode', async () => {
    const diff = sampleDiff()
    function Harness() {
      const [mode, setMode] = useState<DiffViewMode>('split')
      return (
        <GitDiffEditor
          diff={diff}
          viewMode={mode}
          onViewModeChange={setMode}
          t={(key: keyof typeof zh) => zh[key]}
        />
      )
    }
    const view = render(<Harness />)

    await waitFor(() => { expect(view.container.querySelector('[data-diff-surface="split"]')).not.toBeNull() })
    expect(view.getByText('src/a.ts')).toBeTruthy()
    expect(view.getByText('+1')).toBeTruthy()
    expect(view.getByText('-1')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: '行内' }))
    await waitFor(() => { expect(view.container.querySelector('[data-diff-surface="inline"]')).not.toBeNull() })
  })

  it('automatically uses inline mode when the editor column is narrow', async () => {
    observedWidth = 600
    const view = render(
      <GitDiffEditor
        diff={sampleDiff()}
        viewMode="split"
        onViewModeChange={vi.fn()}
        t={(key: keyof typeof zh) => zh[key]}
      />,
    )
    await waitFor(() => { expect(view.container.querySelector('[data-diff-effective-mode="inline"]')).not.toBeNull() })
    expect(view.getByRole('button', { name: '左右对照' }).hasAttribute('disabled')).toBe(true)
  })

  it('shows a binary notice instead of constructing a text editor', () => {
    const view = render(
      <GitDiffEditor
        diff={{ ...sampleDiff(), binary: true, original: '', modified: '' }}
        viewMode="split"
        onViewModeChange={vi.fn()}
        t={(key: keyof typeof zh) => zh[key]}
      />,
    )
    expect(view.getByText('这是二进制文件，无法显示文本差异。')).toBeTruthy()
    expect(view.container.querySelector('[data-diff-surface]')).toBeNull()
  })
})

function sampleDiff(): GitFileDiff {
  return {
    kind: 'worktree',
    path: 'src/a.ts',
    status: 'M',
    original: 'const value = 1\n',
    modified: 'const value = 2\n',
    binary: false,
    additions: 1,
    deletions: 1,
  }
}
