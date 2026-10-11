import { useMemo, useState } from 'react'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { AgentSessionOptionsResult } from '../../../../shared/agent-session-wire'
import type { StructuredAgentSessionState } from '../../../../shared/structured-agent-session-reducer'
import { latestStructuredAgentContextFacts } from '../../../../shared/structured-agent-session-context-usage'
import {
  latestStructuredAgentTurnSeconds,
  selectStructuredAgentTurnBars,
  structuredAgentTurnOrigin
} from '../../../../shared/structured-agent-session-turn-timing'
import {
  stepStructuredAgentSessionClock,
  structuredAgentSessionLocalTime,
  type StructuredAgentSessionClockLatch
} from '../../../../shared/structured-agent-session-clock-anchor'
import type { NativeChatMetricsTiming } from './native-chat-metrics'
import type { useStructuredAgentSessionTransportState } from './use-structured-agent-session-transport-state'

export function useStructuredAgentSessionMetrics(
  args: {
    sessionId: string
    target: RuntimeClientTarget
    isVisible: boolean
    transportEnabled: boolean
  },
  state: StructuredAgentSessionState,
  transport: ReturnType<typeof useStructuredAgentSessionTransportState>,
  support: Pick<AgentSessionOptionsResult, 'contextUsage' | 'sessionTiming'>
) {
  const identity = JSON.stringify([
    args.target.kind,
    args.target.kind === 'environment' ? args.target.environmentId : null,
    args.sessionId
  ])
  const [clock, setClock] = useState<StructuredAgentSessionClockLatch | null>(null)
  const latch = stepStructuredAgentSessionClock({
    identity,
    hostClock: args.transportEnabled ? state.hostClock : null,
    latch: clock
  })
  if (latch !== clock) {
    setClock(latch)
  }
  const sessionUsage = useMemo(() => {
    const loaded = latestStructuredAgentContextFacts(transport.journalItems).session
    const host = support.contextUsage?.current.session
    return host && (!loaded || host.capturedAt > loaded.capturedAt)
      ? host
      : (loaded ?? host ?? null)
  }, [transport.journalItems, support.contextUsage?.current.session])
  const runningTiming = useMemo(
    () =>
      selectStructuredAgentTurnBars(
        transport.journalItems,
        transport.submissions,
        transport.turnId,
        transport.latestTurn
      ).runningTiming,
    [transport.journalItems, transport.submissions, transport.turnId, transport.latestTurn]
  )
  const sessionTiming: NativeChatMetricsTiming = {
    running: transport.turnId !== null,
    workingStartedAt: structuredAgentSessionLocalTime(
      runningTiming ? structuredAgentTurnOrigin(runningTiming) : null,
      latch
    ),
    lastRunSeconds: latestStructuredAgentTurnSeconds(transport.latestTurn),
    conversationStartedAtLocal: structuredAgentSessionLocalTime(
      support.sessionTiming?.createdAt,
      latch
    ),
    isVisible: args.isVisible
  }
  return { sessionUsage, sessionTiming }
}
