import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchFileTab } from './controller.ts'
import type { WorkbenchKey } from './locales.ts'
import css from './Workbench.module.css'

export interface EditorTabsProps {
  tabs: readonly WorkbenchFileTab[]
  activePath: string | undefined
  onSelect: (path: string) => void
  onClose: (path: string) => void
  t: TranslateNS<'workbench'>
}

/** Compact scrollable file tabs following DSH's native active-tab underline. */
export function EditorTabs({ tabs, activePath, onSelect, onClose, t }: EditorTabsProps) {
  return (
    <div className={css.editorTabs} role="tablist" aria-label={t('editor.openFiles')}>
      {tabs.map((tab) => {
        const active = tab.path === activePath
        const status = tab.saving ? t('editor.saving') : tab.dirty ? t('editor.unsaved') : undefined
        return (
          <div
            key={tab.path}
            className={css.editorTab}
            data-active={active || undefined}
            data-dirty={tab.dirty || undefined}
            title={status === undefined ? tab.path : `${tab.path} · ${status}`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className={css.editorTabSelect}
              onClick={() => { onSelect(tab.path) }}
            >
              <span className={css.editorTabName}>{basename(tab.path)}</span>
              {(tab.dirty || tab.saving) && (
                <span className={css.editorTabStatus} data-saving={tab.saving || undefined} aria-label={status} />
              )}
            </button>
            <button
              type="button"
              className={css.editorTabClose}
              aria-label={t('editor.closeTab', { name: basename(tab.path) })}
              onClick={() => { onClose(tab.path) }}
            >
              <IconCloseOutline16 size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function basename(path: string): string {
  return path.split('/').at(-1) ?? path
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    workbench: WorkbenchKey
  }
}
