// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EDITOR_COLLAPSED_ATTRIBUTE,
  EDITOR_TRANSITION_ATTRIBUTE,
  EDITOR_TRANSITION_END_EVENT,
  EDITOR_TRANSITION_START_EVENT,
  FRAME_ATTRIBUTE,
} from '../src/client/editor-layout-contract.ts'
import { zh } from '../src/client/locales.ts'
import { TerminalSurface } from '../src/client/TerminalSurface.tsx'

const terminalHarness = vi.hoisted(() => ({
  instances: [] as Array<{
    write: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    emitData(data: string): void
  }>,
  fitInstances: [] as Array<{ fit: ReturnType<typeof vi.fn> }>,
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    readonly cols = 80
    readonly rows = 24
    readonly options: Record<string, unknown> = {}
    readonly write = vi.fn()
    readonly focus = vi.fn()
    readonly dispose = vi.fn()
    private dataListener: ((data: string) => void) | undefined
    constructor() { terminalHarness.instances.push(this) }
    loadAddon() {}
    open() {}
    onData(listener: (data: string) => void) {
      this.dataListener = listener
      return { dispose: vi.fn() }
    }
    onResize() { return { dispose: vi.fn() } }
    emitData(data: string) { this.dataListener?.(data) }
  },
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    readonly fit = vi.fn()
    constructor() { terminalHarness.fitInstances.push(this) }
  },
}))
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, size: _size, variant: _variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) => <button {...props}>{children}</button>,
}))

