import { describe, expect, it, vi } from 'vitest'
import { createWorkbenchWorkspaceActivator } from '../src/client/workspace-layout.ts'

describe('workbench Workspace layout binding', () => {
  it('updates the controller and reapplies the remembered middle-editor state', () => {
    const controller = { setWorkspace: vi.fn(), synchronizeEditorLayout: vi.fn() }
    const logger = { info: vi.fn() }
    const activate = createWorkbenchWorkspaceActivator(controller, logger)

    activate('workspace-1')

    expect(controller.setWorkspace).toHaveBeenCalledWith('workspace-1')
    expect(controller.synchronizeEditorLayout).toHaveBeenCalledOnce()
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('workspace'))
  })
})
