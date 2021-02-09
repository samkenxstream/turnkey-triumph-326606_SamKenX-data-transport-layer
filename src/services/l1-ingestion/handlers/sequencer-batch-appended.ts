import {
  EventSequencerBatchAppended,
  TransactionBatchEntry,
} from '../../../types'
import { EventHandlerSet } from './types'

export const handleEventsSequencerBatchAppended: EventHandlerSet<
  EventSequencerBatchAppended,
  null,
  TransactionBatchEntry
> = {
  fixEventsHandler: async (events) => {
    return events.map((event) => {
      // TODO
    })
  },
  parseEventsHandler: async (events) => {
    return events.map((event) => {
      // TODO
    })
  },
  storeEventsHandler: async (entries, db) => {
    // TODO
  },
}
