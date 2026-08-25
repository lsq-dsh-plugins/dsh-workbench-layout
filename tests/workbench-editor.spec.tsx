// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchState } from '../src/client/controller.ts'
import { zh } from '../src/client/locales.ts'
import { WorkbenchEditor, type WorkbenchEditorProps } from '../src/client/WorkbenchEditor.tsx'

const workbenchState = vi.hoisted(() => ({ current: {} as WorkbenchState }))

vi.mock('../src/client/use-workbench.ts', () => ({ useWorkbench: () => workbenchState.current }))
vi.mock('../src/client/CodeEditor.tsx', () => ({
  CodeEditor: ({ ariaLabel, gitOriginal }: { ariaLabel: string; gitOriginal?: string }) => (
    <textarea aria-label={ariaLabel} data-git-original={gitOriginal} />
  ),
}))
vi.mock('../src/client/GitDiffEditor.tsx', () => ({ GitDiffEditor: () => <div>diff</div> }))
vi.mock('../src/client/TerminalSurface.tsx', () => ({
  TerminalSurface: ({ tab }: { tab: { id: string } }) => <div data-terminal-surface={tab.id}>terminal</div>,
}))
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, variant: _variant, size: _size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => <button {...props}>{children}</button>,
  FishLogo: () => <span data-fish-logo="" />,
  IconCloseOutline16: () => <span data-close-icon="" />,
  MarkdownText: ({ text }: { text: string }) => <article>{text}</article>,
  Modal: ({ open, title, description, footer }: { open: boolean; title: string; description?: string; footer?: React.ReactNode }) => open
    ? <div role="dialog" aria-label={title}><p>{description}</p>{footer}</div>
    : null,
}))

beforeEach(() => {
  workbenchState.current = state()
})
afterEach(() => { cleanup() })

describe('WorkbenchEditor multi-file tabs', () => {
  it('renders open files without a persistent Save button and saves the active tab with Ctrl+S', () => {
    const controller = controllerFake()
    const view = renderEditor(controller)
    expect(view.getAllByRole('tab')).toHaveLength(2)
    expect(view.getByRole('tab', { name: 'README.md' }).getAttribute('aria-selected')).toBe('true')
    expect(view.queryByRole('button', { name: '保存' })).toBeNull()

    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect(controller.save).toHaveBeenCalledWith('file:README.md')
  })

  it('selects an existing file tab instead of reopening it', () => {
    const controller = controllerFake()
    const view = renderEditor(controller)
    fireEvent.click(view.getByRole('tab', { name: 'a.ts' }))
    expect(controller.selectTab).toHaveBeenCalledWith('file:src/a.ts')
  })

  it('loads the HEAD baseline for a source tab and passes it to the normal editor', () => {
    workbenchState.current.activeTabId = 'file:src/a.ts'
    const source = workbenchState.current.tabs[0]
    if (source?.kind === 'file') {
      source.gitBaseline = {
        path: source.path,
        available: true,
        original: 'const a = 0',
        binary: false,
        revision: 'a'.repeat(40),
      }
    }
    const controller = controllerFake()
    const view = renderEditor(controller)

    expect(controller.ensureGitBaseline).toHaveBeenCalledWith('file:src/a.ts')
    expect(view.getByRole('textbox', { name: 'src/a.ts' }).dataset.gitOriginal).toBe('const a = 0')
  })

  it('uses a DSH modal before discarding an unsaved tab', () => {
    workbenchState.current.tabs[0]!.dirty = true
    const controller = controllerFake()
    const view = renderEditor(controller)
    fireEvent.click(view.getByRole('button', { name: '关闭 a.ts' }))
    expect(controller.selectTab).toHaveBeenCalledWith('file:src/a.ts')
    expect(view.getByRole('dialog', { name: '关闭未保存的文件？' })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: '放弃更改' }))
    expect(controller.closeTab).toHaveBeenCalledWith('file:src/a.ts', true)
  })

  it('renders Diff as a normal closable editor tab beside files', () => {
    workbenchState.current.tabs.push(diffTab('src/a.ts'))
    workbenchState.current.activeTabId = 'diff:worktree::src/a.ts'
    const controller = controllerFake()
    const view = renderEditor(controller)

    expect(view.getAllByRole('tab')).toHaveLength(3)
    expect(view.getByRole('tab', { name: 'a.ts (工作区差异)' }).getAttribute('aria-selected')).toBe('true')
    expect(view.getByText('diff')).toBeTruthy()
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect(controller.save).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: '关闭 a.ts (工作区差异)' }))
    expect(controller.closeTab).toHaveBeenCalledWith('diff:worktree::src/a.ts')
    expect(view.queryByRole('dialog')).toBeNull()
  })

  it('renders a Workspace terminal as a normal tab and does not route Ctrl+S to it', () => {
    workbenchState.current.tabs.push(terminalTab(1))
    workbenchState.current.activeTabId = 'terminal:1'
    const controller = controllerFake()
    const view = renderEditor(controller)

    expect(view.getByRole('tab', { name: '终端 1' }).getAttribute('aria-selected')).toBe('true')
    expect(view.getByText('terminal')).toBeTruthy()
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect(controller.save).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: '关闭 终端 1' }))
    expect(controller.closeTab).toHaveBeenCalledWith('terminal:1')
  })

  it('offers explicit choices instead of overwriting a draft changed by another program', () => {
    workbenchState.current.tabs[1] = {
      ...workbenchState.current.tabs[1]!,
      dirty: true,
      externalChange: {
        kind: 'changed',
        file: { path: 'README.md', content: '# Outside', version: '2', size: 9, markdown: true },
      },
    }
    const controller = controllerFake()
    const view = renderEditor(controller)

    expect(view.getByText('文件已在其他程序中修改。请选择要保留的内容。')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: '重新加载' }))
    expect(controller.reloadExternalFile).toHaveBeenCalledWith('file:README.md')
    fireEvent.click(view.getByRole('button', { name: '保留当前内容' }))
    expect(controller.keepCurrentDraft).toHaveBeenCalledWith('file:README.md')
  })
})

