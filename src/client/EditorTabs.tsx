import { useEffect, useRef } from 'react'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchTab } from './controller.ts'
import { diffKindText } from './git-diff-labels.ts'
import type { WorkbenchKey } from './locales.ts'
import css from './Workbench.module.css'

export interface EditorTabsProps {
  tabs: readonly WorkbenchTab[]
  activeTabId: string | undefined
  onSelect: (tabId: string) => void
  onClose: (tabId: string) => void
  t: TranslateNS<'workbench'>
}

/** Compact scrollable file/Diff tabs following DSH's native active-tab underline. */
export function EditorTabs({ tabs, activeTabId, onSelect, onClose, t }: EditorTabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const tabList = tabListRef.current
    if (tabList === null) return
    const onWheel = (event: WheelEvent): void => {
      const delta = normalizedHorizontalDelta(tabList, event)
      if (delta === 0) return
      const maxScrollLeft = Math.max(0, tabList.scrollWidth - tabList.clientWidth)
      const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, tabList.scrollLeft + delta))
      if (nextScrollLeft === tabList.scrollLeft) return
      event.preventDefault()
      tabList.scrollLeft = nextScrollLeft
    }
    tabList.addEventListener('wheel', onWheel, { passive: false })
    return () => { tabList.removeEventListener('wheel', onWheel) }
  }, [])

  return (
    <div ref={tabListRef} className={css.editorTabs} role="tablist" aria-label={t('editor.openFiles')}>
      {tabs.map((tab) => {
        const active = tab.id === activeTabId
        const kind = tab.kind === 'diff' ? diffKindText(tab.diffKind, t) : undefined
        const label = kind === undefined ? basename(tab.path) : `${basename(tab.path)} (${kind})`
        const status = tab.kind === 'file'
          ? tab.saving ? t('editor.saving') : tab.dirty ? t('editor.unsaved') : undefined
          : tab.loading ? t('editor.loading') : undefined
        return (
          <div
            key={tab.id}
            className={css.editorTab}
            data-active={active || undefined}
            data-dirty={tab.kind === 'file' && tab.dirty || undefined}
            data-tab-kind={tab.kind}
            title={[tab.path, kind, status].filter(Boolean).join(' · ')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={label}
              className={css.editorTabSelect}
              onClick={() => { onSelect(tab.id) }}
            >
              <span className={css.editorTabName}>{basename(tab.path)}</span>
              {kind !== undefined && <span className={css.editorTabKind}>{kind}</span>}
              {tab.kind === 'file' && (tab.dirty || tab.saving) && (
                <span className={css.editorTabStatus} data-saving={tab.saving || undefined} aria-label={status} />
              )}
            </button>
            <button
              type="button"
              className={css.editorTabClose}
              aria-label={t('editor.closeTab', { name: label })}
              onClick={() => { onClose(tab.id) }}
            >
              <IconCloseOutline16 size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** 将鼠标纵向滚轮映射为标签栏横向位移，并兼容行/页单位设备。 */
function normalizedHorizontalDelta(element: HTMLElement, event: WheelEvent): number {
  const rawDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (rawDelta === 0 || !Number.isFinite(rawDelta)) return 0
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return rawDelta * 32
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return rawDelta * Math.max(1, element.clientWidth)
  return rawDelta
}

function basename(path: string): string {
  return path.split('/').at(-1) ?? path
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    workbench: WorkbenchKey
  }
}
