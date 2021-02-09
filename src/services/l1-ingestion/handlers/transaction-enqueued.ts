/* Imports: Internal */
import {
  EnqueueEntry,
  EventTransactionEnqueued,
  EventHandlerSet,
} from '../../../types'

export const handleEventsTransactionEnqueued: EventHandlerSet<
  EventTransactionEnqueued,
  null,
  EnqueueEntry
> = {
  fixEventsHandler: async (event) => {
    return {
      event,
      extraData: null,
    }
  },
  parseEventsHandler: async (fixedEvent) => {
    return {
      index: fixedEvent.event.args._queueIndex.toNumber(),
      target: fixedEvent.event.args._target,
      data: fixedEvent.event.args._data,
      gasLimit: fixedEvent.event.args._gasLimit.toNumber(),
      origin: fixedEvent.event.args._l1TxOrigin,
      blockNumber: fixedEvent.event.blockNumber,
      timestamp: fixedEvent.event.args._timestamp.toNumber(),
      ctcIndex: null,
    }
  },
  storeEventsHandler: async (entry, db) => {
    await db.putEnqueueEntries([entry])
  },
}
