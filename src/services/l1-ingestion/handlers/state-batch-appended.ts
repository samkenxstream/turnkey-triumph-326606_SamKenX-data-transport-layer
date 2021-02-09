import { EventStateBatchAppended, StateRootBatchEntry } from '../../../types'
import { EventHandlerSet } from './types'

export const handleEventsStateBatchAppended: EventHandlerSet<
  EventStateBatchAppended,
  null,
  StateRootBatchEntry
> = {
  fixEventsHandler: async (events) => {
    // TODO
    return events.map((event) => {
      return {
        event,
        extraData: null,
      }
    })
  },
  parseEventsHandler: async (events) => {
    // TODO
    return events.map((event) => {
      return
    })
  },
  storeEventsHandler: async (entries, db) => {
    // TODO
  },
}
