import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { formatNativeChatDuration } from '../../../../shared/native-chat-turn-status'
import type { NativeChatMetricsTiming } from './native-chat-metrics'

/** Only this footer child subscribes to the shared, visibility-gated second clock. */
export function NativeChatMetricsTimers({
  timing
}: {
  timing?: NativeChatMetricsTiming
}): React.JSX.Element {
  const now = useNow(
    1000,
    timing?.isVisible === true &&
      (timing.conversationStartedAtLocal !== null ||
        (timing.running && timing.workingStartedAt !== null))
  )
  const duration = (seconds: number | null | undefined) =>
    seconds == null
      ? translate('components.native-chat.metrics.unavailable', 'Unavailable')
      : formatNativeChatDuration(seconds)
  const elapsed = (start: number | null | undefined) =>
    start == null ? null : Math.max(0, (now - start) / 1000)
  const run = duration(timing?.running ? elapsed(timing.workingStartedAt) : timing?.lastRunSeconds)
  const conversation = duration(elapsed(timing?.conversationStartedAtLocal))
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="pointer-coarse:min-h-11">
          <span className="flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
            <span>
              {timing?.running
                ? translate('components.native-chat.metrics.run', 'Run')
                : translate('components.native-chat.metrics.last', 'Last')}{' '}
              {run}
            </span>
            <span>
              {translate('components.native-chat.metrics.conversation', 'Conversation')}{' '}
              {conversation}
            </span>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="max-w-[calc(100vw-2rem)]">
        <div className="space-y-2 text-xs">
          <p>
            {translate(
              'components.native-chat.metrics.runTiming',
              'Run is elapsed time for the current response; Last is the host-recorded duration of the latest finished response.'
            )}
          </p>
          <p>
            {translate(
              'components.native-chat.metrics.conversationTiming',
              'Conversation age since Orca created this conversation, including idle time.'
            )}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
