/** 工作区根目录中的单个交互式伪终端。 */

import { basename, win32 } from 'node:path'
import { spawn, type IDisposable, type IPty } from 'node-pty'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { WorkspaceBackend } from './workspace-backend.ts'

export interface TerminalBackendLogger {
  info(message: string): void
  warn(message: string | Error): void
}

export interface TerminalBackendSink {
  ready(shell: string): void
  data(data: string): void
  exit(exitCode: number, signal?: number): void
}

export interface TerminalPtySpawner {
  (file: string, args: string[], options: {
    name: string
    cols: number
    rows: number
    cwd: string
    env: NodeJS.ProcessEnv
  }): IPty
}

export interface TerminalShell {
  file: string
  args: string[]
  label: string
}

/** Resolve the host user's configured shell without accepting browser input. */
export function resolveTerminalShell(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): TerminalShell {
  if (platform === 'win32') {
    const file = env.ComSpec ?? env.COMSPEC ?? 'cmd.exe'
    return { file, args: [], label: win32.basename(file) }
  }
  const file = env.SHELL?.startsWith('/') === true ? env.SHELL : '/bin/sh'
  return { file, args: [], label: basename(file) }
}

/** Own one PTY process from workspace resolution through teardown. */
export class WorkspaceTerminal {
  private pty: IPty | null = null
  private dataSubscription: IDisposable | null = null
  private exitSubscription: IDisposable | null = null
  private workspaceId: WorkspaceId | undefined
  private disposed = false
  private exited = false

  constructor(
    private readonly workspace: WorkspaceBackend,
    private readonly sink: TerminalBackendSink,
    private readonly logger: TerminalBackendLogger,
    private readonly spawnPty: TerminalPtySpawner = spawn,
  ) {}

  async start(workspaceIdValue: unknown, cols: number, rows: number): Promise<void> {
    if (this.pty !== null || this.workspaceId !== undefined) throw new Error('终端已经启动。')
    const root = await this.workspace.rootProcessPath(workspaceIdValue)
    if (this.disposed) return
    const shell = resolveTerminalShell(process.platform, process.env)
    const pty = this.spawnPty(shell.file, shell.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: root.cwd,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    })
    this.pty = pty
    this.workspaceId = root.workspaceId
    this.dataSubscription = pty.onData(data => { this.sink.data(data) })
    this.exitSubscription = pty.onExit(({ exitCode, signal }) => {
      this.exited = true
      this.sink.exit(exitCode, signal)
      this.logger.info(`workbench-layout: workspace terminal exited in ${JSON.stringify(root.workspaceId)} with code ${exitCode}`)
      this.releasePty()
    })
    this.sink.ready(shell.label)
    this.logger.info(`workbench-layout: started workspace terminal in ${JSON.stringify(root.workspaceId)}`)
  }

  write(data: string): void {
    if (this.pty === null || this.exited || this.disposed) return
    this.pty.write(data)
  }

  resize(cols: number, rows: number): void {
    if (this.pty === null || this.exited || this.disposed) return
    this.pty.resize(cols, rows)
  }

  setOutputPaused(paused: boolean): void {
    if (this.pty === null || this.exited || this.disposed) return
    if (paused) this.pty.pause()
    else this.pty.resume()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const running = this.pty !== null && !this.exited
    if (running) {
      try {
        this.pty?.kill()
      } catch (error: unknown) {
        this.logger.warn(error instanceof Error ? error : new Error(String(error)))
      }
    }
    this.releasePty()
    if (running && this.workspaceId !== undefined) {
      this.logger.info(`workbench-layout: stopped workspace terminal in ${JSON.stringify(this.workspaceId)}`)
    }
  }

  private releasePty(): void {
    this.dataSubscription?.dispose()
    this.exitSubscription?.dispose()
    this.dataSubscription = null
    this.exitSubscription = null
    this.pty = null
  }
}
