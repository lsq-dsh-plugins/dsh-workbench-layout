/** Browser half: additive mode switch plus shadowed sidebar/details occupants. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { WorkbenchApi } from './api.ts'
import { WorkbenchController } from './controller.ts'
import { installWorkbenchLayout } from './layout-styles.ts'
import { en, zh } from './locales.ts'
import { ModeSwitch } from './ModeSwitch.tsx'
import { createWorkbenchWorkspaceActivator } from './workspace-layout.ts'
import { WorkbenchEditor } from './WorkbenchEditor.tsx'
import { WorkbenchSidebar } from './WorkbenchSidebar.tsx'

export const inject = ['slots', 'locale', 'layout']

/** Register the workbench UI without replacing DSH's AppFrame or conversation component. */
export function apply(ctx: ClientContext): void {
  const controller = new WorkbenchController(new WorkbenchApi(), {
    info: message => { ctx.logger.info(message) },
    warn: message => { ctx.logger.warn(message) },
  }, ctx.layout)
  const activateWorkspace = createWorkbenchWorkspaceActivator(controller, ctx.logger)
  ctx.effect(() => ctx.locale.register('workbench', { zh, en }), 'workbench-layout: dictionaries')

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'workbench-layout-modes',
    order: -100,
    locale: 'workbench',
    inject: () => ({ controller, logger: ctx.logger }),
  }, ModeSwitch))

  ctx.slots.inject('sidebar.workspaces', () => {
    let dispose: (() => void) | undefined
    const setActive = (active: boolean): void => {
      if (active && dispose === undefined) {
        dispose = ctx.slots.register({
          name: 'sidebar.workspaces',
          priority: -100,
          locale: 'workbench',
          inject: () => ({ controller }),
        }, WorkbenchSidebar)
      } else if (!active && dispose !== undefined) {
        dispose()
        dispose = undefined
      }
    }
    const detach = controller.attachSidebarShadow(setActive)
    return () => {
      detach()
      dispose?.()
    }
  })

  ctx.slots.inject('details', () => ctx.slots.register({
    name: 'details',
    priority: -100,
    locale: 'workbench',
    inject: () => ({ controller, activateWorkspace }),
  }, WorkbenchEditor))

  installWorkbenchLayout(ctx, controller.store)
  ctx.logger.info('workbench-layout: sidebar switch, file editor, and native-toned Git feedback registered')
}
