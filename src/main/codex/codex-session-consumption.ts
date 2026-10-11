import type { AgentSessionConsumption } from '../../shared/agent-session-context-usage'
import { readRecord } from './codex-item-field-readers'
import { estimateCostUsd } from '../codex-usage/codex-usage-cost-estimate'
import { LONG_CONTEXT_THRESHOLD_TOKENS } from '../codex-usage/codex-model-pricing'

type Counts = AgentSessionConsumption['baseline']
const KEYS = [
  'totalTokens',
  'inputTokens',
  'cachedInputTokens',
  'outputTokens',
  'reasoningOutputTokens'
] as const

export function readCodexUsageCounts(value: unknown): Counts | null {
  const row = readRecord(value)
  const count = (key: string): number | null => {
    const value = row[key]
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
  }
  const totalTokens = count('totalTokens'),
    inputTokens = count('inputTokens'),
    cachedInputTokens = count('cachedInputTokens')
  const outputTokens = count('outputTokens'),
    reasoningOutputTokens = count('reasoningOutputTokens')
  if (
    totalTokens === null ||
    inputTokens === null ||
    cachedInputTokens === null ||
    outputTokens === null ||
    reasoningOutputTokens === null
  ) {
    return null
  }
  return { totalTokens, inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens }
}

/** Running totals replace the baseline; repeated frames never add consumption. */
export function codexSessionConsumption(
  params: unknown,
  previous: AgentSessionConsumption | undefined,
  model: string | null,
  capturedAt: number
): AgentSessionConsumption | null {
  const root = readRecord(params)
  const usage = readRecord(root.tokenUsage)
  const total = readCodexUsageCounts(usage.total)
  const last = readCodexUsageCounts(usage.last)
  const threadId = root.threadId
  if (!total || typeof threadId !== 'string' || !threadId || threadId.length > 256) {
    return null
  }
  const fingerprint = JSON.stringify([
    threadId,
    typeof root.turnId === 'string' ? root.turnId.slice(0, 256) : null,
    total,
    last
  ])
  if (previous?.fingerprint === fingerprint) {
    return previous
  }
  const sameThread = previous?.threadId === threadId
  const monotonic =
    previous && sameThread && KEYS.every((key) => total[key] >= previous.baseline[key])
  if (previous && sameThread && !monotonic) {
    return previous
  }
  const delta: Counts = !previous
    ? total
    : monotonic
      ? {
          totalTokens: total.totalTokens - previous.baseline.totalTokens,
          inputTokens: total.inputTokens - previous.baseline.inputTokens,
          cachedInputTokens: total.cachedInputTokens - previous.baseline.cachedInputTokens,
          outputTokens: total.outputTokens - previous.baseline.outputTokens,
          reasoningOutputTokens:
            total.reasoningOutputTokens - previous.baseline.reasoningOutputTokens
        }
      : (last ?? {
          totalTokens: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          reasoningOutputTokens: 0
        })
  // Only the last request proves a historical model and its context price tier.
  const priced = last && last.totalTokens <= delta.totalTokens ? last : null
  const long = (last?.inputTokens ?? delta.inputTokens) > LONG_CONTEXT_THRESHOLD_TOKENS
  const cacheWrites = readRecord(usage.last).cacheWriteInputTokens
  const cost =
    priced && (cacheWrites === undefined || cacheWrites === 0)
      ? estimateCostUsd(model, {
          ...priced,
          longContextInputTokens: long ? priced.inputTokens : 0,
          longContextCachedInputTokens: long ? priced.cachedInputTokens : 0,
          longContextOutputTokens: long ? priced.outputTokens : 0
        })
      : null
  return {
    totalTokens: (previous?.totalTokens ?? 0) + delta.totalTokens,
    inputTokens: (previous?.inputTokens ?? 0) + delta.inputTokens,
    cachedInputTokens: (previous?.cachedInputTokens ?? 0) + delta.cachedInputTokens,
    outputTokens: (previous?.outputTokens ?? 0) + delta.outputTokens,
    reasoningOutputTokens: (previous?.reasoningOutputTokens ?? 0) + delta.reasoningOutputTokens,
    estimatedCostUsd: (previous?.estimatedCostUsd ?? 0) + (cost ?? 0),
    unpricedTokens:
      (previous?.unpricedTokens ?? 0) +
      delta.totalTokens -
      (cost === null ? 0 : (priced?.totalTokens ?? 0)),
    baseline: total,
    threadId,
    fingerprint,
    model,
    capturedAt
  }
}
