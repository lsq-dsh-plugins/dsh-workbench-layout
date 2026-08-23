import { describe, expect, it, vi } from 'vitest'
import { createWorkbenchWorkspaceActivator } from '../src/client/workspace-layout.ts'

describe('workbench Workspace layout binding', () => {
  it('updates the controller and opens the official AppFrame details track', () => {
    const controller = { setWorkspace: vi.fn() }
    const layout = { openDetails: vi.fn() }
    const logger = { info: vi.fn() }
    const activate = createWorkbenchWorkspaceActivator(controller, layout, logger)

    activate('workspace-1')

    expect(controller.setWorkspace).toHaveBeenCalledWith('workspace-1')
    expect(layout.openDetails).toHaveBeenCalledOnce()
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('workspace'))
  })
})
