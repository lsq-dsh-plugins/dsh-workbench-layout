import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  IconFolderOpenOutline16,
  IconNewChatOutline16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchController } from './controller.ts'
import type { WorkbenchKey } from './locales.ts'
import { IconSourceControlOutline16 } from './SourceControlIcon.tsx'
import { IconTerminalOutline16 } from './TerminalIcon.tsx'
import { createSidebarTopMount } from './sidebar-top-layout.ts'
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
  const iconSize = wide ? 16 : 18
  const items = [
    { mode: 'sessions' as const, label: t('mode.sessions'), icon: <IconNewChatOutline16 size={iconSize} /> },
    { mode: 'files' as const, label: t('mode.files'), icon: <IconFolderOpenOutline16 size={iconSize} /> },
    { mode: 'git' as const, label: t('mode.git'), icon: <IconSourceControlOutline16 size={iconSize} /> },
    { mode: 'terminal' as const, label: t('mode.terminal'), icon: <IconTerminalOutline16 size={iconSize} /> },
  ]
  useEffect(() => {
    const mount = createSidebarTopMount(css.sidebarTopHost!, setTarget, logger)
    return () => { mount.dispose() }
  }, [logger])
  useEffect(() => {
    target?.toggleAttribute('data-wide', wide)
  }, [target, wide])

  if (target === null) return <span className={css.modeSwitchAnchor} aria-hidden />
  return createPortal((
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
  ), target)
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    workbench: WorkbenchKey
  }
}
