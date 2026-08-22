/** Small JSON transport for the workbench Host route. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WorkbenchErrorBody } from './contracts.ts'
import { WorkbenchInputError } from './path-policy.ts'

export class WorkbenchHttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
    this.name = 'WorkbenchHttpError'
  }
}

/** Read one bounded JSON object body. */
export async function readJsonObject(req: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const contentType = req.headers['content-type'] ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new WorkbenchHttpError(415, 'CONTENT_TYPE_REQUIRED', '请求必须使用 JSON。')
  }
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > maxBytes) throw new WorkbenchHttpError(413, 'REQUEST_TOO_LARGE', '请求内容过大。')
    chunks.push(buffer)
  }
  let value: unknown
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new WorkbenchHttpError(400, 'INVALID_JSON', '请求 JSON 无效。')
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new WorkbenchHttpError(400, 'INVALID_JSON', '请求必须是 JSON 对象。')
  }
  return value as Record<string, unknown>
}

/** Send a no-store JSON response. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
  })
  res.end(json)
}

/** Normalize expected input/HTTP failures without leaking Host paths or stacks. */
export function errorResponse(error: unknown): { status: number; body: WorkbenchErrorBody } {
  if (error instanceof WorkbenchHttpError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message } } }
  }
  if (error instanceof WorkbenchInputError) {
    return { status: 400, body: { error: { code: error.code, message: error.message } } }
  }
  const code = error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'WORKBENCH_OPERATION_FAILED'
  return {
    status: code === 'FS_STALE_VERSION' ? 409 : 400,
    body: { error: { code, message: publicFailureMessage(code) } },
  }
}

function publicFailureMessage(code: string): string {
  switch (code) {
    case 'FS_STALE_VERSION': return '文件已被其他程序修改，请重新加载后再保存。'
    case 'FS_TOO_LARGE': return '文件超过工作台允许的大小。'
    case 'FS_NOT_TEXT': return '该文件不是可编辑的 UTF-8 文本。'
    case 'FS_NOT_FOUND': return '文件或目录不存在。'
    case 'FS_PERMISSION_DENIED': return '没有权限访问该文件或目录。'
    default: return '工作台操作失败，请查看 DSH 日志。'
  }
}
