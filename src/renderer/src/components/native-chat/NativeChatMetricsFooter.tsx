import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import type { NativeChatMetrics } from './native-chat-metrics'
import type { NativeChatContextUsageSummary } from './native-chat-context-usage-summary'
import { formatContextTokenCount } from './native-chat-context-usage-summary'
import { NativeChatContextUsageRing } from './NativeChatContextUsageRing'
import { NativeChatMetricsTimers } from './NativeChatMetricsTimers'

export function NativeChatMetricsFooter({
  context,
  metrics
}: {
  context: NativeChatContextUsageSummary | null | undefined
  metrics: NativeChatMetrics
}): React.JSX.Element {
  const { session } = metrics
  const unavailable = translate('components.native-chat.metrics.unavailable', 'Unavailable')
  const count = (value: number) => value.toLocaleString()
  return (
    <div
      data-native-chat-metrics=""
      className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
    >
      <div className="flex items-center gap-1">
        {context ? <NativeChatContextUsageRing usage={context} /> : null}
        <span>
          {translate('components.native-chat.metrics.context', 'Context')}{' '}
          {context ? `${context.estimated ? '~' : ''}${context.percentage}%` : unavailable}
        </span>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="pointer-coarse:min-h-11">
            {translate('components.native-chat.metrics.session', 'Session')}{' '}
            {session ? formatContextTokenCount(session.totalTokens) : unavailable}
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="max-w-[calc(100vw-2rem)]">
          <div className="space-y-2 text-xs">
            <p className="font-medium">
              {translate(
                'components.native-chat.metrics.sessionTokens',
                'Conversation session tokens'
              )}
            </p>
            {session ? (
              <dl className="grid grid-cols-2 gap-1 tabular-nums">
                <dt>{translate('components.native-chat.metrics.total', 'Total')}</dt>
                <dd className="text-right">{count(session.totalTokens)}</dd>
                <dt>{translate('components.native-chat.metrics.input', 'Input')}</dt>
                <dd className="text-right">{count(session.inputTokens)}</dd>
                <dt>
                  {translate('components.native-chat.metrics.cached', 'Cached input (included)')}
                </dt>
                <dd className="text-right">{count(session.cachedInputTokens)}</dd>
                <dt>{translate('components.native-chat.metrics.output', 'Output')}</dt>
                <dd className="text-right">{count(session.outputTokens)}</dd>
                <dt>
                  {translate('components.native-chat.metrics.reasoning', 'Reasoning (in output)')}
                </dt>
                <dd className="text-right">{count(session.reasoningOutputTokens)}</dd>
              </dl>
            ) : (
              <p>{unavailable}</p>
            )}
            <p>
              {translate(
                'components.native-chat.metrics.scope',
                'Main conversation only. Child agents are excluded. Context resets do not reset session tokens.'
              )}
            </p>
            <p>
              {translate(
                'components.native-chat.metrics.apiValue',
                'Estimated API-equivalent value'
              )}
              :{' '}
              {session &&
              (session.unpricedTokens < session.totalTokens || session.totalTokens === 0)
                ? `$${session.estimatedCostUsd.toFixed(4)}`
                : unavailable}
              {session && session.unpricedTokens > 0
                ? ` · ${translate('components.native-chat.metrics.partial', 'Partial; {{tokens}} tokens have no price', { tokens: count(session.unpricedTokens) })}`
                : ''}
            </p>
            <p className="text-muted-foreground">
              {translate(
                'components.native-chat.metrics.valueExplanation',
                'Based on reported usage and API list prices. Subscription usage is not actual spend.'
              )}
            </p>
          </div>
        </PopoverContent>
      </Popover>
      <NativeChatMetricsTimers timing={metrics.timing} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="pointer-coarse:min-h-11"
        onClick={metrics.revealQueue}
        disabled={metrics.queued === null || metrics.queued === 0}
      >
        {translate('components.native-chat.metrics.queued', 'Queued')}{' '}
        {metrics.queued ?? unavailable}
        {metrics.paused ? ` · ${translate('components.native-chat.metrics.paused', 'Paused')}` : ''}
      </Button>
    </div>
  )
}
