import { EnqueueEntry, EventTransactionEnqueued } from '../../../types'
import { EventHandlerSet } from './types'

export const handleEventsTransactionEnqueued: EventHandlerSet<
  EventTransactionEnqueued,
  null,
  EnqueueEntry
> = {
  fixEventsHandler: async (events) => {
    return events.map((event) => {
      return {
        ...event,
        extraData: null,
      }
    })
  },
  parseEventsHandler: async (events) => {
    return events.map((event) => {
      return {
        index: event.args._queueIndex.toNumber(),
        target: event.args._target,
        data: event.args._data,
        gasLimit: event.args._gasLimit.toNumber(),
        origin: event.args._l1TxOrigin,
        blockNumber: event.blockNumber,
        timestamp: event.args._timestamp.toNumber(),
        ctcIndex: null,
      }
    })
  },
  storeEventsHandler: async (entries, db) => {
    await db.putEnqueueEntries(entries)
  },
}
