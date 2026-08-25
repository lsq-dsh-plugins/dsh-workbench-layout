export type EditorLineEnding = '\n' | '\r\n' | '\r'

/** CodeMirror stores every line break as LF, so controlled comparisons use the same canonical form. */
export function normalizeEditorText(value: string): string {
  return value.replace(/\r\n|\r/gu, '\n')
}

/** Preserve the file's dominant line-ending style when a real editor change is written back. */
export function detectEditorLineEnding(value: string): EditorLineEnding {
  const crlf = value.match(/\r\n/gu)?.length ?? 0
  const cr = value.match(/\r(?!\n)/gu)?.length ?? 0
  const lf = value.match(/(?<!\r)\n/gu)?.length ?? 0
  if (crlf >= cr && crlf >= lf && crlf > 0) return '\r\n'
  if (cr >= lf && cr > 0) return '\r'
  return '\n'
}

export function restoreEditorLineEndings(value: string, lineEnding: EditorLineEnding): string {
  const normalized = normalizeEditorText(value)
  return lineEnding === '\n' ? normalized : normalized.replace(/\n/gu, lineEnding)
}