function renderEditor(controller: ReturnType<typeof controllerFake>) {
  const props = {
    sessionId: 'session-1',
    useWorkspaces: (selector: (snapshot: {
      items: Array<{ workspaceId: string; sessionIds: string[] }>
      recentWorkspaceId: string
    }) => unknown) => selector({
      items: [{ workspaceId: 'workspace-1', sessionIds: ['session-1'] }],
      recentWorkspaceId: 'workspace-1',
    }),
    controller,
    activateWorkspace: vi.fn(),
    t: (key: keyof typeof zh, values?: Record<string, string>) => interpolate(zh[key], values),
  } as unknown as WorkbenchEditorProps
  return render(<WorkbenchEditor {...props} />)
}

function controllerFake() {
  return {
    store: { getSnapshot: () => workbenchState.current },
    save: vi.fn(() => Promise.resolve(true)),
    selectTab: vi.fn(),
    closeTab: vi.fn(() => true),
    setPreview: vi.fn(),
    revert: vi.fn(),
    reloadExternalFile: vi.fn(),
    keepCurrentDraft: vi.fn(),
    setDraft: vi.fn(),
    ensureGitBaseline: vi.fn(() => Promise.resolve()),
    setDiffViewMode: vi.fn(),
    restartTerminal: vi.fn(),
  }
}

function state(): WorkbenchState {
  return {
    sidebarMode: 'files',
    editorExpanded: true,
    workspaceId: 'workspace-1',
    tabs: [
      tab('src/a.ts', 'const a = 1', false),
      tab('README.md', '# Readme', true),
    ],
    activeTabId: 'file:README.md',
    diffViewMode: 'split',
    gitView: 'changes',
    gitChangeLayout: 'list',
    gitGraphFileLayout: 'list',
  }
}

function tab(path: string, content: string, markdown: boolean) {
  return {
    id: `file:${path}`,
    kind: 'file' as const,
    path,
    file: { path, content, version: '1', size: content.length, markdown },
    draft: content,
    dirty: false,
    preview: markdown,
    loading: false,
    saving: false,
    externalChange: null,
    error: null,
  }
}

function diffTab(path: string) {
  return {
    id: `diff:worktree::${path}`,
    kind: 'diff' as const,
    path,
    diffKind: 'worktree' as const,
    diff: { kind: 'worktree' as const, path, status: 'M', original: 'old', modified: 'new', binary: false },
    loading: false,
    error: null,
  }
}

function terminalTab(sequence: number) {
  return {
    id: `terminal:${sequence}`,
    kind: 'terminal' as const,
    sequence,
    generation: 0,
    status: 'running' as const,
    shell: 'zsh',
    error: null,
  }
}

function interpolate(template: string, values: Record<string, string> | undefined): string {
  if (values === undefined) return template
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, value), template)
}
