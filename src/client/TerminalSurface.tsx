/** xterm.js 终端画布与工作区 WebSocket 生命周期。 */

import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal, type ITheme } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  TERMINAL_SOCKET_PATH,
  type TerminalClientMessage,
  type TerminalServerMessage,
} from '../terminal-protocol.ts'
import type { WorkbenchController, WorkbenchTerminalTab } from './controller.ts'
import type { WorkbenchKey } from './locales.ts'
import {
  EDITOR_TRANSITION_END_EVENT,
  EDITOR_TRANSITION_START_EVENT,
  isEditorTrackExpanded,
  isEditorTrackTransitioning,
} from './editor-layout-contract.ts'
import css from './Workbench.module.css'

export interface TerminalSurfaceProps {
  tab: WorkbenchTerminalTab
  workspaceId: string
  active: boolean
  controller: WorkbenchController
  t: TranslateNS<'workbench'>
}

/** Keep one terminal mounted while its tab exists so switching files never kills its PTY. */
export function TerminalSurface({ tab, workspaceId, active, controller, t }: TerminalSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const fitWhenStableRef = useRef<(() => void) | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    let disposed = false
    let ended = false
    let ready = false
    const terminal = new Terminal({
      allowTransparency: false,
      cursorBlink: true,
      cursorInactiveStyle: 'outline',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      lineHeight: 1.32,
      linkHandler: null,
      scrollback: 5000,
      theme: terminalTheme(host),
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host)
    terminalRef.current = terminal
    fitRef.current = fit
    let editorTransitionActive = isEditorTrackTransitioning(host)
    let fitPending = editorTransitionActive || !isEditorTrackExpanded(host)
    const fitWhenStable = (): void => {
      if (editorTransitionActive || isEditorTrackTransitioning(host) || !isEditorTrackExpanded(host)) {
        fitPending = true
        return
      }
      fitPending = false
      fitVisible(host, fit)
    }
    fitWhenStableRef.current = fitWhenStable
    fitWhenStable()

    const socket = new WebSocket(terminalSocketUrl())
    const send = (message: TerminalClientMessage): void => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
    }
    const input = terminal.onData(data => {
      if (ready) send({ type: 'input', data })
    })
    const resize = terminal.onResize(({ cols, rows }) => {
      if (ready) send({ type: 'resize', cols, rows })
    })
    socket.addEventListener('open', () => {
      fitWhenStable()
      send({ type: 'start', workspaceId, cols: terminal.cols, rows: terminal.rows })
    })
    socket.addEventListener('message', (event) => {
      const message = parseTerminalServerMessage(event.data)
      if (message === undefined) return
      switch (message.type) {
        case 'ready':
          ready = true
          controller.terminalReady(tab.id, message.shell)
          if (activeRef.current) terminal.focus()
          break
        case 'data':
          terminal.write(message.data)
          break
        case 'exit':
          ended = true
          terminal.write(`\r\n\x1b[2m${t('terminal.exitMessage', { code: String(message.exitCode) })}\x1b[0m\r\n`)
          controller.terminalExited(tab.id, message.exitCode, message.signal)
          break
        case 'error':
          ended = true
          controller.terminalFailed(tab.id, message.message)
          break
      }
    })
    socket.addEventListener('close', () => {
      if (!disposed && !ended) controller.terminalFailed(tab.id, t('terminal.disconnected'))
    })
    socket.addEventListener('error', () => {
      if (!disposed && !ended) {
        ended = true
        controller.terminalFailed(tab.id, t('terminal.disconnected'))
      }
    })

    const onEditorTransitionStart = (event: Event): void => {
      if (!(event.target instanceof HTMLElement) || !event.target.contains(host)) return
      editorTransitionActive = true
      fitPending = true
    }
    const onEditorTransitionEnd = (event: Event): void => {
      if (!(event.target instanceof HTMLElement) || !event.target.contains(host)) return
      editorTransitionActive = false
      if (activeRef.current && fitPending) fitWhenStable()
    }
    document.addEventListener(EDITOR_TRANSITION_START_EVENT, onEditorTransitionStart)
    document.addEventListener(EDITOR_TRANSITION_END_EVENT, onEditorTransitionEnd)
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => { if (activeRef.current) fitWhenStable() })
    resizeObserver?.observe(host)
    const themeObserver = new MutationObserver(() => { terminal.options.theme = terminalTheme(host) })
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'style'] })

    return () => {
      disposed = true
      input.dispose()
      resize.dispose()
      resizeObserver?.disconnect()
      themeObserver.disconnect()
      document.removeEventListener(EDITOR_TRANSITION_START_EVENT, onEditorTransitionStart)
      document.removeEventListener(EDITOR_TRANSITION_END_EVENT, onEditorTransitionEnd)
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, 'terminal tab closed')
      }
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
      if (fitWhenStableRef.current === fitWhenStable) fitWhenStableRef.current = null
    }
  }, [controller, tab.generation, tab.id, workspaceId])

  useEffect(() => {
    const host = hostRef.current
    const terminal = terminalRef.current
    const fit = fitRef.current
    if (!active || host === null || terminal === null || fit === null) return
    fitWhenStableRef.current?.()
    terminal.focus()
  }, [active])

  const terminalMessage = tab.status === 'error'
    ? tab.error ?? t('terminal.failed')
    : tab.status === 'exited'
      ? t('terminal.exitMessage', { code: String(tab.exitCode ?? 0) })
      : undefined
  return (
    <div className={css.terminalSurface} data-dsh-workbench-terminal="">
      <div ref={hostRef} className={css.terminalViewport} aria-label={t('terminal.name', { index: String(tab.sequence) })} />
      {terminalMessage !== undefined && (
        <div className={css.terminalEnded} role="status">
          <span>{terminalMessage}</span>
          <Button size="sm" variant="outline" onClick={() => { controller.restartTerminal(tab.id) }}>
            {t('terminal.restart')}
          </Button>
        </div>
      )}
    </div>
  )
}

function terminalSocketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}${TERMINAL_SOCKET_PATH}`
}

function parseTerminalServerMessage(value: unknown): TerminalServerMessage | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const message = JSON.parse(value) as Record<string, unknown>
    if (message.type === 'ready' && typeof message.shell === 'string') return { type: 'ready', shell: message.shell }
    if (message.type === 'data' && typeof message.data === 'string') return { type: 'data', data: message.data }
    if (message.type === 'exit' && typeof message.exitCode === 'number') {
      return {
        type: 'exit',
        exitCode: message.exitCode,
        ...(typeof message.signal === 'number' ? { signal: message.signal } : {}),
      }
    }
    if (message.type === 'error' && typeof message.code === 'string' && typeof message.message === 'string') {
      return { type: 'error', code: message.code, message: message.message }
    }
  } catch {
    return undefined
  }
  return undefined
}

function fitVisible(host: HTMLElement, fit: FitAddon): void {
  if (host.clientWidth <= 0 || host.clientHeight <= 0) return
  try { fit.fit() } catch { /* The host may be between AppFrame track transitions. */ }
}

function terminalTheme(host: HTMLElement): ITheme {
  const style = getComputedStyle(host)
  const color = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback
  return {
    background: color('--dsw-alias-bg-base', '#ffffff'),
    foreground: color('--dsw-alias-label-primary', '#1f2329'),
    cursor: color('--dsw-alias-state-business-primary', '#4d7cff'),
    cursorAccent: color('--dsw-alias-bg-base', '#ffffff'),
    selectionBackground: color('--dsw-alias-interactive-bg-active', '#dbe7ff'),
    black: color('--dsw-static-gray-1000', '#1f2329'),
    red: color('--dsw-alias-state-error-primary', '#d92d20'),
    green: color('--dsw-static-green-600', '#16a34a'),
    yellow: color('--dsw-static-yellow-600', '#ca8a04'),
    blue: color('--dsw-alias-state-business-primary', '#4d7cff'),
    magenta: color('--dsw-static-purple-600', '#9333ea'),
    cyan: color('--dsw-static-cyan-600', '#0891b2'),
    white: color('--dsw-static-gray-100', '#f5f6f7'),
    brightBlack: color('--dsw-alias-label-tertiary', '#8f959e'),
    brightRed: color('--dsw-alias-state-error-secondary', '#f04438'),
    brightGreen: color('--dsw-static-green-400', '#4ade80'),
    brightYellow: color('--dsw-static-yellow-400', '#facc15'),
    brightBlue: color('--dsw-alias-brand-primary', '#6b8cff'),
    brightMagenta: color('--dsw-static-purple-400', '#c084fc'),
    brightCyan: color('--dsw-static-cyan-400', '#22d3ee'),
    brightWhite: color('--dsw-alias-label-primary', '#ffffff'),
  }
}
