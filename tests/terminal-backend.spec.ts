import { describe, expect, it, vi } from 'vitest'
import type { IPty } from 'node-pty'
import type { WorkspaceBackend } from '../src/workspace-backend.ts'
import { resolveTerminalShell, WorkspaceTerminal } from '../src/terminal-backend.ts'

describe('工作区 PTY 后端', () => {
  it('只使用宿主 shell，并把工作目录固定到官方工作区根目录', async () => {
    const workspace = {
      rootProcessPath: vi.fn(() => Promise.resolve({ cwd: '/workspace', workspaceId: 'workspace-1' })),
    } as unknown as WorkspaceBackend
    const sink = { ready: vi.fn(), data: vi.fn(), exit: vi.fn() }
    const logger = { info: vi.fn(), warn: vi.fn() }
    const pty = new FakePty()
    const spawn = vi.fn(() => pty as unknown as IPty)
    const terminal = new WorkspaceTerminal(workspace, sink, logger, spawn)

    await terminal.start('workspace-1', 100, 30)

    expect(workspace.rootProcessPath).toHaveBeenCalledWith('workspace-1')
    expect(spawn).toHaveBeenCalledWith(expect.any(String), [], expect.objectContaining({
      cwd: '/workspace', cols: 100, rows: 30, name: 'xterm-256color',
    }))
    expect(sink.ready).toHaveBeenCalledWith(expect.any(String))
    pty.emitData('\u001b[32mready\u001b[0m')
    terminal.write('pwd\r')
    terminal.resize(120, 40)
    expect(sink.data).toHaveBeenCalledWith('\u001b[32mready\u001b[0m')
    expect(pty.write).toHaveBeenCalledWith('pwd\r')
    expect(pty.resize).toHaveBeenCalledWith(120, 40)

    terminal.dispose()
    expect(pty.kill).toHaveBeenCalledOnce()
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('stopped workspace terminal'))
  })

  it('转发退出状态并不会重复终止已退出进程', async () => {
    const workspace = {
      rootProcessPath: vi.fn(() => Promise.resolve({ cwd: '/workspace', workspaceId: 'workspace-1' })),
    } as unknown as WorkspaceBackend
    const sink = { ready: vi.fn(), data: vi.fn(), exit: vi.fn() }
    const pty = new FakePty()
    const terminal = new WorkspaceTerminal(
      workspace,
      sink,
      { info: vi.fn(), warn: vi.fn() },
      () => pty as unknown as IPty,
    )

    await terminal.start('workspace-1', 80, 24)
    pty.emitExit(7, 15)
    terminal.dispose()

    expect(sink.exit).toHaveBeenCalledWith(7, 15)
    expect(pty.kill).not.toHaveBeenCalled()
  })

  it('跨平台选择宿主配置的 shell，不接受浏览器命令', () => {
    expect(resolveTerminalShell('linux', { SHELL: '/bin/zsh' })).toEqual({
      file: '/bin/zsh', args: [], label: 'zsh',
    })
    expect(resolveTerminalShell('win32', { ComSpec: 'C:\\Windows\\System32\\cmd.exe' })).toEqual({
      file: 'C:\\Windows\\System32\\cmd.exe', args: [], label: 'cmd.exe',
    })
  })
})

class FakePty {
  readonly write = vi.fn()
  readonly resize = vi.fn()
  readonly kill = vi.fn()
  readonly pause = vi.fn()
  readonly resume = vi.fn()
  private dataListener: ((data: string) => void) | undefined
  private exitListener: ((event: { exitCode: number; signal?: number }) => void) | undefined

  readonly onData = (listener: (data: string) => void) => {
    this.dataListener = listener
    return { dispose: () => { this.dataListener = undefined } }
  }

  readonly onExit = (listener: (event: { exitCode: number; signal?: number }) => void) => {
    this.exitListener = listener
    return { dispose: () => { this.exitListener = undefined } }
  }

  emitData(data: string): void { this.dataListener?.(data) }

  emitExit(exitCode: number, signal?: number): void {
    this.exitListener?.({ exitCode, ...(signal === undefined ? {} : { signal }) })
  }
}
