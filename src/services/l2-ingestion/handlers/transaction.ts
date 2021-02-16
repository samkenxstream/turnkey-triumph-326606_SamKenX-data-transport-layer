/* Imports: Internal */
import { TransportDB } from '../../../db/transport-db'
import { StateRootEntry, TransactionEntry } from '../../../types'

export const handleSequencerBlock = {
  parseBlock: async (
    block: any
  ): Promise<{
    transactionEntry: TransactionEntry
    stateRootEntry: StateRootEntry
  }> => {
    // TODO: This, clearly.
    return
  },
  storeBlock: async (
    entry: {
      transactionEntry: TransactionEntry
      stateRootEntry: StateRootEntry
    },
    db: TransportDB
  ): Promise<void> => {
    // Some repeated code here that I don't love, but whatever for now. My primary concern is
    // that we may have a race condition here where an unconfirmed transaction can overwrite a
    // confirmed transaction. The !== null checks below are intended to fix this issue in the
    // average case, but could potentially fail if this query happens immediately before the
    // confirmed transaction is written to the database. Not sure of the cleanest way to handle
    // this issue.

    const existingTransaction = await db.getTransactionByIndex(
      entry.transactionEntry.index
    )

    if (existingTransaction !== null) {
      await db.putTransactionEntries([entry.transactionEntry])
    }

    const existingStateRoot = await db.getStateRootByIndex(
      entry.stateRootEntry.index
    )

    if (existingStateRoot !== null) {
      await db.putStateRootEntries([entry.stateRootEntry])
    }
  },
}
