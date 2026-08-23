import { useEffect, useState } from 'react'
import { Button, FishLogo, MarkdownText, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchController } from './controller.ts'
import { CodeEditor } from './CodeEditor.tsx'
import { EditorTabs } from './EditorTabs.tsx'
import { GitDiffEditor } from './GitDiffEditor.tsx'
import { useWorkbench } from './use-workbench.ts'
import { resolveWorkbenchWorkspaceId } from './workspace-binding.ts'
import css from './Workbench.module.css'

export type WorkbenchEditorProps = PropsRuntime<'details'> & PropsLocale<'workbench'> & {
  controller: WorkbenchController
  activateWorkspace: (workspaceId: string | undefined) => void
}

/** Middle multi-file surface, with Markdown preview as the default mode. */
export function WorkbenchEditor({ sessionId, useWorkspaces, controller, activateWorkspace, t }: WorkbenchEditorProps) {
  const state = useWorkbench(controller)
  const [pendingClose, setPendingClose] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const workspaceId = useWorkspaces(snapshot => resolveWorkbenchWorkspaceId(
    snapshot.items,
    sessionId,
    snapshot.recentWorkspaceId,
  ))
  const tab = state.tabs.find(candidate => candidate.path === state.activeFilePath)
  const closeTab = pendingClose === null ? undefined : state.tabs.find(candidate => candidate.path === pendingClose)

  useEffect(() => { activateWorkspace(workspaceId) }, [activateWorkspace, workspaceId])
  useEffect(() => {
    if (pendingClose !== null && (closeTab === undefined || (!closeTab.dirty && !closeTab.saving))) {
      setPendingClose(null)
    }
  }, [closeTab, pendingClose])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') return
      const snapshot = controller.store.getSnapshot()
      const current = snapshot.tabs.find(candidate => candidate.path === snapshot.activeFilePath)
      if (current?.file === null || current === undefined) return
      event.preventDefault()
      void controller.save(current.path)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [controller])

  if (workspaceId === undefined) return <EditorEmpty text={t('editor.emptyWorkspace')} />
  if (state.workspaceId !== workspaceId) return <EditorEmpty text={t('editor.loading')} />
  if (state.centerMode === 'diff') {
    if (state.loading || state.diff === null) return <EditorEmpty text={state.error ?? t('editor.loading')} />
    return (
      <GitDiffEditor
        diff={state.diff}
        error={state.error}
        viewMode={state.diffViewMode}
        onViewModeChange={mode => { controller.setDiffViewMode(mode) }}
        onBack={() => { controller.showFile() }}
        t={t}
      />
    )
  }
  if (state.tabs.length === 0 || tab === undefined) return <EditorEmpty text={t('editor.empty')} />

  const requestClose = (path: string): void => {
    const target = state.tabs.find(candidate => candidate.path === path)
    if (target?.dirty === true) {
      controller.selectFile(path)
      setPendingClose(path)
      return
    }
    controller.closeFile(path)
  }
  const saveAndClose = async (): Promise<void> => {
    if (pendingClose === null) return
    setClosing(true)
    const saved = await controller.save(pendingClose)
    if (saved && controller.closeFile(pendingClose)) setPendingClose(null)
    setClosing(false)
  }
  const discardAndClose = (): void => {
    if (pendingClose !== null) controller.closeFile(pendingClose, true)
    setPendingClose(null)
  }

  return (
    <section className={css.editorRoot} data-dsh-workbench-editor="">
      <header className={css.editorHeader}>
        <EditorTabs
          tabs={state.tabs}
          activePath={state.activeFilePath}
          onSelect={path => { controller.selectFile(path) }}
          onClose={requestClose}
          t={t}
        />
        {tab.file !== null && (
          <div className={css.editorActions}>
            {tab.file.markdown && (
              <div className={css.previewSwitch}>
                <button type="button" data-active={tab.preview || undefined} onClick={() => { controller.setPreview(true) }}>{t('editor.preview')}</button>
                <button type="button" data-active={!tab.preview || undefined} onClick={() => { controller.setPreview(false) }}>{t('editor.source')}</button>
              </div>
            )}
            {tab.dirty && (
              <Button size="sm" variant="toolbar" onClick={() => { controller.revert() }}>{t('editor.revert')}</Button>
            )}
          </div>
        )}
      </header>
      {tab.error !== null && <div className={css.editorError} role="alert">{tab.error}</div>}
      <div className={css.editorBody}>
        {tab.loading || tab.file === null
          ? <EditorEmpty text={tab.error ?? t('editor.loading')} />
          : tab.file.markdown && tab.preview
            ? <div className={css.markdownPreview}><MarkdownText text={tab.draft} /></div>
            : (
              <CodeEditor
                key={tab.path}
                value={tab.draft}
                ariaLabel={tab.path}
                onChange={value => { controller.setDraft(value) }}
              />
            )}
      </div>
      <Modal
        open={closeTab !== undefined}
        onClose={() => { if (!closing) setPendingClose(null) }}
        closeLabel={t('editor.cancelClose')}
        title={t('editor.closeUnsavedTitle')}
        {...closeTab === undefined
          ? {}
          : { description: t('editor.closeUnsavedDescription', { path: closeTab.path }) }}
        footer={(
          <>
            <Button variant="outline" disabled={closing} onClick={() => { setPendingClose(null) }}>{t('editor.cancelClose')}</Button>
            <Button variant="outline" className={css.discardAction} disabled={closing} onClick={discardAndClose}>{t('editor.discardClose')}</Button>
            <Button variant="primary" disabled={closing} onClick={() => { void saveAndClose() }}>
              {closing ? t('editor.saving') : t('editor.saveClose')}
            </Button>
          </>
        )}
      >
        {closeTab?.error !== null && closeTab?.error !== undefined && (
          <div className={css.editorModalError} role="alert">{closeTab.error}</div>
        )}
      </Modal>
    </section>
  )
}

function EditorEmpty({ text }: { text: string }) {
  return (
    <div className={css.editorEmpty} data-dsh-workbench-editor="">
      <FishLogo size={34} />
      <span>{text}</span>
    </div>
  )
}
