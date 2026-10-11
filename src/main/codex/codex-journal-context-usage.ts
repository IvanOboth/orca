import type {
  AgentSessionContextUsage,
  AgentSessionConsumption
} from '../../shared/agent-session-context-usage'
import { readAgentJournalTurn } from '../../shared/agent-session-turn-record'
import { AGENT_JOURNAL_THREAD_SCOPE } from '../../shared/agent-session-journal-types'
import {
  resolveAgentJournalTurnRowWrite,
  writeAgentJournalTurnRow
} from '../native-chat/agent-session-timeline/agent-journal-turn-row-revision'
import { readRecord } from './codex-item-field-readers'
import { codexSessionConsumption, readCodexUsageCounts } from './codex-session-consumption'
import {
  CODEX_JOURNAL_ADMITTED,
  type CodexJournalTranslatorDeps,
  type CodexJournalTranslationAdmission
} from './codex-structured-journal-contracts'

export function resetCodexContextUsage(deps: CodexJournalTranslatorDeps): void {
  writeAgentJournalTurnRow(
    deps.sink,
    { newest: true },
    {
      contextUsage: { used: { kind: 'unknown', capturedAt: deps.now?.() ?? Date.now() } }
    },
    { publish: true }
  )
}

export function publishCodexContextUsage(
  deps: CodexJournalTranslatorDeps,
  threadId: string,
  params: unknown,
  requestModel: string | null
): CodexJournalTranslationAdmission {
  if (threadId !== deps.primaryThreadId?.()) {
    return CODEX_JOURNAL_ADMITTED
  }
  const usage = readRecord(readRecord(params).tokenUsage)
  const last = readCodexUsageCounts(usage.last)
  const window = usage.modelContextWindow
  const capturedAt = deps.now?.() ?? Date.now()
  const model = requestModel
  const facts: AgentSessionContextUsage = {
    used:
      last && typeof window === 'number' && Number.isFinite(window) && window > 0
        ? {
            kind: 'estimate',
            usedTokens: last.totalTokens,
            usage: {
              inputTokens: last.inputTokens,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
              outputTokens: last.outputTokens
            },
            capturedAt
          }
        : { kind: 'unknown', capturedAt },
    ...(typeof window === 'number' && Number.isFinite(window) && window > 0
      ? { window: { tokens: window, capturedAt } }
      : {})
  }
  const revise = deps.sink.tryReviseResolvedItemAndPublish
  if (!revise) {
    return CODEX_JOURNAL_ADMITTED
  }
  return revise.call(
    deps.sink,
    64 * 1024,
    (journal) => {
      let previous: AgentSessionConsumption | undefined
      let latestSequence = -1
      journal.visitItems((_id, sequence, body) => {
        const session = readAgentJournalTurn(body)?.contextUsage?.session
        if (session && sequence >= latestSequence) {
          previous = session
          latestSequence = sequence
        }
      })
      const total = readCodexUsageCounts(usage.total)
      if (
        previous?.threadId === threadId &&
        total &&
        total.totalTokens < previous.baseline.totalTokens
      ) {
        return null
      }
      const session = codexSessionConsumption(params, previous, model, capturedAt)
      return resolveAgentJournalTurnRowWrite(
        journal,
        { newest: true },
        {
          contextUsage: { ...facts, ...(session ? { session } : {}) }
        },
        64 * 1024
      )
    },
    { turnScope: AGENT_JOURNAL_THREAD_SCOPE }
  )
}

export function handleCodexContextUsage(
  deps: CodexJournalTranslatorDeps,
  event: { threadId: string; method: string; params: unknown },
  requestModel: string | null
): CodexJournalTranslationAdmission | null {
  if (event.method === 'thread/tokenUsage/updated') {
    return publishCodexContextUsage(deps, event.threadId, event.params, requestModel)
  }
  if (
    event.threadId === deps.primaryThreadId?.() &&
    (event.method === 'thread/compacted' ||
      (event.method === 'item/completed' &&
        readRecord(readRecord(event.params).item).type === 'contextCompaction'))
  ) {
    resetCodexContextUsage(deps)
  }
  return null
}