beforeEach(() => {
  terminalHarness.instances.length = 0
  terminalHarness.fitInstances.length = 0
  FakeWebSocket.instances.length = 0
  FakeResizeObserver.instances.length = 0
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('中栏终端画布', () => {
  it('通过工作区 WebSocket 发送启动和输入，并渲染服务端输出', () => {
    const controller = controllerFake()
    const view = render(
      <TerminalSurface
        tab={{ id: 'terminal:1', kind: 'terminal', sequence: 1, generation: 0, status: 'connecting', error: null }}
        workspaceId="workspace-1"
        active
        controller={controller as never}
        t={translate}
      />,
    )
    const socket = FakeWebSocket.instances[0]!
    const terminal = terminalHarness.instances[0]!

    act(() => { socket.open() })
    expect(JSON.parse(socket.sent[0]!)).toEqual({
      type: 'start', workspaceId: 'workspace-1', cols: 80, rows: 24,
    })
    act(() => { socket.message({ type: 'ready', shell: 'zsh' }) })
    expect(controller.terminalReady).toHaveBeenCalledWith('terminal:1', 'zsh')
    act(() => { terminal.emitData('pwd\r') })
    expect(JSON.parse(socket.sent[1]!)).toEqual({ type: 'input', data: 'pwd\r' })
    act(() => { socket.message({ type: 'data', data: '\u001b[32mready\u001b[0m' }) })
    expect(terminal.write).toHaveBeenCalledWith('\u001b[32mready\u001b[0m')

    act(() => { socket.message({ type: 'exit', exitCode: 0 }) })
    expect(controller.terminalExited).toHaveBeenCalledWith('terminal:1', 0, undefined)
    view.unmount()
    expect(socket.close).toHaveBeenCalled()
    expect(terminal.dispose).toHaveBeenCalled()
  })

  it('为失败或退出的终端提供原位重启入口', () => {
    const controller = controllerFake()
    const view = render(
      <TerminalSurface
        tab={{ id: 'terminal:2', kind: 'terminal', sequence: 2, generation: 0, status: 'error', error: '启动失败' }}
        workspaceId="workspace-1"
        active
        controller={controller as never}
        t={translate}
      />,
    )
    fireEvent.click(view.getByRole('button', { name: '重新启动' }))
    expect(controller.restartTerminal).toHaveBeenCalledWith('terminal:2')
  })

  it('中栏显隐过渡期间冻结网格，并在稳定端点只适配一次', () => {
    const frame = document.createElement('div')
    frame.setAttribute(FRAME_ATTRIBUTE, '')
    const container = document.createElement('div')
    frame.appendChild(container)
    document.body.appendChild(frame)
    render(
      <TerminalSurface
        tab={{ id: 'terminal:3', kind: 'terminal', sequence: 3, generation: 0, status: 'running', error: null }}
        workspaceId="workspace-1"
        active
        controller={controllerFake() as never}
        t={translate}
      />,
      { container },
    )
    const fit = terminalHarness.fitInstances[0]!.fit
    const resizeObserver = FakeResizeObserver.instances[0]!
    const fitsBeforeTransition = fit.mock.calls.length

    act(() => { frame.dispatchEvent(new CustomEvent(EDITOR_TRANSITION_START_EVENT, { bubbles: true })) })
    frame.setAttribute(EDITOR_COLLAPSED_ATTRIBUTE, '')
    act(() => { resizeObserver.trigger() })
    act(() => { resizeObserver.trigger() })
    expect(fit).toHaveBeenCalledTimes(fitsBeforeTransition)

    act(() => { frame.dispatchEvent(new CustomEvent(EDITOR_TRANSITION_END_EVENT, {
      bubbles: true,
      detail: { expanded: false },
    })) })
    expect(fit).toHaveBeenCalledTimes(fitsBeforeTransition)

    act(() => { frame.dispatchEvent(new CustomEvent(EDITOR_TRANSITION_START_EVENT, { bubbles: true })) })
    frame.removeAttribute(EDITOR_COLLAPSED_ATTRIBUTE)
    act(() => { resizeObserver.trigger() })
    act(() => { frame.dispatchEvent(new CustomEvent(EDITOR_TRANSITION_END_EVENT, {
      bubbles: true,
      detail: { expanded: true },
    })) })
    expect(fit).toHaveBeenCalledTimes(fitsBeforeTransition + 1)
  })

  it('终端在过渡中挂载时等待最终展开宽度', () => {
    const frame = document.createElement('div')
    frame.setAttribute(FRAME_ATTRIBUTE, '')
    frame.setAttribute(EDITOR_TRANSITION_ATTRIBUTE, '')
    const container = document.createElement('div')
    frame.appendChild(container)
    document.body.appendChild(frame)
    render(
      <TerminalSurface
        tab={{ id: 'terminal:4', kind: 'terminal', sequence: 4, generation: 0, status: 'running', error: null }}
        workspaceId="workspace-1"
        active
        controller={controllerFake() as never}
        t={translate}
      />,
      { container },
    )
    const fit = terminalHarness.fitInstances[0]!.fit
    expect(fit).not.toHaveBeenCalled()

    frame.removeAttribute(EDITOR_TRANSITION_ATTRIBUTE)
    act(() => { frame.dispatchEvent(new CustomEvent(EDITOR_TRANSITION_END_EVENT, {
      bubbles: true,
      detail: { expanded: true },
    })) })
    expect(fit).toHaveBeenCalledOnce()
  })
})

function controllerFake() {
  return {
    terminalReady: vi.fn(),
    terminalExited: vi.fn(),
    terminalFailed: vi.fn(),
    restartTerminal: vi.fn(),
  }
}

function translate(key: keyof typeof zh, values?: Record<string, string>): string {
  const template = zh[key]
  if (values === undefined) return template
  return Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), template)
}

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static readonly instances: FakeWebSocket[] = []
  readonly sent: string[] = []
  readonly close = vi.fn(() => { this.readyState = FakeWebSocket.CLOSED })
  readyState = FakeWebSocket.CONNECTING
  constructor(readonly url: string) {
    super()
    FakeWebSocket.instances.push(this)
  }
  send(data: string): void { this.sent.push(data) }
  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }
  message(value: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }))
  }
}

class FakeResizeObserver {
  static readonly instances: FakeResizeObserver[] = []
  readonly observe = vi.fn()
  readonly disconnect = vi.fn()
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this)
  }
  trigger(): void {
    this.callback([], this as unknown as ResizeObserver)
  }
}
