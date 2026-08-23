// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileTree } from '../src/client/FileTree.tsx'
import { zh } from '../src/client/locales.ts'

const workbench = vi.hoisted(() => ({
  current: {
    activeTabId: undefined as string | undefined,
    tabs: [] as Array<{ id: string; kind: 'file'; path: string; dirty: boolean }>,
    sidebarAction: undefined as { id: number; action: 'files.newFile' | 'files.newDirectory' | 'files.refresh'; workspaceId: string } | undefined,
  },
}))

vi.mock('../src/client/use-workbench.ts', () => ({ useWorkbench: () => workbench.current }))

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  IconChevronDownOutline14: () => <span />,
  IconChevronRightOutline14: () => <span />,
  IconFolderClose16: () => <span data-icon="official-folder" />,
  IconFolderOpen16: () => <span />,
  IconPlusOutline16: () => <span data-icon="official-plus" />,
  IconRefreshOutline14: () => <span />,
}))

afterEach(() => {
  cleanup()
  workbench.current = { activeTabId: undefined, tabs: [], sidebarAction: undefined }
})

describe('文件目录', () => {
  it('在所选目录内新建文件，并在所选文件的父目录中新建文件夹', async () => {
    const root = {
      path: '',
      truncated: false,
      entries: [
        { name: 'src', path: 'src', kind: 'directory' as const },
        { name: 'README.md', path: 'README.md', kind: 'file' as const },
      ],
    }
    const src = { path: 'src', truncated: false, entries: [] }
    const controller = {
      api: {
        listDirectory: vi.fn((_workspaceId: string, path: string) => Promise.resolve(path === 'src' ? src : root)),
        createFile: vi.fn(() => Promise.resolve({ name: 'new.ts', path: 'src/new.ts', kind: 'file' })),
        createDirectory: vi.fn(() => Promise.resolve({ name: 'docs', path: 'docs', kind: 'directory' })),
      },
      openFile: vi.fn(() => Promise.resolve()),
    }
    const view = render(
      <FileTree
        controller={controller as never}
        workspaceId="workspace-1"
        t={key => zh[key]}
      />,
    )

    await waitFor(() => { expect(view.getByText('src')).toBeTruthy() })
    const fileAddIcon = view.getByRole('button', { name: '新建文件' }).querySelector('[data-icon="file-add"]')
    const folderAddIcon = view.getByRole('button', { name: '新建文件夹' }).querySelector('[data-icon="folder-add"]')
    expect(fileAddIcon).not.toBeNull()
    expect(folderAddIcon).not.toBeNull()
    expect(fileAddIcon?.querySelector('[data-icon="file"]')).not.toBeNull()
    expect(fileAddIcon?.querySelector('[data-icon="official-plus"]')).not.toBeNull()
    expect(folderAddIcon?.querySelector('[data-icon="official-folder"]')).not.toBeNull()
    expect(folderAddIcon?.querySelector('[data-icon="official-plus"]')).not.toBeNull()
    fireEvent.click(view.getByText('src'))
    fireEvent.click(view.getByRole('button', { name: '新建文件' }))
    const fileInput = await view.findByRole('textbox', { name: '文件名' })
    fireEvent.change(fileInput, { target: { value: 'new.ts' } })
    fireEvent.submit(fileInput.closest('form')!)
    await waitFor(() => {
      expect(controller.api.createFile).toHaveBeenCalledWith('workspace-1', 'src/new.ts')
      expect(controller.openFile).toHaveBeenCalledWith('workspace-1', 'src/new.ts')
    })

    fireEvent.click(view.getByText('README.md'))
    fireEvent.click(view.getByRole('button', { name: '新建文件夹' }))
    const directoryInput = await view.findByRole('textbox', { name: '文件夹名称' })
    fireEvent.change(directoryInput, { target: { value: 'docs' } })
    fireEvent.submit(directoryInput.closest('form')!)
    await waitFor(() => {
      expect(controller.api.createDirectory).toHaveBeenCalledWith('workspace-1', 'docs')
    })
  })

  it('展开后只消费一次收起栏的新建文件命令', async () => {
    workbench.current = {
      activeTabId: undefined,
      tabs: [],
      sidebarAction: { id: 7, action: 'files.newFile', workspaceId: 'workspace-1' },
    }
    const controller = {
      api: {
        listDirectory: vi.fn(() => Promise.resolve({ path: '', truncated: false, entries: [] })),
      },
      consumeSidebarAction: vi.fn(),
      openFile: vi.fn(),
    }
    const view = render(
      <FileTree controller={controller as never} workspaceId="workspace-1" t={key => zh[key]} />,
    )

    expect(await view.findByRole('textbox', { name: '文件名' })).toBeTruthy()
    expect(controller.consumeSidebarAction).toHaveBeenCalledOnce()
    expect(controller.consumeSidebarAction).toHaveBeenCalledWith(7)
  })
})
