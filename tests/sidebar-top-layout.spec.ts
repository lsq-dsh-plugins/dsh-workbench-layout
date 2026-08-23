// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSidebarTopMount,
  SIDEBAR_NEW_SESSION_ATTRIBUTE,
  SIDEBAR_TOP_HOST_ATTRIBUTE,
} from '../src/client/sidebar-top-layout.ts'

afterEach(() => { document.body.innerHTML = '' })

describe('侧栏顶部模式宿主', () => {
  it('通过官方工作区 slot 定位并保留官方节点归属', () => {
    const { root, newSession, region } = sidebarFixture()
    const onTarget = vi.fn()
    const logger = { info: vi.fn() }

    const mount = createSidebarTopMount('top-host', onTarget, logger)
    const host = root.querySelector<HTMLElement>(`[${SIDEBAR_TOP_HOST_ATTRIBUTE}]`)

    expect(host).not.toBeNull()
    expect(host?.nextElementSibling).toBe(newSession)
    expect(newSession.hasAttribute(SIDEBAR_NEW_SESSION_ATTRIBUTE)).toBe(true)
    expect(newSession.nextElementSibling).toBe(region)
    expect(onTarget).toHaveBeenCalledWith(host)
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('mounted mode switch'))

    mount.dispose()
    expect(root.querySelector(`[${SIDEBAR_TOP_HOST_ATTRIBUTE}]`)).toBeNull()
    expect(newSession.hasAttribute(SIDEBAR_NEW_SESSION_ATTRIBUTE)).toBe(false)
    expect(onTarget).toHaveBeenLastCalledWith(null)
  })

  it('在官方侧栏重建后迁移 Portal 宿主', async () => {
    const first = sidebarFixture()
    const onTarget = vi.fn()
    const mount = createSidebarTopMount('top-host', onTarget, { info: vi.fn() })
    first.root.remove()
    const second = sidebarFixture()

    await vi.waitFor(() => {
      expect(second.root.querySelector(`[${SIDEBAR_TOP_HOST_ATTRIBUTE}]`)).not.toBeNull()
    })
    expect(first.newSession.hasAttribute(SIDEBAR_NEW_SESSION_ATTRIBUTE)).toBe(false)

    mount.dispose()
  })
})

function sidebarFixture() {
  const root = document.createElement('div')
  const brand = document.createElement('div')
  const newSession = document.createElement('button')
  const region = document.createElement('div')
  const seat = document.createElement('div')
  seat.dataset.slot = 'sidebar.workspaces'
  region.appendChild(seat)
  root.append(brand, newSession, region, document.createElement('div'))
  document.body.appendChild(root)
  return { root, newSession, region }
}
