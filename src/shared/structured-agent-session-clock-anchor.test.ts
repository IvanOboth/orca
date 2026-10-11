import { describe, expect, it } from 'vitest'
import {
  stepStructuredAgentSessionClock,
  structuredAgentSessionLocalTime
} from './structured-agent-session-clock-anchor'

describe('conversation host clock anchor', () => {
  it('converts remote creation time using host skew and latches the first sample across reconnect', () => {
    const latch = stepStructuredAgentSessionClock({
      identity: 'host-a/session',
      latch: null,
      hostClock: { hostNow: 100_000, receivedAt: 1_000_000 }
    })
    expect(structuredAgentSessionLocalTime(60_000, latch)).toBe(960_000)
    const reconnected = stepStructuredAgentSessionClock({
      identity: 'host-a/session',
      latch,
      hostClock: { hostNow: 200_000, receivedAt: 1_200_000 }
    })
    expect(reconnected).toBe(latch)
    expect(structuredAgentSessionLocalTime(60_000, reconnected)).toBe(960_000)
    expect(stepStructuredAgentSessionClock({ identity: 'host-a/session', latch })).toBe(latch)
  })
  it('clears the anchor when session or target changes and waits for a valid clock', () => {
    const latch = stepStructuredAgentSessionClock({
      identity: 'host-a/session',
      latch: null,
      hostClock: { hostNow: 100_000, receivedAt: 1_000_000 }
    })
    expect(stepStructuredAgentSessionClock({ identity: 'host-b/session', latch })).toBeNull()
    expect(stepStructuredAgentSessionClock({ identity: 'host-a/other', latch })).toBeNull()
    expect(
      stepStructuredAgentSessionClock({
        identity: 'host-a/other',
        latch,
        hostClock: { hostNow: Number.NaN, receivedAt: 1 }
      })
    ).toBeNull()
    expect(structuredAgentSessionLocalTime(60_000, null)).toBeNull()
    expect(structuredAgentSessionLocalTime(undefined, latch)).toBeNull()
    expect(structuredAgentSessionLocalTime(0, latch)).toBeNull()
  })
})
