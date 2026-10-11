// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeChatMetricsTimers } from './NativeChatMetricsTimers'
import type { NativeChatMetricsTiming } from './native-chat-metrics'

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

const timing: NativeChatMetricsTiming = {
  running: true,
  workingStartedAt: 100_000_000,
  lastRunSeconds: null,
  conversationStartedAtLocal: 6_000_000,
  isVisible: true
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(100_000_000)
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('footer duration clocks', () => {
  it('ticks the live run and conversation age beyond 24 hours, then freezes the last duration', () => {
    const { rerender } = render(<NativeChatMetricsTimers timing={timing} />)
    expect(screen.getByRole('button').textContent).toContain('Run 0s')
    expect(screen.getByRole('button').textContent).toContain('Conversation 26h 6m 40s')
    act(() => vi.advanceTimersByTime(3_000))
    expect(screen.getByRole('button').textContent).toContain('Run 3s')
    rerender(<NativeChatMetricsTimers timing={{ ...timing, running: false, lastRunSeconds: 3 }} />)
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByRole('button').textContent).toContain('Last 3s')
    expect(screen.getByRole('button').textContent).toContain('Conversation 26h 7m 43s')
  })
  it('uses no timer for an unknown old host and never fabricates zero', () => {
    render(<NativeChatMetricsTimers />)
    expect(screen.getByRole('button').textContent).toContain('Last Unavailable')
    expect(screen.getByRole('button').textContent).toContain('Conversation Unavailable')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('suspends hidden panes and catches up when visible', () => {
    const { rerender } = render(
      <NativeChatMetricsTimers timing={{ ...timing, isVisible: false }} />
    )
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(5_000))
    rerender(<NativeChatMetricsTimers timing={timing} />)
    expect(screen.getByRole('button').textContent).toContain('Run 5s')
    expect(vi.getTimerCount()).toBe(1)
  })
})
