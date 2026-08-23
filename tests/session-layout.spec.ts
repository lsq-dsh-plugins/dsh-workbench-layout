import { describe, expect, it, vi } from 'vitest'
import { createWorkbenchSessionActivator } from '../src/client/session-layout.ts'

describe('workbench Session layout binding', () => {
  it('updates the controller and opens the official AppFrame details track', () => {
    const controller = { setSession: vi.fn() }
    const layout = { openDetails: vi.fn() }
    const logger = { info: vi.fn() }
    const activate = createWorkbenchSessionActivator(controller, layout, logger)

    activate('session-1')

    expect(controller.setSession).toHaveBeenCalledWith('session-1')
    expect(layout.openDetails).toHaveBeenCalledOnce()
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('native AppFrame details track'))
  })
})
