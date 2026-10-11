// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import {
  EMPTY_STRUCTURED_AGENT_SESSION,
  type StructuredAgentSessionState
} from '../../../../shared/structured-agent-session-reducer'
import { useStructuredAgentSessionTransportState } from './use-structured-agent-session-transport-state'
import { useStructuredAgentSessionMetrics } from './use-structured-agent-session-metrics'

function renderMetrics(initialState: StructuredAgentSessionState) {
  return renderHook(
    ({
      state,
      sessionId,
      target,
      createdAt
    }: {
      state: StructuredAgentSessionState
      sessionId: string
      target: RuntimeClientTarget
      createdAt?: number
    }) => {
      const transport = useStructuredAgentSessionTransportState(state, true)
      return useStructuredAgentSessionMetrics(
        { sessionId, target, isVisible: true, transportEnabled: true },
        state,
        transport,
        { sessionTiming: createdAt === undefined ? undefined : { createdAt } }
      )
    },
    {
      initialProps: {
        state: initialState,
        sessionId: 's',
        target: { kind: 'environment', environmentId: 'remote' },
        createdAt: 30_000
      }
    }
  )
}

const running: StructuredAgentSessionState = {
  ...EMPTY_STRUCTURED_AGENT_SESSION,
  hostClock: { hostNow: 100_000, receivedAt: 1_000_000 },
  latestTurn: {
    itemId: 'turn-1',
    observedAt: 95_000,
    turn: { turnId: 't', state: 'running', startedAt: 90_000, requestedAt: 80_000 }
  }
}

describe('structured conversation metrics timing', () => {
  it('uses the whole-journal turn outside loaded history and survives reconnect, pagination and context reset', () => {
    const { result, rerender } = renderMetrics(running)
    expect(result.current.sessionTiming).toMatchObject({
      running: true,
      workingStartedAt: 980_000,
      conversationStartedAtLocal: 930_000,
      lastRunSeconds: null
    })
    const completed: StructuredAgentSessionState = {
      ...running,
      epoch: 'reconnected-or-cleared',
      items: [],
      hostClock: { hostNow: 200_000, receivedAt: 1_200_000 },
      latestTurn: {
        itemId: 'turn-1',
        observedAt: 105_000,
        turn: {
          turnId: 't',
          state: 'completed',
          startedAt: 90_000,
          requestedAt: 80_000,
          completedAt: 105_000
        }
      }
    }
    rerender({
      state: completed,
      sessionId: 's',
      target: { kind: 'environment', environmentId: 'remote' },
      createdAt: 30_000
    })
    expect(result.current.sessionTiming).toMatchObject({
      running: false,
      lastRunSeconds: 25,
      conversationStartedAtLocal: 930_000
    })
    rerender({
      state: { ...completed, hasOlder: true },
      sessionId: 's',
      target: { kind: 'environment', environmentId: 'remote' },
      createdAt: 30_000
    })
    expect(result.current.sessionTiming.lastRunSeconds).toBe(25)
  })
  it('does not use a local mount clock when the host clock or creation time is missing', () => {
    const { result, rerender } = renderMetrics({ ...running, hostClock: undefined })
    expect(result.current.sessionTiming.workingStartedAt).toBeNull()
    expect(result.current.sessionTiming.conversationStartedAtLocal).toBeNull()
    rerender({
      state: running,
      sessionId: 's',
      target: { kind: 'environment', environmentId: 'remote' },
      createdAt: undefined
    })
    expect(result.current.sessionTiming.workingStartedAt).toBe(980_000)
    expect(result.current.sessionTiming.conversationStartedAtLocal).toBeNull()
  })
  it('drops a previous conversation clock when the session or target changes', () => {
    const { result, rerender } = renderMetrics(running)
    rerender({
      state: EMPTY_STRUCTURED_AGENT_SESSION,
      sessionId: 'other',
      target: { kind: 'environment', environmentId: 'remote' },
      createdAt: 30_000
    })
    expect(result.current.sessionTiming.conversationStartedAtLocal).toBeNull()
    rerender({
      state: { ...running, hostClock: { hostNow: 100_000, receivedAt: 2_000_000 } },
      sessionId: 'other',
      target: { kind: 'environment', environmentId: 'another' },
      createdAt: 30_000
    })
    expect(result.current.sessionTiming.conversationStartedAtLocal).toBe(1_930_000)
  })
  it('keeps interrupted duration frozen but unverifiable endpoints unavailable', () => {
    const interrupted: StructuredAgentSessionState = {
      ...running,
      latestTurn: {
        itemId: 'turn-1',
        observedAt: 105_000,
        turn: { turnId: 't', state: 'interrupted', startedAt: 90_000, durationMs: 123_456 }
      }
    }
    const { result, rerender } = renderMetrics(interrupted)
    expect(result.current.sessionTiming.lastRunSeconds).toBe(123)
    rerender({
      state: {
        ...interrupted,
        latestTurn: {
          itemId: 'turn-1',
          observedAt: 105_000,
          turn: { turnId: 't', state: 'unverifiable', startedAt: 90_000 }
        }
      },
      sessionId: 's',
      target: { kind: 'environment', environmentId: 'remote' },
      createdAt: 30_000
    })
    expect(result.current.sessionTiming.lastRunSeconds).toBeNull()
  })
})
