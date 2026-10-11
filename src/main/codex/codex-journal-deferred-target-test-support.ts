import { vi } from 'vitest'
import type {
  AgentJournalItemBody,
  AgentJournalItemIdentity
} from '../../shared/agent-session-journal-types'
import { agentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import type { JournalLifecycleMutationInput } from '../native-chat/agent-session-journal/journal-row-builders'
import type { StructuredAgentSessionEventTarget } from '../native-chat/agent-session-wire/structured-agent-session-event-sink'
import { withJournalQueueMembers } from '../native-chat/agent-session-wire/structured-agent-session-journal-double-test-support'

export function deferredTarget(
  log: AgentJournalItemBody[],
  publishes: string[] = []
): StructuredAgentSessionEventTarget {
  const current = new Map<string, AgentJournalItemBody>()
  return {
    fence: 7,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a double for the journal members this path calls; the helper adds the in-order ones.
    journal: withJournalQueueMembers({
      epoch: 'e',
      itemBody: (id: string) => current.get(id) ?? null,
      appendItem: vi.fn(async (_identity: AgentJournalItemIdentity, body: AgentJournalItemBody) => {
        current.set(agentJournalItemKey(_identity), body)
        log.push(body)
        return { cursor: { epoch: 'e', sequence: log.length } }
      }),
      appendTombstone: vi.fn(async () => ({ epoch: 'e', sequence: log.length })),
      appendLifecycleBatch: vi.fn(
        async (input: { mutations: readonly JournalLifecycleMutationInput[] }) => {
          for (const mutation of input.mutations) {
            if (mutation.kind === 'item') {
              const id =
                mutation.itemId ??
                (mutation.identity ? agentJournalItemKey(mutation.identity) : null)
              if (id) {
                current.set(id, mutation.body)
              }
              log.push(mutation.body)
            }
          }
          return { epoch: 'e', sequence: log.length }
        }
      )
    }) as unknown as StructuredAgentSessionEventTarget['journal'],
    publish: vi.fn(() => {
      publishes.push('publish')
    })
  }
}
