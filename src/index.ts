/** Host half: trusted-origin workspace API backed by DSH filesystem and Session services. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-workspace'
import { WORKBENCH_API_PREFIX } from './contracts.ts'
import { GitBackend } from './git-backend.ts'
import { errorResponse, readJsonObject, sendJson, WorkbenchHttpError } from './http.ts'
import { isTrustedWorkbenchRequest } from './request-trust.ts'
import { TERMINAL_SOCKET_PATH } from './terminal-protocol.ts'
import { rejectTerminalUpgrade, TerminalSocketServer } from './terminal-websocket.ts'
import { WorkspaceBackend } from './workspace-backend.ts'

export const name = 'workbench-layout'
export const inject = ['webServer', 'fs', 'workspaceRegistry', 'webRuntime']

interface WebRuntimeValues {
  trustedHosts: string[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    webRuntime: WebRuntimeValues
  }
}

export interface Config {
  maxFileBytes: number
  maxDirectoryEntries: number
  gitTimeoutMs: number
  gitMaxOutputBytes: number
  maxTerminalConnections: number
}

export const Config: z<Config> = z.object({
  maxFileBytes: z.natural().min(1024).max(16 * 1024 * 1024).default(2 * 1024 * 1024),
  maxDirectoryEntries: z.natural().min(10).max(5000).default(1000),
  gitTimeoutMs: z.natural().min(1000).max(120_000).default(30_000),
  gitMaxOutputBytes: z.natural().min(64 * 1024).max(32 * 1024 * 1024).default(4 * 1024 * 1024),
  maxTerminalConnections: z.natural().min(1).max(32).default(8),
})

/** Register the workbench's isolated JSON endpoint. */
export function apply(ctx: Context, config: Config): void {
  const workspace = new WorkspaceBackend(ctx, config)
  const git = new GitBackend(ctx, workspace, {
    timeoutMs: config.gitTimeoutMs,
    maxOutputBytes: config.gitMaxOutputBytes,
  })
  const terminals = new TerminalSocketServer(workspace, ctx.logger, config.maxTerminalConnections)
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (req.method !== 'POST') throw new WorkbenchHttpError(405, 'METHOD_NOT_ALLOWED', '只允许 POST 请求。')
      if (!isTrustedWorkbenchRequest(req.headers, ctx.webRuntime.trustedHosts)) {
        throw new WorkbenchHttpError(403, 'ORIGIN_REJECTED', '请求来源无效。')
      }
      const body = await readJsonObject(req, config.maxFileBytes + 64 * 1024)
      const path = new URL(req.url ?? '/', 'http://dsh.invalid').pathname
      const value = await dispatch(path, body, workspace, git)
      sendJson(res, 200, value)
    } catch (error: unknown) {
      const response = errorResponse(error)
      if (response.status >= 500 || response.body.error.code === 'WORKBENCH_OPERATION_FAILED') {
        ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
      }
      sendJson(res, response.status, response.body)
    }
  }
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: WORKBENCH_API_PREFIX, handler }),
    'workbench-layout: workspace and Git route',
  )
  ctx.effect(() => ctx.webServer.registerUpgrade({
    path: TERMINAL_SOCKET_PATH,
    handler: (req, socket, head) => {
      if (!isTrustedWorkbenchRequest(req.headers, ctx.webRuntime.trustedHosts)) {
        rejectTerminalUpgrade(socket)
        return
      }
      terminals.handleUpgrade(req, socket, head)
    },
  }), 'workbench-layout: workspace terminal WebSocket')
  ctx.effect(() => () => terminals.close(), 'workbench-layout: workspace terminal lifecycle')
  ctx.logger.info('workbench-layout: workspace, Git, and terminal APIs registered')
}

async function dispatch(
  path: string,
  body: Record<string, unknown>,
  workspace: WorkspaceBackend,
  git: GitBackend,
): Promise<unknown> {
  switch (path) {
    case `${WORKBENCH_API_PREFIX}/tree`:
      return workspace.list(body.workspaceId, body.path)
    case `${WORKBENCH_API_PREFIX}/file/read`:
      return workspace.read(body.workspaceId, body.path)
    case `${WORKBENCH_API_PREFIX}/file/save`:
      return workspace.save(body.workspaceId, body.path, body.content, body.version)
    case `${WORKBENCH_API_PREFIX}/file/create`:
      return workspace.createFile(body.workspaceId, body.path)
    case `${WORKBENCH_API_PREFIX}/directory/create`:
      return workspace.createDirectory(body.workspaceId, body.path)
    case `${WORKBENCH_API_PREFIX}/git/status`:
      return git.status(body.workspaceId)
    case `${WORKBENCH_API_PREFIX}/git/diff`:
      return git.diff(body.workspaceId, body.path, body.staged)
    case `${WORKBENCH_API_PREFIX}/git/graph`:
      return git.graph(body.workspaceId)
    case `${WORKBENCH_API_PREFIX}/git/branches`:
      return git.branches(body.workspaceId)
    case `${WORKBENCH_API_PREFIX}/git/branch/switch`:
      return git.switchBranch(body.workspaceId, body.ref)
    case `${WORKBENCH_API_PREFIX}/git/remote`:
      return git.remoteOperation(body.workspaceId, body.operation)
    case `${WORKBENCH_API_PREFIX}/git/commit/files`:
      return git.commitFiles(body.workspaceId, body.revision)
    case `${WORKBENCH_API_PREFIX}/git/commit/file`:
      return git.commitFileDiff(body.workspaceId, body.revision, body.path)
    case `${WORKBENCH_API_PREFIX}/git/stage`:
      return git.stage(body.workspaceId, body.path)
    case `${WORKBENCH_API_PREFIX}/git/unstage`:
      return git.unstage(body.workspaceId, body.path)
    case `${WORKBENCH_API_PREFIX}/git/commit`:
      return git.commit(body.workspaceId, body.message)
    default:
      throw new WorkbenchHttpError(404, 'ENDPOINT_NOT_FOUND', '工作台接口不存在。')
  }
}
