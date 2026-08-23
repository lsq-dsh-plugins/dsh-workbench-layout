// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createEditorTrackTransition,
  EDITOR_TRANSITION_ATTRIBUTE,
  EDITOR_TRANSITION_END_EVENT,
  EDITOR_TRANSITION_START_EVENT,
  TRANSITION_CONVERSATION_WIDTH,
  TRANSITION_EDITOR_WIDTH,
  TRANSITION_SIDEBAR_WIDTH,
} from '../src/client/editor-track-transition.ts'

let scheduledFrame: FrameRequestCallback | undefined

beforeEach(() => {
  scheduledFrame = undefined
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    scheduledFrame = callback
    return 1
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('中栏轨道过渡', () => {
  it('在收起和展开期间连续交换中栏与会话栏宽度', () => {
    const { frame, conversation, editor } = frameFixture()
    const logger = { info: vi.fn() }
    const start = vi.fn()
    const end = vi.fn()
    frame.addEventListener(EDITOR_TRANSITION_START_EVENT, start)
    frame.addEventListener(EDITOR_TRANSITION_END_EVENT, end)
    const transition = createEditorTrackTransition(frame, logger, true)

    transition.setExpanded(false)
    expect(start).toHaveBeenCalledTimes(1)
    expect(frame.hasAttribute(EDITOR_TRANSITION_ATTRIBUTE)).toBe(true)
    expect(frame.style.getPropertyValue(TRANSITION_SIDEBAR_WIDTH)).toBe('280px')
    expect(frame.style.getPropertyValue(TRANSITION_EDITOR_WIDTH)).toBe('560px')
    expect(frame.style.getPropertyValue(TRANSITION_CONVERSATION_WIDTH)).toBe('360px')

    flushAnimationFrame()
    expect(frame.style.getPropertyValue(TRANSITION_EDITOR_WIDTH)).toBe('560px')
    expect(frame.style.getPropertyValue(TRANSITION_CONVERSATION_WIDTH)).toBe('360px')
    finishGridTransition(frame)
    expect(frame.hasAttribute(EDITOR_TRANSITION_ATTRIBUTE)).toBe(true)
    expect(end).not.toHaveBeenCalled()
    flushAnimationFrame()
    expect(frame.style.getPropertyValue(TRANSITION_EDITOR_WIDTH)).toBe('0px')
    expect(frame.style.getPropertyValue(TRANSITION_CONVERSATION_WIDTH)).toBe('920px')
    finishGridTransition(frame)
    expect(frame.hasAttribute(EDITOR_TRANSITION_ATTRIBUTE)).toBe(false)
    expect(end).toHaveBeenCalledTimes(1)

    vi.spyOn(conversation, 'getBoundingClientRect').mockReturnValue(rect(920))
    vi.spyOn(editor, 'getBoundingClientRect').mockReturnValue(rect(0))
    transition.setExpanded(true)
    expect(start).toHaveBeenCalledTimes(2)
    flushAnimationFrame()
    expect(frame.style.getPropertyValue(TRANSITION_EDITOR_WIDTH)).toBe('0px')
    expect(frame.style.getPropertyValue(TRANSITION_CONVERSATION_WIDTH)).toBe('920px')
    flushAnimationFrame()
    expect(frame.style.getPropertyValue(TRANSITION_EDITOR_WIDTH)).toBe('560px')
    expect(frame.style.getPropertyValue(TRANSITION_CONVERSATION_WIDTH)).toBe('360px')
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('collapse transition'))
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('expand transition'))

    transition.dispose()
    expect(frame.hasAttribute(EDITOR_TRANSITION_ATTRIBUTE)).toBe(false)
    expect(end).toHaveBeenCalledTimes(2)
  })
})

function frameFixture() {
  const frame = document.createElement('div')
  frame.style.gridTemplateColumns = '280px minmax(0, 1fr) 360px'
  const sidebar = document.createElement('div')
  const conversation = document.createElement('div')
  const editor = document.createElement('div')
  frame.append(sidebar, conversation, editor)
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(rect(1200))
  vi.spyOn(sidebar, 'getBoundingClientRect').mockReturnValue(rect(280))
  vi.spyOn(conversation, 'getBoundingClientRect').mockReturnValue(rect(360))
  vi.spyOn(editor, 'getBoundingClientRect').mockReturnValue(rect(560))
  return { frame, conversation, editor }
}

function flushAnimationFrame(): void {
  const callback = scheduledFrame
  scheduledFrame = undefined
  expect(callback).toBeDefined()
  callback?.(0)
}

function finishGridTransition(frame: HTMLElement): void {
  const event = new Event('transitionend', { bubbles: true })
  Object.defineProperty(event, 'propertyName', { value: 'grid-template-columns' })
  frame.dispatchEvent(event)
}

function rect(width: number): DOMRect {
  return { width, height: 800, x: 0, y: 0, top: 0, right: width, bottom: 800, left: 0, toJSON: () => ({}) }
}
