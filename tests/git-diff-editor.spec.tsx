// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GitFileDiff } from '../src/contracts.ts'
import type { DiffViewMode } from '../src/client/controller.ts'
import { GitDiffEditor } from '../src/client/GitDiffEditor.tsx'
import { zh } from '../src/client/locales.ts'

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

afterEach(() => { cleanup() })

describe('Git Diff editor', () => {
  it('renders one file and allows switching through all three Diff modes', async () => {
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
    fireEvent.click(view.getByRole('button', { name: '统一' }))
    await waitFor(() => { expect(view.container.querySelector('[data-diff-surface="unified"]')).not.toBeNull() })
    fireEvent.click(view.getByRole('button', { name: '行内' }))
    await waitFor(() => { expect(view.container.querySelector('[data-diff-surface="inline"]')).not.toBeNull() })
  })

  it('keeps the selected mode available without a width-driven fallback', async () => {
    const view = render(
      <GitDiffEditor
        diff={sampleDiff()}
        viewMode="split"
        onViewModeChange={vi.fn()}
        t={(key: keyof typeof zh) => zh[key]}
      />,
    )
    await waitFor(() => { expect(view.container.querySelector('[data-diff-effective-mode="split"]')).not.toBeNull() })
    expect(view.getAllByRole('button').every(button => !button.hasAttribute('disabled'))).toBe(true)
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

  it('keeps commit metadata in the main toolbar without a separate hash row', () => {
    const revision = 'a'.repeat(40)
    const parentRevision = 'b'.repeat(40)
    const view = render(
      <GitDiffEditor
        diff={{
          ...sampleDiff(),
          kind: 'commit',
          revision,
          parentRevision,
          commit: {
            hash: revision,
            shortHash: 'aaaaaaa',
            parents: [parentRevision],
            subject: '更新文件',
            author: 'Tester',
            authoredAt: '2026-08-24T00:00:00Z',
            references: [],
          },
        }}
        viewMode="split"
        onViewModeChange={vi.fn()}
        t={(key: keyof typeof zh) => zh[key]}
      />,
    )

    expect(view.getByText(/aaaaaaa · Tester/)).toBeTruthy()
    expect(view.container.querySelector('[data-diff-pane-labels]')).toBeNull()
    expect(view.queryByText('bbbbbbb')).toBeNull()
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
