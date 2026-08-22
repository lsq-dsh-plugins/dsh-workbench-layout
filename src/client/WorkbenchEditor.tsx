import { useEffect } from 'react'
import {
  Button,
  CodeBlock,
  FishLogo,
  IconCodeOutline16,
  IconEditOutline16,
  IconCheckOutline16,
  MarkdownText,
  Pill,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { UNSAVED_SWITCH_ERROR, type WorkbenchController } from './controller.ts'
import type { WorkbenchKey } from './locales.ts'
import { CodeEditor } from './CodeEditor.tsx'
import { useWorkbench } from './use-workbench.ts'
import css from './Workbench.module.css'

export type WorkbenchEditorProps = PropsRuntime<'details'> & PropsLocale<'workbench'> & {
  controller: WorkbenchController
}

/** Middle file surface, with Markdown preview as the default mode. */
export function WorkbenchEditor({ sessionId, controller, t }: WorkbenchEditorProps) {
  const state = useWorkbench(controller)
  useEffect(() => { controller.setSession(sessionId) }, [controller, sessionId])

  if (state.sessionId !== sessionId) return <EditorEmpty text={t('editor.loading')} />
  if (state.loading && state.file === null) return <EditorEmpty text={t('editor.loading')} />
  if (state.centerMode === 'diff' && state.diff !== null) {
    return (
      <section className={css.editorRoot} data-dsh-workbench-editor="">
        <header className={css.editorHeader}>
          <div className={css.editorTitle}>
            <IconCodeOutline16 size={16} />
            <span>{state.diff.path}</span>
            <Pill>{t('editor.diff')}</Pill>
          </div>
          <Button size="sm" variant="toolbar" onClick={() => { controller.showFile() }}>{t('editor.backToFile')}</Button>
        </header>
        <div className={css.diffBody}>
          <CodeBlock code={state.diff.text || 'No textual diff.'} lang="diff" copyLabel={t('editor.copy')} copiedLabel={t('editor.copied')} />
        </div>
        {state.error !== null && <div className={css.editorError} role="alert">{errorText(state.error, t)}</div>}
      </section>
    )
  }
  if (state.file === null) return <EditorEmpty text={state.error ?? t('editor.empty')} />

  const markdown = state.file.markdown
  return (
    <section className={css.editorRoot} data-dsh-workbench-editor="">
      <header className={css.editorHeader}>
        <div className={css.editorTitle} title={state.file.path}>
          <IconEditOutline16 size={16} />
          <span>{state.file.path}</span>
          {state.dirty && <Pill>{t('editor.unsaved')}</Pill>}
        </div>
        <div className={css.editorActions}>
          {markdown && (
            <div className={css.previewSwitch}>
              <button type="button" data-active={state.preview || undefined} onClick={() => { controller.setPreview(true) }}>{t('editor.preview')}</button>
              <button type="button" data-active={!state.preview || undefined} onClick={() => { controller.setPreview(false) }}>{t('editor.source')}</button>
            </div>
          )}
          {state.dirty && (
            <Button size="sm" variant="toolbar" onClick={() => { controller.revert() }}>{t('editor.revert')}</Button>
          )}
          <Button
            size="sm"
            variant="primary"
            icon={<IconCheckOutline16 size={16} />}
            disabled={!state.dirty || state.saving}
            onClick={() => { void controller.save() }}
          >
            {state.saving ? t('editor.saving') : t('editor.save')}
          </Button>
        </div>
      </header>
      {state.error !== null && <div className={css.editorError} role="alert">{errorText(state.error, t)}</div>}
      <div className={css.editorBody}>
        {markdown && state.preview
          ? <div className={css.markdownPreview}><MarkdownText text={state.draft} /></div>
          : (
            <CodeEditor
              key={state.file.path}
              value={state.draft}
              ariaLabel={state.file.path}
              onChange={value => { controller.setDraft(value) }}
              onSave={() => { void controller.save() }}
            />
          )}
      </div>
    </section>
  )
}

function errorText(error: string, t: WorkbenchEditorProps['t']): string {
  return error === UNSAVED_SWITCH_ERROR ? t('editor.unsavedSwitch') : error
}

function EditorEmpty({ text }: { text: string }) {
  return (
    <div className={css.editorEmpty} data-dsh-workbench-editor="">
      <FishLogo size={34} />
      <span>{text}</span>
    </div>
  )
}
