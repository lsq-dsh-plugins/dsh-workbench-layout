import { useEffect, useMemo, useState } from 'react'
import { Button, FishLogo, MarkdownText, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchController } from './controller.ts'
import { CodeEditor } from './CodeEditor.tsx'
import { EditorTabs } from './EditorTabs.tsx'
import { GitDiffEditor } from './GitDiffEditor.tsx'
import { TerminalSurface } from './TerminalSurface.tsx'
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
  const tab = state.tabs.find(candidate => candidate.id === state.activeTabId)
  const terminalTabs = state.tabs.filter(candidate => candidate.kind === 'terminal')
  const closeTab = pendingClose === null ? undefined : state.tabs.find(candidate => candidate.id === pendingClose)
  const baselineTabId = tab?.kind === 'file' && tab.file !== null && !tab.preview ? tab.id : undefined
  const baselineFileVersion = tab?.kind === 'file' ? tab.file?.version : undefined
  const baselineLineVersion = tab?.kind === 'file' ? state.gitLineVersions?.[tab.path] : undefined
  const gitLineLabels = useMemo(() => ({
    added: t('editor.gitAddedChange'),
    modified: t('editor.gitModifiedChange'),
    deleted: t('editor.gitDeletedChange'),
    before: t('editor.gitHeadVersion'),
    current: t('editor.gitCurrentVersion'),
    previous: t('editor.gitPreviousChange'),
    next: t('editor.gitNextChange'),
    revert: t('editor.gitRevertChange'),
    close: t('editor.gitClosePeek'),
    resizeWidth: t('editor.gitResizePeekWidth'),
  }), [t])

  useEffect(() => { activateWorkspace(workspaceId) }, [activateWorkspace, workspaceId])
  useEffect(() => {
    if (baselineTabId !== undefined) void controller.ensureGitBaseline(baselineTabId)
  }, [baselineFileVersion, baselineLineVersion, baselineTabId, controller, state.gitHead])
  useEffect(() => {
    if (pendingClose !== null && (closeTab?.kind !== 'file' || (!closeTab.dirty && !closeTab.saving))) {
      setPendingClose(null)
    }
  }, [closeTab, pendingClose])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') return
      const snapshot = controller.store.getSnapshot()
      const current = snapshot.tabs.find(candidate => candidate.id === snapshot.activeTabId)
      if (current?.kind !== 'file' || current.file === null) return
      event.preventDefault()
      void controller.save(current.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [controller])

  if (workspaceId === undefined) return <EditorEmpty text={t('editor.emptyWorkspace')} />
  if (state.workspaceId !== workspaceId) return <EditorEmpty text={t('editor.loading')} />
  if (state.tabs.length === 0 || tab === undefined) return <EditorEmpty text={t('editor.empty')} />

  const requestClose = (tabId: string): void => {
    const target = state.tabs.find(candidate => candidate.id === tabId)
    if (target?.kind === 'file' && target.dirty) {
      controller.selectTab(tabId)
      setPendingClose(tabId)
      return
    }
    controller.closeTab(tabId)
  }
  const saveAndClose = async (): Promise<void> => {
    if (pendingClose === null) return
    setClosing(true)
    const saved = await controller.save(pendingClose)
    if (saved && controller.closeTab(pendingClose)) setPendingClose(null)
    setClosing(false)
  }
  const discardAndClose = (): void => {
    if (pendingClose !== null) controller.closeTab(pendingClose, true)
    setPendingClose(null)
  }

  return (
    <section className={css.editorRoot} data-dsh-workbench-editor="">
      <header className={css.editorHeader}>
        <EditorTabs
          tabs={state.tabs}
          activeTabId={state.activeTabId}
          gitDecorations={state.gitDecorations}
          onSelect={tabId => { controller.selectTab(tabId) }}
          onClose={requestClose}
          t={t}
        />
        {tab.kind === 'file' && tab.file !== null && (
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
      {tab.kind !== 'terminal' && tab.error !== null && <div className={css.editorError} role="alert">{tab.error}</div>}
      {tab.kind === 'file' && tab.externalChange !== null && (
        <div className={css.editorExternalChange} role="status">
          <span>{tab.externalChange.kind === 'changed'
            ? t('editor.externalChanged')
            : t('editor.externalDeleted')}</span>
          <div className={css.editorExternalActions}>
            {tab.externalChange.kind === 'changed'
              ? (
                <>
                  <Button size="sm" variant="toolbar" onClick={() => { controller.reloadExternalFile(tab.id) }}>
                    {t('editor.reloadExternal')}
                  </Button>
                  <Button size="sm" variant="toolbar" onClick={() => { controller.keepCurrentDraft(tab.id) }}>
                    {t('editor.keepCurrent')}
                  </Button>
                </>
              )
              : (
                <Button size="sm" variant="toolbar" onClick={() => { requestClose(tab.id) }}>
                  {t('editor.closeDeleted')}
                </Button>
              )}
          </div>
        </div>
      )}
      <div className={css.editorBody}>
        {terminalTabs.map(terminal => (
          <div
            key={`${terminal.id}:${terminal.generation}`}
            className={css.terminalTabBody}
            hidden={terminal.id !== tab.id}
          >
            <TerminalSurface
              tab={terminal}
              workspaceId={workspaceId}
              active={terminal.id === tab.id}
              controller={controller}
              t={t}
            />
          </div>
        ))}
        {tab.kind !== 'terminal' && (tab.loading
          ? <EditorEmpty text={tab.error ?? t('editor.loading')} />
          : tab.kind === 'diff'
            ? tab.diff === null
              ? <EditorEmpty text={tab.error ?? t('editor.loading')} />
              : (
                <GitDiffEditor
                  key={tab.id}
                  diff={tab.diff}
                  viewMode={state.diffViewMode}
                  onViewModeChange={mode => { controller.setDiffViewMode(mode) }}
                  t={t}
                />
              )
            : tab.file === null
              ? <EditorEmpty text={tab.error ?? t('editor.loading')} />
              : tab.file.markdown && tab.preview
                ? <div className={css.markdownPreview}><MarkdownText text={tab.draft} /></div>
                : (
                  <CodeEditor
                    key={tab.id}
                    value={tab.draft}
                    ariaLabel={tab.path}
                    onChange={(value, source) => { controller.setDraft(value, source) }}
                    onGitHunkOpen={() => { controller.logGitHunkOpen(tab.path) }}
                    onGitHunkResize={width => { controller.logGitHunkResize(tab.path, width) }}
                    onGitHunkResizeStorageError={operation => { controller.logGitHunkResizeStorageError(operation) }}
                    onGitHunkDismissOutside={() => { controller.logGitHunkDismissOutside(tab.path) }}
                    {...tab.gitBaseline?.available === true && !tab.gitBaseline.binary
                      ? { gitOriginal: tab.gitBaseline.original }
                      : {}}
                    gitLabels={gitLineLabels}
                  />
                ))}
      </div>
      <Modal
        open={closeTab !== undefined}
        onClose={() => { if (!closing) setPendingClose(null) }}
        closeLabel={t('editor.cancelClose')}
        title={t('editor.closeUnsavedTitle')}
        {...closeTab === undefined
          ? {}
          : closeTab.kind === 'file'
            ? { description: t('editor.closeUnsavedDescription', { path: closeTab.path }) }
            : {}}
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
