import { describe, expect, it } from 'vitest'
import { codexSessionConsumption, readCodexUsageCounts } from './codex-session-consumption'
import {
  latestStructuredAgentContextFacts,
  selectStructuredAgentContextUsage
} from '../../shared/structured-agent-session-context-usage'

function counts(input = 100, output = 20, cached = 50) {
  return {
    inputTokens: input,
    cachedInputTokens: cached,
    outputTokens: output,
    reasoningOutputTokens: 5,
    totalTokens: input + output
  }
}
function frame(total = counts(), last: unknown = total, threadId = 'primary') {
  return { threadId, turnId: 'turn', tokenUsage: { total, last, modelContextWindow: 200_000 } }
}

describe('durable Codex session consumption', () => {
  it('replaces running totals and ignores repeated and older frames', () => {
    const first = codexSessionConsumption(frame(), undefined, 'gpt-6.1-sol', 1)!
    const next = codexSessionConsumption(frame(counts(200, 40, 100)), first, 'gpt-6.1-sol', 2)!
    expect(next.totalTokens).toBe(240)
    expect(codexSessionConsumption(frame(), next, 'gpt-6.1-sol', 3)).toEqual(next)
    expect(codexSessionConsumption(frame(counts(200, 40, 100)), next, 'gpt-6.1-sol', 4)).toEqual(
      next
    )
  })
  it('prices cached input once and reasoning only inside output', () => {
    const result = codexSessionConsumption(frame(), undefined, 'gpt-6.1-sol', 1)!
    expect(result.estimatedCostUsd).toBeCloseTo((50 * 2 + 50 * 0.1 + 20 * 10) / 1_000_000)
    expect(result.unpricedTokens).toBe(0)
  })
  it('preserves consumption when provider thread changes', () => {
    const first = codexSessionConsumption(frame(), undefined, 'gpt-6.1-sol', 1)!
    const reset = codexSessionConsumption(
      frame(counts(10, 2, 5), counts(10, 2, 5), 'new-thread'),
      first,
      'gpt-6.1-sol',
      2
    )!
    expect(reset.totalTokens).toBe(132)
  })
  it('does not retroactively price missing or unsupported model history', () => {
    const history = codexSessionConsumption(
      frame(counts(1000, 200), counts()),
      undefined,
      'gpt-6.1-sol',
      1
    )!
    expect(history.unpricedTokens).toBe(1080)
    const absentLast = codexSessionConsumption(frame(counts(), null), undefined, 'gpt-6.1-sol', 1)!
    expect(absentLast.unpricedTokens).toBe(120)
    expect(codexSessionConsumption(frame(), undefined, 'future-model', 1)?.unpricedTokens).toBe(120)
  })
  it('uses model at each increment, leaves cache-write pricing unavailable', () => {
    const first = codexSessionConsumption(frame(), undefined, 'gpt-6.1-sol', 1)!
    const next = codexSessionConsumption(
      frame(counts(200, 40, 100), counts()),
      first,
      'future-model',
      2
    )!
    expect(next.estimatedCostUsd).toBe(first.estimatedCostUsd)
    expect(next.unpricedTokens).toBe(120)
    const writes = frame(counts(), { ...counts(), cacheWriteInputTokens: 10 })
    expect(codexSessionConsumption(writes, undefined, 'gpt-6.1-sol', 1)?.unpricedTokens).toBe(120)
  })
  it('rejects incomplete, non-finite and negative provider counters', () => {
    expect(readCodexUsageCounts({ totalTokens: 100 })).toBeNull()
    expect(readCodexUsageCounts({ ...counts(), inputTokens: Infinity })).toBeNull()
    expect(readCodexUsageCounts({ ...counts(), inputTokens: -1 })).toBeNull()
  })
  it('uses the price tier of each request and preserves earlier model prices', () => {
    const short = codexSessionConsumption(
      frame(counts(272_000, 1000, 200_000)),
      undefined,
      'gpt-6.1-sol',
      1
    )!
    const long = codexSessionConsumption(
      frame(counts(272_001, 1000, 200_000)),
      undefined,
      'gpt-6.1-sol',
      1
    )!
    expect(short.estimatedCostUsd).toBeCloseTo(0.174)
    expect(long.estimatedCostUsd).toBeCloseTo(0.343004)
    const first = codexSessionConsumption(frame(), undefined, 'gpt-6.1-sol', 1)!
    const switched = codexSessionConsumption(
      frame(counts(200, 40, 100), counts()),
      first,
      'gpt-6-astra',
      2
    )!
    expect(switched.estimatedCostUsd).toBeCloseTo(0.001855)
  })
  it('does not reprice growing last-request counters beyond the new increment', () => {
    const first = codexSessionConsumption(frame(), undefined, 'gpt-6.1-sol', 1)!
    const growing = codexSessionConsumption(
      frame(counts(100, 30), counts(100, 30)),
      first,
      'gpt-6.1-sol',
      2
    )!
    expect(growing.totalTokens).toBe(130)
    expect(growing.estimatedCostUsd).toBe(first.estimatedCostUsd)
    expect(growing.unpricedTokens).toBe(10)
  })
  it('uses last total occupancy without adding included cache or reasoning', () => {
    const usage = {
      used: {
        kind: 'estimate' as const,
        usedTokens: 120,
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0
        },
        capturedAt: 1
      },
      window: { tokens: 1000, capturedAt: 1 }
    }
    expect(selectStructuredAgentContextUsage([], usage)).toMatchObject({
      usedTokens: 120,
      percentage: 12
    })
  })
  it('retains session snapshots across context clear and journal replay', () => {
    const session = codexSessionConsumption(frame(), undefined, 'gpt-6.1-sol', 1)!
    const rows = [
      {
        sequence: 1,
        body: { kind: 'turn', turnId: 't', state: 'completed', contextUsage: { session } }
      }
    ]
    const replay = JSON.parse(JSON.stringify(rows))
    expect(latestStructuredAgentContextFacts(replay, 10).session).toEqual(session)
  })
})
