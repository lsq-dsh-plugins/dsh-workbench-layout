/** 双向 WebSocket 与工作区 PTY 之间的有界桥接。 */

import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import WebSocket, { WebSocketServer } from 'ws'
import type { WorkspaceBackend } from './workspace-backend.ts'
import { WorkspaceTerminal, type TerminalBackendLogger, type TerminalPtySpawner } from './terminal-backend.ts'
import {
  parseTerminalClientMessage,
  TERMINAL_MAX_INPUT_CHARS,
  type TerminalServerMessage,
  TerminalProtocolError,
} from './terminal-protocol.ts'

const START_TIMEOUT_MS = 10_000
const OUTPUT_PAUSE_BYTES = 1024 * 1024
const OUTPUT_RESUME_BYTES = 256 * 1024

/** Reject an upgrade before WebSocket negotiation. */
export function rejectTerminalUpgrade(socket: Duplex): void {
  socket.end([
    'HTTP/1.1 403 Forbidden',
    'Connection: close',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Length: 9',
    '',
    'forbidden',
  ].join('\r\n'))
}

/** Own all browser terminal sockets and enforce a process-count ceiling. */
export class TerminalSocketServer {
  private readonly server = new WebSocketServer({ noServer: true, maxPayload: TERMINAL_MAX_INPUT_CHARS })
  private readonly connections = new Set<TerminalSocketConnection>()

  constructor(
    private readonly workspace: WorkspaceBackend,
    private readonly logger: TerminalBackendLogger,
    private readonly maxConnections: number,
    private readonly spawnPty?: TerminalPtySpawner,
  ) {}

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.server.handleUpgrade(req, socket, head, (websocket) => {
      if (this.connections.size >= this.maxConnections) {
        websocket.close(1013, 'terminal limit reached')
        return
      }
      const connection = new TerminalSocketConnection(
        websocket,
        this.workspace,
        this.logger,
        () => { this.connections.delete(connection) },
        this.spawnPty,
      )
      this.connections.add(connection)
    })
  }

  async close(): Promise<void> {
    for (const connection of this.connections) connection.dispose()
    this.connections.clear()
    for (const socket of this.server.clients) socket.terminate()
    await new Promise<void>((resolve, reject) => {
      this.server.close(error => { if (error === undefined) resolve(); else reject(error) })
    })
  }
}

class TerminalSocketConnection {
  private readonly terminal: WorkspaceTerminal
  private readonly startTimer: ReturnType<typeof setTimeout>
  private started = false
  private ready = false
  private disposed = false
  private outputPaused = false

  constructor(
    private readonly socket: WebSocket,
    workspace: WorkspaceBackend,
    private readonly logger: TerminalBackendLogger,
    private readonly onDispose: () => void,
    spawnPty?: TerminalPtySpawner,
  ) {
    this.terminal = new WorkspaceTerminal(workspace, {
      ready: shell => {
        this.ready = true
        this.send({ type: 'ready', shell })
      },
      data: data => { this.send({ type: 'data', data }) },
      exit: (exitCode, signal) => {
        this.send({ type: 'exit', exitCode, ...(signal === undefined ? {} : { signal }) }, () => {
          if (this.socket.readyState === WebSocket.OPEN) this.socket.close(1000, 'terminal exited')
        })
      },
    }, logger, spawnPty)
    this.startTimer = setTimeout(() => {
      this.fail('TERMINAL_START_TIMEOUT', '终端启动超时。', 1008)
    }, START_TIMEOUT_MS)
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        this.fail('TERMINAL_MESSAGE_INVALID', '终端不接受二进制消息。', 1003)
        return
      }
      void this.receive(data.toString())
    })
    socket.once('close', () => { this.dispose() })
    socket.once('error', (error) => {
      logger.warn(error)
      this.dispose()
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    clearTimeout(this.startTimer)
    this.terminal.dispose()
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close(1001, 'terminal disposed')
    }
    this.onDispose()
  }

  private async receive(raw: string): Promise<void> {
    if (this.disposed) return
    try {
      const message = parseTerminalClientMessage(raw)
      if (message.type === 'start') {
        if (this.started) throw new TerminalProtocolError('TERMINAL_ALREADY_STARTED', '终端已经启动。')
        this.started = true
        clearTimeout(this.startTimer)
        await this.terminal.start(message.workspaceId, message.cols, message.rows)
        return
      }
      if (!this.ready) throw new TerminalProtocolError('TERMINAL_NOT_READY', '终端尚未就绪。')
      if (message.type === 'input') this.terminal.write(message.data)
      else this.terminal.resize(message.cols, message.rows)
    } catch (error: unknown) {
      const protocol = error instanceof TerminalProtocolError
      this.logger.warn(error instanceof Error ? error : new Error(String(error)))
      this.fail(
        protocol ? error.code : 'TERMINAL_START_FAILED',
        protocol ? error.message : '终端启动失败。',
        protocol ? 1008 : 1011,
      )
    }
  }

  private send(message: TerminalServerMessage, afterSend?: () => void): void {
    if (this.disposed || this.socket.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify(message), (error) => {
      if (error != null) {
        this.logger.warn(error)
        this.dispose()
        return
      }
      if (this.outputPaused && this.socket.bufferedAmount <= OUTPUT_RESUME_BYTES) {
        this.outputPaused = false
        this.terminal.setOutputPaused(false)
      }
      afterSend?.()
    })
    if (!this.outputPaused && this.socket.bufferedAmount >= OUTPUT_PAUSE_BYTES) {
      this.outputPaused = true
      this.terminal.setOutputPaused(true)
    }
  }

  private fail(code: string, message: string, closeCode: number): void {
    this.send({ type: 'error', code, message }, () => {
      if (this.socket.readyState === WebSocket.OPEN) this.socket.close(closeCode, code)
    })
  }
}
