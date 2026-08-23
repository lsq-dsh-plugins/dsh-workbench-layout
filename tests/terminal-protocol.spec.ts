import { describe, expect, it } from 'vitest'
import { parseTerminalClientMessage } from '../src/terminal-protocol.ts'

describe('终端消息协议', () => {
  it('接受有界的启动、输入和尺寸消息', () => {
    expect(parseTerminalClientMessage(JSON.stringify({
      type: 'start', workspaceId: 'workspace-1', cols: 100, rows: 30,
    }))).toEqual({ type: 'start', workspaceId: 'workspace-1', cols: 100, rows: 30 })
    expect(parseTerminalClientMessage(JSON.stringify({ type: 'input', data: 'ls\r' })))
      .toEqual({ type: 'input', data: 'ls\r' })
    expect(parseTerminalClientMessage(JSON.stringify({ type: 'resize', cols: 80, rows: 24 })))
      .toEqual({ type: 'resize', cols: 80, rows: 24 })
  })

  it('拒绝越界尺寸、超长输入和未知消息', () => {
    expect(() => parseTerminalClientMessage(JSON.stringify({
      type: 'start', workspaceId: 'workspace-1', cols: 1, rows: 24,
    }))).toThrow(/列数/u)
    expect(() => parseTerminalClientMessage(JSON.stringify({ type: 'input', data: 'x'.repeat(70_000) })))
      .toThrow(/过大/u)
    expect(() => parseTerminalClientMessage(JSON.stringify({ type: 'command', command: 'pwd' })))
      .toThrow(/类型/u)
  })
})
