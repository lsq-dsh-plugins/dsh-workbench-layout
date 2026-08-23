import {
  IconFolderOpenOutline16,
  IconNewChatOutline16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchController } from './controller.ts'
import type { WorkbenchKey } from './locales.ts'
import { IconSourceControlOutline16 } from './SourceControlIcon.tsx'
import { useWorkbench } from './use-workbench.ts'
import css from './Workbench.module.css'

export type ModeSwitchProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'workbench'> & {
  controller: WorkbenchController
}

/** Always-visible switch; Sessions releases the sidebar shadow back to DSH. */
export function ModeSwitch({ wide, controller, t }: ModeSwitchProps) {
  const state = useWorkbench(controller)
  const iconSize = wide ? 16 : 18
  const items = [
    { mode: 'sessions' as const, label: t('mode.sessions'), icon: <IconNewChatOutline16 size={iconSize} /> },
    { mode: 'files' as const, label: t('mode.files'), icon: <IconFolderOpenOutline16 size={iconSize} /> },
    { mode: 'git' as const, label: t('mode.git'), icon: <IconSourceControlOutline16 size={iconSize} /> },
  ]
  return (
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
  )
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    workbench: WorkbenchKey
  }
}
