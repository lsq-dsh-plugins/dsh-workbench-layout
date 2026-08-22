/** Workspace-relative path validation shared by Host operations and tests. */

/**
 * Accept the browser's slash-delimited relative path form.
 * Empty identifies the workspace root; absolute paths, traversal, empty
 * segments, backslashes, and NUL are rejected before reaching a filesystem.
 */
export function normalizeWorkspacePath(input: unknown): string {
  if (typeof input !== 'string') throw new WorkbenchInputError('INVALID_PATH', '路径必须是字符串。')
  if (input === '') return ''
  if (input.startsWith('/') || input.includes('\\') || input.includes('\0')) {
    throw new WorkbenchInputError('INVALID_PATH', '只能使用工作区内的相对路径。')
  }
  const segments = input.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new WorkbenchInputError('INVALID_PATH', '路径包含无效片段。')
  }
  return segments.join('/')
}

/** Join one trusted directory path and one filesystem-provided entry name. */
export function childWorkspacePath(parent: string, name: string): string {
  if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new WorkbenchInputError('INVALID_ENTRY', '文件名无法安全显示。')
  }
  return parent === '' ? name : `${parent}/${name}`
}

/** Stable client-facing validation error. */
export class WorkbenchInputError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'WorkbenchInputError'
  }
}
