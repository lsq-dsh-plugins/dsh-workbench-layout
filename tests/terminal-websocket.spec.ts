import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IPty } from 'node-pty'
import WebSocket from 'ws'
import type { WorkspaceBackend } from '../src/workspace-backend.ts'
import type { TerminalServerMessage } from '../src/terminal-protocol.ts'
import { TerminalSocketServer } from '../src/terminal-websocket.ts'

describe('终端 WebSocket 桥接', () => {
  let http: Server | undefined
  let terminals: TerminalSocketServer | undefined

  afterEach(async () => {
    if (terminals !== undefined) await bounded(terminals.close(), 'terminal server close')
    if (http?.listening === true) await bounded(new Promise<void>(resolve => { http?.close(() => { resolve() }) }), 'HTTP server close')
  })

  it('在一条连接中桥接启动、ANSI 输出、输入、尺寸和退出', async () => {
    const pty = new FakePty()
    const workspace = {
      rootProcessPath: vi.fn(() => Promise.resolve({ cwd: '/workspace', workspaceId: 'workspace-1' })),
    } as unknown as WorkspaceBackend
    const logger = { info: vi.fn(), warn: vi.fn() }
    terminals = new TerminalSocketServer(
      workspace,
      logger,
      2,
      () => pty as unknown as IPty,
    )
    http = createServer()
    http.on('upgrade', (request, socket, head) => { terminals?.handleUpgrade(request, socket, head) })
    http.listen(0, '127.0.0.1')
    await once(http, 'listening')
    const port = (http.address() as AddressInfo).port
    const socket = new WebSocket(`ws://127.0.0.1:${port}/terminal`)
    await bounded(once(socket, 'open'), 'socket open')

    const ready = nextMessage(socket)
    socket.send(JSON.stringify({ type: 'start', workspaceId: 'workspace-1', cols: 90, rows: 28 }))
    await expect(bounded(ready, 'ready frame')).resolves.toEqual(expect.objectContaining({ type: 'ready' }))
    expect(pty.hasDataListener()).toBe(true)
    expect(logger.warn).not.toHaveBeenCalled()

    const output = nextMessage(socket)
    pty.emitData('\u001b[34mhello\u001b[0m')
    await expect(bounded(output, 'output frame')).resolves.toEqual({ type: 'data', data: '\u001b[34mhello\u001b[0m' })

    socket.send(JSON.stringify({ type: 'input', data: 'pwd\r' }))
    socket.send(JSON.stringify({ type: 'resize', cols: 120, rows: 36 }))
    await vi.waitFor(() => {
      expect(pty.write).toHaveBeenCalledWith('pwd\r')
      expect(pty.resize).toHaveBeenCalledWith(120, 36)
    })

    const exited = nextMessage(socket)
    pty.emitExit(0)
    await expect(bounded(exited, 'exit frame')).resolves.toEqual({ type: 'exit', exitCode: 0 })
    await vi.waitFor(() => { expect(socket.readyState).toBe(WebSocket.CLOSED) })
  })

  it('拒绝在 start 之前写入终端', async () => {
    const workspace = { rootProcessPath: vi.fn() } as unknown as WorkspaceBackend
    terminals = new TerminalSocketServer(workspace, { info: vi.fn(), warn: vi.fn() }, 1, () => new FakePty() as unknown as IPty)
    http = createServer()
    http.on('upgrade', (request, socket, head) => { terminals?.handleUpgrade(request, socket, head) })
    http.listen(0, '127.0.0.1')
    await once(http, 'listening')
    const socket = new WebSocket(`ws://127.0.0.1:${(http.address() as AddressInfo).port}/terminal`)
    await once(socket, 'open')

    const error = nextMessage(socket)
    socket.send(JSON.stringify({ type: 'input', data: 'whoami\r' }))
    await expect(error).resolves.toEqual(expect.objectContaining({ type: 'error', code: 'TERMINAL_NOT_READY' }))
    await once(socket, 'close')
    expect(workspace.rootProcessPath).not.toHaveBeenCalled()
  })
})

function nextMessage(socket: WebSocket): Promise<TerminalServerMessage> {
  return new Promise((resolve, reject) => {
    socket.once('message', data => {
      try { resolve(JSON.parse(data.toString()) as TerminalServerMessage) } catch (error) { reject(error) }
    })
    socket.once('error', reject)
  })
}

function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => { reject(new Error(`${label} timed out`)) }, 1000)
    }),
  ])
}

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
  emitExit(exitCode: number): void { this.exitListener?.({ exitCode }) }
  hasDataListener(): boolean { return this.dataListener !== undefined }
}
