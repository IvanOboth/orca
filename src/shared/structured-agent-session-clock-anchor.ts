import type { StructuredAgentHostClock } from './structured-agent-session-reducer'

export type StructuredAgentSessionClockLatch = { identity: string; offset: number }

/** Latch the first host sample per conversation, so refresh and reconnect never move its clock. */
export function stepStructuredAgentSessionClock({
  identity,
  hostClock,
  latch
}: {
  identity: string
  hostClock?: StructuredAgentHostClock | null
  latch: StructuredAgentSessionClockLatch | null
}): StructuredAgentSessionClockLatch | null {
  if (latch?.identity === identity) {
    return latch
  }
  return hostClock &&
    Number.isFinite(hostClock.hostNow) &&
    hostClock.hostNow > 0 &&
    Number.isFinite(hostClock.receivedAt)
    ? { identity, offset: hostClock.receivedAt - hostClock.hostNow }
    : null
}

export function structuredAgentSessionLocalTime(
  hostTime: number | null | undefined,
  latch: StructuredAgentSessionClockLatch | null
): number | null {
  return latch && hostTime != null && Number.isFinite(hostTime) && hostTime > 0
    ? hostTime + latch.offset
    : null
}
