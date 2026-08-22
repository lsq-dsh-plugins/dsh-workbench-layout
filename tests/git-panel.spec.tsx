// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GitPanel } from '../src/client/GitPanel.tsx'
import { zh } from '../src/client/locales.ts'

vi.mock('../src/client/use-workbench.ts', () => ({
  useWorkbench: () => ({ diff: null }),
}))

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  IconBranchOutline16: () => <span />,
  IconCodeOutline16: () => <span />,
  IconCloseOutline16: () => <span />,
  IconPlusOutline16: () => <span />,
  IconRefreshOutline14: () => <span />,
}))

describe('Git panel', () => {
  it('groups changes and staged files, lists history, and opens diffs in the controller', async () => {
    const commit = {
      hash: 'a'.repeat(40), shortHash: 'aaaaaaa', subject: '完善工作台', author: 'Tester', authoredAt: '2026-08-23T10:00:00Z',
    }
    const controller = {
      api: {
        gitStatus: vi.fn(() => Promise.resolve({
          available: true,
          branch: 'main',
          files: [{ path: 'src/a.ts', index: 'M', worktree: 'M' }],
        })),
        gitHistory: vi.fn(() => Promise.resolve({ commits: [commit], truncated: false })),
      },
      openDiff: vi.fn(() => Promise.resolve()),
      openCommitDiff: vi.fn(() => Promise.resolve()),
    }
    const view = render(
      <GitPanel
        controller={controller as never}
        sessionId="session-1"
        t={(key: keyof typeof zh) => zh[key]}
      />,
    )

    await waitFor(() => { expect(view.getByText('提交历史')).toBeTruthy() })
    expect(view.getByText('工作区更改')).toBeTruthy()
    expect(view.getByText('已暂存')).toBeTruthy()
    expect(view.getByText('完善工作台')).toBeTruthy()

    fireEvent.click(view.getAllByTitle('src/a.ts')[0]!)
    expect(controller.openDiff).toHaveBeenCalledWith('session-1', 'src/a.ts', false)
    fireEvent.click(view.getByText('完善工作台'))
    expect(controller.openCommitDiff).toHaveBeenCalledWith('session-1', commit)
  })
})
