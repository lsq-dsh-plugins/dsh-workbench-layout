/** 工作区终端 WebSocket 的有界消息协议。 */

import { WORKBENCH_API_PREFIX } from './contracts.ts'

export const TERMINAL_SOCKET_PATH = `${WORKBENCH_API_PREFIX}/terminal`
export const TERMINAL_MAX_INPUT_CHARS = 64 * 1024
export const TERMINAL_MIN_COLS = 2
export const TERMINAL_MAX_COLS = 500
export const TERMINAL_MIN_ROWS = 1
export const TERMINAL_MAX_ROWS = 200

export type TerminalClientMessage =
  | { type: 'start'; workspaceId: string; cols: number; rows: number }
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }

export type TerminalServerMessage =
  | { type: 'ready'; shell: string }
  | { type: 'data'; data: string }
  | { type: 'exit'; exitCode: number; signal?: number }
  | { type: 'error'; code: string; message: string }

export class TerminalProtocolError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'TerminalProtocolError'
  }
}

/** Parse and validate one client frame before it reaches the PTY. */
export function parseTerminalClientMessage(raw: string): TerminalClientMessage {
  if (raw.length > TERMINAL_MAX_INPUT_CHARS) {
    throw new TerminalProtocolError('TERMINAL_MESSAGE_TOO_LARGE', '终端消息过大。')
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new TerminalProtocolError('TERMINAL_MESSAGE_INVALID', '终端消息格式无效。')
  }
  if (value === null || typeof value !== 'object') {
    throw new TerminalProtocolError('TERMINAL_MESSAGE_INVALID', '终端消息格式无效。')
  }
  const record = value as Record<string, unknown>
  if (record.type === 'start') {
    if (typeof record.workspaceId !== 'string' || record.workspaceId === '' || record.workspaceId.length > 512) {
      throw new TerminalProtocolError('WORKSPACE_REQUIRED', '缺少当前工作区。')
    }
    return {
      type: 'start',
      workspaceId: record.workspaceId,
      cols: terminalDimension(record.cols, '列数', TERMINAL_MIN_COLS, TERMINAL_MAX_COLS),
      rows: terminalDimension(record.rows, '行数', TERMINAL_MIN_ROWS, TERMINAL_MAX_ROWS),
    }
  }
  if (record.type === 'input') {
    if (typeof record.data !== 'string' || record.data.length > TERMINAL_MAX_INPUT_CHARS) {
      throw new TerminalProtocolError('TERMINAL_INPUT_INVALID', '终端输入无效。')
    }
    return { type: 'input', data: record.data }
  }
  if (record.type === 'resize') {
    return {
      type: 'resize',
      cols: terminalDimension(record.cols, '列数', TERMINAL_MIN_COLS, TERMINAL_MAX_COLS),
      rows: terminalDimension(record.rows, '行数', TERMINAL_MIN_ROWS, TERMINAL_MAX_ROWS),
    }
  }
  throw new TerminalProtocolError('TERMINAL_MESSAGE_INVALID', '终端消息类型无效。')
}

function terminalDimension(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value < min || value > max) {
    throw new TerminalProtocolError('TERMINAL_SIZE_INVALID', `终端${label}无效。`)
  }
  return value
}
