// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CodeEditor } from '../src/client/CodeEditor.tsx'
import { DiffSurface } from '../src/client/DiffSurface.tsx'

afterEach(() => { cleanup() })

describe('中栏长行自动换行', () => {
  it('为普通文件编辑器启用 CodeMirror 换行扩展', () => {
    const view = render(
      <CodeEditor value={'x'.repeat(500)} onChange={() => {}} ariaLabel="long-file.txt" />,
    )
    const host = view.container.firstElementChild
    expect(host).toBeInstanceOf(HTMLElement)
    expect((host as HTMLElement).className).not.toBe('')
    expect(view.container.querySelectorAll('.cm-lineWrapping')).toHaveLength(1)
  })

  it('把普通编辑器与 Markdown 预览约束在弹性中栏内', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/client/Workbench.module.css'), 'utf8')
    expect(stylesheet).toMatch(/\.editorBody\s*\{[^}]*min-width: 0[^}]*overflow: hidden/u)
    expect(stylesheet).toMatch(/\.codeEditorHost\s*\{[^}]*flex: 1[^}]*width: 100%[^}]*min-width: 0[^}]*overflow: hidden/u)
    expect(stylesheet).toMatch(/\.markdownPreview\s*\{[^}]*flex: 1[^}]*width: 100%[^}]*min-width: 0[^}]*overflow: auto/u)
  })

  it('为左右和行内 Diff 的每个 CodeMirror 面板启用换行扩展', () => {
    const split = render(
      <DiffSurface
        original={'a'.repeat(500)}
        modified={'b'.repeat(500)}
        originalLabel="before"
        modifiedLabel="after"
        mode="split"
      />,
    )
    expect(split.container.querySelectorAll('.cm-lineWrapping')).toHaveLength(2)
    split.unmount()

    const inline = render(
      <DiffSurface
        original={'a'.repeat(500)}
        modified={'b'.repeat(500)}
        originalLabel="before"
        modifiedLabel="after"
        mode="inline"
      />,
    )
    expect(inline.container.querySelectorAll('.cm-lineWrapping')).toHaveLength(1)
  })
})
