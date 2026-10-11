import { describe, expect, it } from 'vitest'
import { createCodexJournalTranslator } from './codex-structured-journal-translation'
import { agentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import {
  latestStructuredAgentContextFacts,
  selectStructuredAgentContextUsage
} from '../../shared/structured-agent-session-context-usage'
import type { AgentJournalItemBody } from '../../shared/agent-session-journal-types'
import type { StructuredAgentSessionEventSink } from '../native-chat/agent-session-wire/structured-agent-session-event-sink'

function rig() {
  let serial = 0
  let model = 'gpt-6.1-sol'
  const rows = new Map<string, { body: AgentJournalItemBody; sequence: number }>()
  const revise: NonNullable<StructuredAgentSessionEventSink['tryReviseResolvedItem']> = (
    _bytes,
    resolve
  ) => {
    const write = resolve({
      epoch: 'epoch',
      itemBody: (id) => rows.get(id)?.body ?? null,
      visitItems: (visit) => {
        for (const [id, row] of rows) {
          visit(id, row.sequence, row.body)
        }
      }
    })
    if (write) {
      rows.set(agentJournalItemKey(write.identity), { body: write.body, sequence: ++serial })
    }
    return { accepted: true }
  }
  const sink: StructuredAgentSessionEventSink = {
    appendItem: (identity, body) =>
      rows.set(agentJournalItemKey(identity), { body, sequence: ++serial }),
    appendTombstone: () => {},
    publish: () => {},
    tryReviseResolvedItem: revise,
    tryReviseResolvedItemAndPublish: revise
  }
  const translator = createCodexJournalTranslator({
    sink,
    sessionId: 'session',
    primaryThreadId: () => 'main',
    model: () => model
  })
  const deliver = (method: string, params: unknown, threadId = 'main') =>
    translator.handle({ type: 'notification', sessionId: 'session', threadId, method, params })
  const facts = () => latestStructuredAgentContextFacts(rows.values())
  deliver('turn/started', { turn: { id: 'turn' } })
  return {
    translator,
    deliver,
    facts,
    setModel: (value: string) => {
      model = value
    }
  }
}
const counts = {
  totalTokens: 120,
  inputTokens: 100,
  cachedInputTokens: 50,
  outputTokens: 20,
  reasoningOutputTokens: 5
}
function usage(window: number | null = 1000, threadId = 'main') {
  return {
    threadId,
    turnId: 'turn',
    tokenUsage: { total: counts, last: counts, modelContextWindow: window }
  }
}

describe('Codex usage notification routing', () => {
  it('journals main usage and preserves it through turn completion', () => {
    const test = rig()
    test.deliver('thread/tokenUsage/updated', usage())
    expect(selectStructuredAgentContextUsage([], test.facts())).toMatchObject({
      usedTokens: 120,
      percentage: 12
    })
    test.deliver('turn/completed', { turn: { id: 'turn', status: 'completed' } })
    expect(test.facts().session?.totalTokens).toBe(120)
  })
  it('excludes child thread usage from the primary snapshot', () => {
    const test = rig()
    test.deliver('thread/tokenUsage/updated', usage(1000, 'child'), 'child')
    expect(test.facts().session).toBeUndefined()
  })
  it('invalidates null windows, model changes and compaction while retaining consumption', () => {
    const test = rig()
    test.deliver('thread/tokenUsage/updated', usage())
    test.deliver('thread/tokenUsage/updated', usage(null))
    expect(selectStructuredAgentContextUsage([], test.facts())).toBeNull()
    test.deliver('thread/tokenUsage/updated', usage())
    test.setModel('future-model')
    test.translator.resetContext()
    expect(selectStructuredAgentContextUsage([], test.facts())).toBeNull()
    test.deliver('thread/tokenUsage/updated', usage())
    test.deliver('thread/compacted', { turnId: 'turn' })
    expect(selectStructuredAgentContextUsage([], test.facts())).toBeNull()
    expect(test.facts().session?.totalTokens).toBe(120)
  })
})
