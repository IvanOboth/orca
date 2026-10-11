import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTrackedJournalOpener } from '../native-chat/agent-session-journal/journal-host-database-test-support'
import { createDeferredStructuredAgentSessionEventSink } from '../native-chat/agent-session-wire/structured-agent-session-event-sink'
import { testEventSinkLogging } from '../native-chat/agent-session-wire/structured-agent-session-logger-test-support'
import { createCodexJournalTranslator } from './codex-structured-journal-translation'
import { codexProviderHandle } from '../../shared/agent-session-provider-handle-encoding'
import type { AgentSessionJournal } from '../native-chat/agent-session-journal/journal-store'
import { selectStructuredAgentContextUsage } from '../../shared/structured-agent-session-context-usage'
import {
  codexLifecycleMutationsReservedBytes,
  codexLifecycleMutationsWithContext
} from './codex-lifecycle-context-usage'
import { AGENT_JOURNAL_THREAD_SCOPE } from '../../shared/agent-session-journal-types'
import { codexTurnLifecycleIdentity } from './codex-structured-journal-translation-turns'

const journals = createTrackedJournalOpener()
const releases: (() => void)[] = []
let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-codex-metrics-lifecycle-'))
})
afterEach(async () => {
  for (const release of releases.splice(0)) {
    release()
  }
  await journals.closeAll()
  await rm(root, { recursive: true, force: true })
})
function open() {
  return journals.open({
    stateDirectory: root,
    identity: {
      sessionId: 'session',
      workspaceId: 'workspace',
      hostId: 'host',
      agent: 'codex',
      providerHandle: codexProviderHandle('main')
    }
  })
}
function acquire(journal: AgentSessionJournal) {
  const deferred = createDeferredStructuredAgentSessionEventSink(testEventSinkLogging())
  deferred.bind({ journal, fence: 1, publish: () => {} })
  const translator = createCodexJournalTranslator({
    sink: deferred.sink,
    sessionId: 'session',
    primaryThreadId: () => 'main',
    model: () => 'gpt-6.1-sol',
    coalesceMs: 0
  })
  releases.push(() => {
    translator.dispose()
    deferred.close()
  })
  const drain = async () => {
    await expect(deferred.drained()).resolves.toEqual({ ok: true })
  }
  const deliver = (method: string, params: unknown) => {
    expect(
      translator.handle({
        type: 'notification',
        sessionId: 'session',
        threadId: 'main',
        method,
        params
      })
    ).toEqual({ accepted: true })
  }
  const start = () => {
    deliver('turn/started', { turn: { id: 'turn' } })
    const counts = {
      totalTokens: 120,
      inputTokens: 100,
      cachedInputTokens: 50,
      outputTokens: 20,
      reasoningOutputTokens: 5
    }
    deliver('thread/tokenUsage/updated', {
      threadId: 'main',
      turnId: 'turn',
      tokenUsage: { total: counts, last: counts, modelContextWindow: 1000 }
    })
  }
  return { translator, start, deliver, drain }
}

describe('Codex consumption through durable lifecycle writes', () => {
  it.each(['completed', 'interrupted', 'failed'])(
    'preserves metrics through %s settlement and replay',
    async (status) => {
      const journal = await open()
      const provider = acquire(journal)
      provider.start()
      // Do not drain first: the settlement must observe the earlier queued usage write.
      provider.deliver('turn/completed', { turn: { id: 'turn', status } })
      await provider.drain()
      const facts = journal.contextUsage()
      expect(facts.session?.totalTokens).toBe(120)
      expect(selectStructuredAgentContextUsage([], facts)).toMatchObject({ usedTokens: 120 })
      await journal.close()
      const restored = await open()
      expect(restored.contextUsage()).toEqual(facts)
    }
  )
  it('preserves metrics when the provider exits with an open turn', async () => {
    const journal = await open()
    const provider = acquire(journal)
    provider.start()
    expect(
      provider.translator.handle({
        type: 'ended',
        sessionId: 'session',
        reason: 'lost child',
        cause: 'unexpected-exit',
        fence: 1,
        acquisitionGeneration: 'generation'
      })
    ).toEqual({ accepted: true })
    await provider.drain()
    expect(journal.contextUsage().session?.totalTokens).toBe(120)
    expect(journal.newestTurn()?.state).toBe('interrupted')
  })
  it('retains snapshots when restored history republishes the turn lifecycle', async () => {
    const journal = await open()
    const provider = acquire(journal)
    provider.start()
    provider.deliver('turn/completed', { turn: { id: 'turn', status: 'completed' } })
    await provider.drain()
    const before = journal.contextUsage()
    expect(
      provider.translator.restoreThread('main', {
        turns: [{ id: 'turn', status: 'completed', startedAt: 1, completedAt: 2, items: [] }]
      })
    ).toEqual({ accepted: true })
    await provider.drain()
    expect(journal.contextUsage()).toEqual(before)
  })
  it('reserves enough bytes for context retained after the settlement was queued', async () => {
    const journal = await open()
    const provider = acquire(journal)
    provider.start()
    await provider.drain()
    const mutations = [
      {
        kind: 'item' as const,
        identity: codexTurnLifecycleIdentity('session', 'turn'),
        body: { kind: 'turn' as const, turnId: 'turn', state: 'completed' as const },
        turnScope: AGENT_JOURNAL_THREAD_SCOPE
      }
    ]
    const retained = codexLifecycleMutationsWithContext(journal, mutations)
    expect(Buffer.byteLength(JSON.stringify(retained), 'utf8') + 512).toBeLessThanOrEqual(
      codexLifecycleMutationsReservedBytes(mutations)
    )
    expect(
      retained[0]?.kind === 'item' &&
        retained[0].body.kind === 'turn' &&
        retained[0].body.contextUsage?.session?.totalTokens
    ).toBe(120)
  })
})
