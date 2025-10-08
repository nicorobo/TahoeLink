import { type SSEStreamingApi } from 'hono/streaming'
import type { EventName } from '@tahoelink/shared'

export const sendEvent = async (stream: SSEStreamingApi, event: EventName, data: any = {}) => stream.writeSSE({
    data: JSON.stringify(data),
    event,
})