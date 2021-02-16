/* Imports: Internal */
import { BigNumber } from 'ethers'
import { TransportDB } from '../../../db/transport-db'
import { StateRootEntry, TransactionEntry } from '../../../types'

export const handleSequencerBlock = {
  parseBlock: async (
    block: any
  ): Promise<{
    transactionEntry: TransactionEntry
    stateRootEntry: StateRootEntry
  }> => {
    const transaction = block.transactions[0]

    const transactionEntry: TransactionEntry = {
      index: BigNumber.from(block.number).toNumber() - 1,
      batchIndex: null,
      data: transaction.input,
      blockNumber: BigNumber.from(transaction.l1BlockNumber).toNumber(),
      timestamp: BigNumber.from(transaction.l1Timestamp).toNumber(),
      gasLimit: BigNumber.from(transaction.gas).toNumber(),
      target: transaction.to,
      origin: transaction.from,
      queueOrigin: transaction.queueOrigin,
      queueIndex: transaction.queueIndex,
      type: transaction.txType,
      decoded: null,
      confirmed: false,
    }

    const stateRootEntry: StateRootEntry = {
      index: BigNumber.from(block.number).toNumber() - 1,
      batchIndex: null,
      value: block.stateRoot,
      confirmed: false,
    }

    return {
      transactionEntry,
      stateRootEntry,
    }
  },
  storeBlock: async (
    entry: {
      transactionEntry: TransactionEntry
      stateRootEntry: StateRootEntry
    },
    db: TransportDB
  ): Promise<void> => {
    // Having separate indices for confirmed/unconfirmed means we never have to worry about
    // accidentally overwriting a confirmed transaction with an unconfirmed one. Unconfirmed
    // transactions are purely extra information.
    await db.putUnconfirmedTransactionEntries([entry.transactionEntry])
    await db.putUnconfirmedStateRootEntries([entry.stateRootEntry])
  },
}
