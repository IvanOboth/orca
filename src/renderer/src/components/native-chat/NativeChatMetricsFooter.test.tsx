// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeChatMetricsFooter } from './NativeChatMetricsFooter'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => values?.[name] ?? '')
}))
afterEach(cleanup)

describe('native chat metrics footer', () => {
  it('keeps absent host queue unknown instead of claiming zero', () => {
    render(
      <NativeChatMetricsFooter
        context={null}
        metrics={{ session: null, queued: null, paused: false, revealQueue: vi.fn() }}
      />
    )
    const queue = screen.getByRole('button', { name: 'Queued Unavailable' })
    expect(queue.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Session Unavailable' })).toBeTruthy()
  })
  it('reveals the existing host queue and states its pause', () => {
    const revealQueue = vi.fn()
    render(
      <NativeChatMetricsFooter
        context={null}
        metrics={{ session: null, queued: 3, paused: true, revealQueue }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Queued 3 · Paused' }))
    expect(revealQueue).toHaveBeenCalledTimes(1)
  })
  it('states a known empty queue independently of unavailable consumption', () => {
    render(
      <NativeChatMetricsFooter
        context={null}
        metrics={{ session: null, queued: 0, paused: false, revealQueue: vi.fn() }}
      />
    )
    expect(screen.getByRole('button', { name: 'Queued 0' }).hasAttribute('disabled')).toBe(true)
  })
})
