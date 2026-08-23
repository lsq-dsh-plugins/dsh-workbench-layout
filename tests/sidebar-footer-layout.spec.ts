// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createSidebarFooterLayout,
  SIDEBAR_FOOT_ACTIONS_ATTRIBUTE,
  SIDEBAR_FOOT_ATTRIBUTE,
  SIDEBAR_SETTINGS_AREA_ATTRIBUTE,
  SIDEBAR_SETTINGS_TRIGGER_ATTRIBUTE,
} from '../src/client/sidebar-footer-layout.ts'

afterEach(() => { document.body.innerHTML = '' })

describe('侧栏底部同行布局', () => {
  it('只标记官方 footer action 与 Settings 的共同结构并同步宽栏状态', () => {
    const { foot, actions, settings, settingsTrigger } = sidebarFooterFixture()
    const logger = { info: vi.fn() }
    const layout = createSidebarFooterLayout(true, logger)

    expect(foot.hasAttribute(SIDEBAR_FOOT_ATTRIBUTE)).toBe(true)
    expect(foot.hasAttribute('data-wide')).toBe(true)
    expect(actions.hasAttribute(SIDEBAR_FOOT_ACTIONS_ATTRIBUTE)).toBe(true)
    expect(settings.hasAttribute(SIDEBAR_SETTINGS_AREA_ATTRIBUTE)).toBe(true)
    expect(settingsTrigger.hasAttribute(SIDEBAR_SETTINGS_TRIGGER_ATTRIBUTE)).toBe(true)
    expect(actions.nextElementSibling).toBe(settings)
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('compact Settings action'))

    const stylesheet = readFileSync(resolve(process.cwd(), 'src/client/Workbench.module.css'), 'utf8')
    expect(stylesheet).toContain('[data-dsh-workbench-sidebar-foot][data-wide] [data-dsh-workbench-sidebar-settings-trigger]')
    expect(stylesheet).toContain('height: 32px')

    layout.setWide(false)
    expect(foot.hasAttribute('data-wide')).toBe(false)
    expect(actions.hasAttribute(SIDEBAR_FOOT_ACTIONS_ATTRIBUTE)).toBe(true)

    layout.dispose()
    expect(foot.hasAttribute(SIDEBAR_FOOT_ATTRIBUTE)).toBe(false)
    expect(actions.hasAttribute(SIDEBAR_FOOT_ACTIONS_ATTRIBUTE)).toBe(false)
    expect(settings.hasAttribute(SIDEBAR_SETTINGS_AREA_ATTRIBUTE)).toBe(false)
    expect(settingsTrigger.hasAttribute(SIDEBAR_SETTINGS_TRIGGER_ATTRIBUTE)).toBe(false)
  })

  it('在官方底部结构替换后释放旧标记并接管新节点', async () => {
    const first = sidebarFooterFixture()
    const layout = createSidebarFooterLayout(true, { info: vi.fn() })
    const second = sidebarFooterFixture()
    first.foot.remove()

    await vi.waitFor(() => {
      expect(second.foot.hasAttribute(SIDEBAR_FOOT_ATTRIBUTE)).toBe(true)
    })
    expect(first.foot.hasAttribute(SIDEBAR_FOOT_ATTRIBUTE)).toBe(false)
    layout.dispose()
  })
})

function sidebarFooterFixture() {
  const foot = document.createElement('div')
  const actions = document.createElement('div')
  const actionSeat = document.createElement('div')
  actionSeat.dataset.slot = 'sidebar.footer.action'
  actions.appendChild(actionSeat)
  const settings = document.createElement('div')
  const settingsSeat = document.createElement('div')
  settingsSeat.dataset.slot = 'sidebar.settings'
  const settingsTrigger = document.createElement('button')
  settingsSeat.appendChild(settingsTrigger)
  settings.appendChild(settingsSeat)
  foot.append(actions, settings)
  document.body.appendChild(foot)
  return { foot, actions, settings, settingsTrigger }
}
