/* Imports: Internal */
import { ctcCoder } from '@eth-optimism/core-utils'
import { BigNumber } from 'ethers'
import { TransportDB } from '../../../db/transport-db'
import {
  DecodedSequencerBatchTransaction,
  StateRootEntry,
  TransactionEntry,
} from '../../../types'

export const handleSequencerBlock = {
  parseBlock: async (
    block: any
  ): Promise<{
    transactionEntry: TransactionEntry
    stateRootEntry: StateRootEntry
  }> => {
    const transaction = block.transactions[0]

    let transactionEntry: TransactionEntry
    if (transaction.queueOrigin === 'sequencer') {
      const decodedTransaction = {
        sig: {
          v: BigNumber.from(transaction.v).toNumber(),
          r: transaction.r,
          s: transaction.s,
        },
        gasLimit: BigNumber.from(transaction.gas).toNumber(),
        gasPrice: BigNumber.from(transaction.gasPrice).toNumber(), // ?
        nonce: BigNumber.from(transaction.nonce).toNumber(),
        target: transaction.to,
        data: transaction.input,
      }

      transactionEntry = {
        index: BigNumber.from(transaction.index).toNumber(),
        batchIndex: null,
        data: maybeEncodeSequencerBatchTransaction(
          decodedTransaction,
          transaction.txType
        ),
        blockNumber: BigNumber.from(transaction.l1BlockNumber).toNumber(),
        timestamp: BigNumber.from(transaction.l1Timestamp).toNumber(),
        gasLimit: 8_000_000, // ?
        target: '0x4200000000000000000000000000000000000005',
        origin: null,
        queueOrigin: transaction.queueOrigin,
        queueIndex: transaction.queueIndex,
        type: transaction.txType,
        decoded: decodedTransaction,
        confirmed: false,
      }
    } else {
      // TODO: Confirm that this is correct.
      transactionEntry = {
        index: BigNumber.from(transaction.index).toNumber(),
        batchIndex: null,
        data: transaction.input,
        blockNumber: BigNumber.from(transaction.l1BlockNumber).toNumber(),
        timestamp: BigNumber.from(transaction.l1Timestamp).toNumber(),
        gasLimit: BigNumber.from(transaction.gas).toNumber(),
        target: transaction.to,
        origin: transaction.l1TxOrigin,
        queueOrigin: transaction.queueOrigin,
        queueIndex: transaction.queueIndex,
        type: transaction.txType,
        decoded: null,
        confirmed: false,
      }
    }

    const stateRootEntry: StateRootEntry = {
      index: BigNumber.from(transaction.index).toNumber(),
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

const maybeEncodeSequencerBatchTransaction = (
  transaction: DecodedSequencerBatchTransaction,
  type: 'EIP155' | 'ETH_SIGN' | null
): string => {
  if (type === 'EIP155') {
    return ctcCoder.eip155TxData.encode(transaction)
  } else if (type === 'ETH_SIGN') {
    return ctcCoder.ethSignTxData.encode(transaction)
  } else {
    // Throw?
    return
  }
}
