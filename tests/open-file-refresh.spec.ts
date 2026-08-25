// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { installOpenFileRefresh, OPEN_FILE_REFRESH_INTERVAL_MS } from '../src/client/open-file-refresh.ts'

afterEach(() => { vi.useRealTimers() })

describe('open file refresh lifecycle', () => {
  it('refreshes immediately, on the foreground interval, and on focus', () => {
    vi.useFakeTimers()
    const controller = { refreshOpenFiles: vi.fn(() => Promise.resolve()) }
    const dispose = installOpenFileRefresh(controller)

    expect(controller.refreshOpenFiles).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(OPEN_FILE_REFRESH_INTERVAL_MS)
    window.dispatchEvent(new Event('focus'))
    expect(controller.refreshOpenFiles).toHaveBeenCalledTimes(3)

    dispose()
    vi.advanceTimersByTime(OPEN_FILE_REFRESH_INTERVAL_MS)
    window.dispatchEvent(new Event('focus'))
    expect(controller.refreshOpenFiles).toHaveBeenCalledTimes(3)
  })
})
