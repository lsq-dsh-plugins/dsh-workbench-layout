// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GIT_DECORATION_REFRESH_INTERVAL_MS,
  installGitDecorationRefresh,
} from '../src/client/git-decoration-refresh.ts'

afterEach(() => { vi.useRealTimers() })

describe('Git decoration refresh lifecycle', () => {
  it('refreshes immediately, periodically, and when focus returns', () => {
    vi.useFakeTimers()
    const controller = { refreshGitDecorations: vi.fn(() => Promise.resolve()) }
    const dispose = installGitDecorationRefresh(controller)

    expect(controller.refreshGitDecorations).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(GIT_DECORATION_REFRESH_INTERVAL_MS)
    window.dispatchEvent(new Event('focus'))
    expect(controller.refreshGitDecorations).toHaveBeenCalledTimes(3)

    dispose()
    vi.advanceTimersByTime(GIT_DECORATION_REFRESH_INTERVAL_MS)
    expect(controller.refreshGitDecorations).toHaveBeenCalledTimes(3)
  })
})
