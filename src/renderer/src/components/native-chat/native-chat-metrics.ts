import type { AgentSessionConsumption } from '../../../../shared/agent-session-context-usage'

export type NativeChatMetricsTiming = {
  running: boolean
  workingStartedAt: number | null
  lastRunSeconds: number | null
  conversationStartedAtLocal: number | null
  isVisible: boolean
}

export type NativeChatMetrics = {
  timing?: NativeChatMetricsTiming
  session: AgentSessionConsumption | null
  queued: number | null
  paused: boolean
  revealQueue: () => void
}
