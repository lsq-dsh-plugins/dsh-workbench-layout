import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  IconFolderOpenOutline16,
  IconPanelLeftOutline16,
  IconQueueOutline14,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchController } from './controller.ts'
import type { WorkbenchKey } from './locales.ts'
import { IconSourceControlOutline16 } from './SourceControlIcon.tsx'
import { IconTerminalOutline16 } from './TerminalIcon.tsx'
import { createSidebarTopMount } from './sidebar-top-layout.ts'
import { createSidebarFooterLayout, type SidebarFooterLayout } from './sidebar-footer-layout.ts'
import { useWorkbench } from './use-workbench.ts'
import css from './Workbench.module.css'

export type ModeSwitchProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'workbench'> & {
  controller: WorkbenchController
  logger: { info(message: string): void }
}

/** Always-visible switch; Sessions releases the sidebar shadow back to DSH. */
export function ModeSwitch({ wide, controller, logger, t }: ModeSwitchProps) {
  const state = useWorkbench(controller)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const footerLayout = useRef<SidebarFooterLayout | null>(null)
  const iconSize = wide ? 16 : 18
  const items = [
    { mode: 'sessions' as const, label: t('mode.sessions'), icon: <IconQueueOutline14 size={iconSize} /> },
    { mode: 'files' as const, label: t('mode.files'), icon: <IconFolderOpenOutline16 size={iconSize} /> },
    { mode: 'git' as const, label: t('mode.git'), icon: <IconSourceControlOutline16 size={iconSize} /> },
    { mode: 'terminal' as const, label: t('mode.terminal'), icon: <IconTerminalOutline16 size={iconSize} /> },
  ]
  useLayoutEffect(() => {
    const mount = createSidebarTopMount(css.sidebarTopHost!, setTarget, logger)
    const footer = createSidebarFooterLayout(wide, logger)
    footerLayout.current = footer
    return () => {
      footerLayout.current = null
      footer.dispose()
      mount.dispose()
    }
  }, [logger]) // wide updates through the stable footer layout below.
  useLayoutEffect(() => {
    target?.toggleAttribute('data-wide', wide)
    if (target !== null) target.dataset.mode = state.sidebarMode
    footerLayout.current?.setWide(wide)
  }, [state.sidebarMode, target, wide])
  const editorToggleLabel = state.editorExpanded ? t('editor.collapse') : t('editor.expand')

  return (
    <>
      {target === null
        ? <span className={css.modeSwitchAnchor} aria-hidden />
        : createPortal((
            <div className={css.modeSwitch} data-wide={wide || undefined}>
              {items.map(item => (
                <Tooltip key={item.mode} label={item.label} delayMs={500} disabled={wide}>
                  <button
                    type="button"
                    className={css.modeButton}
                    data-active={state.sidebarMode === item.mode || undefined}
                    aria-label={item.label}
                    aria-pressed={state.sidebarMode === item.mode}
                    onClick={() => { controller.setSidebarMode(item.mode) }}
                  >
                    {item.icon}
                    {wide && <span>{item.label}</span>}
                  </button>
                </Tooltip>
              ))}
            </div>
          ), target)}
      <Tooltip key={editorToggleLabel} label={editorToggleLabel} delayMs={500}>
        <button
          type="button"
          className={css.editorToggle}
          data-wide={wide || undefined}
          aria-label={editorToggleLabel}
          aria-pressed={state.editorExpanded}
          onClick={() => { controller.toggleEditor() }}
        >
          <IconPanelLeftOutline16 className={css.editorToggleIcon} size={wide ? 16 : 18} />
        </button>
      </Tooltip>
    </>
  )
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    workbench: WorkbenchKey
  }
}
