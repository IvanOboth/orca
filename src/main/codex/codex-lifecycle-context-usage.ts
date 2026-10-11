import { readAgentJournalTurn } from '../../shared/agent-session-turn-record'
import { agentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import { agentJournalTurnRowReservedBytes } from '../native-chat/agent-session-timeline/agent-journal-turn-row-revision'
import type { JournalLifecycleIdentityMutationInput } from '../native-chat/agent-session-journal/journal-row-builders'
import type { StructuredAgentSessionTransitionJournal } from '../native-chat/agent-session-wire/structured-agent-session-transition'

/** Lifecycle settlement owns the turn's verdict, while usage facts remain the journal's. */
export function codexLifecycleMutationsWithContext(
  journal: Pick<StructuredAgentSessionTransitionJournal, 'itemBody'>,
  mutations: readonly JournalLifecycleIdentityMutationInput[]
): JournalLifecycleIdentityMutationInput[] {
  return mutations.map((mutation) => {
    if (mutation.kind !== 'item' || mutation.body.kind !== 'turn') {
      return mutation
    }
    const contextUsage = readAgentJournalTurn(
      journal.itemBody(agentJournalItemKey(mutation.identity)) ?? undefined
    )?.contextUsage
    return contextUsage
      ? {
          ...mutation,
          body: {
            ...mutation.body,
            contextUsage: { ...contextUsage, ...mutation.body.contextUsage }
          }
        }
      : mutation
  })
}

/** Admission includes the bounded facts the turn may gain before this settlement executes. */
export function codexLifecycleMutationsReservedBytes(
  mutations: readonly JournalLifecycleIdentityMutationInput[]
): number {
  return (
    Buffer.byteLength(JSON.stringify(mutations), 'utf8') +
    512 +
    mutations.reduce(
      (bytes, mutation) =>
        bytes +
        (mutation.kind === 'item' && mutation.body.kind === 'turn'
          ? agentJournalTurnRowReservedBytes(
              { identity: mutation.identity },
              { lifecycle: mutation.body }
            )
          : 0),
      0
    )
  )
}
