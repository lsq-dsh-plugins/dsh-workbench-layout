import { useEffect, useRef } from 'react'
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
