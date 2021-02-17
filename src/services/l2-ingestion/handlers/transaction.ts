/* Imports: Internal */
import { ctcCoder, ZERO_ADDRESS } from '@eth-optimism/core-utils'
import { BigNumber } from 'ethers'
import { TransportDB } from '../../../db/transport-db'
import {
  DecodedSequencerBatchTransaction,
  StateRootEntry,
  TransactionEntry,
} from '../../../types'
import {
  padHexString,
  SEQUENCER_ENTRYPOINT_ADDRESS,
  SEQUENCER_GAS_LIMIT,
} from '../../../utils'

export const handleSequencerBlock = {
  parseBlock: async (
    block: any,
    chainId: number
  ): Promise<{
    transactionEntry: TransactionEntry
    stateRootEntry: StateRootEntry
  }> => {
    const transaction = block.transactions[0]

    let transactionEntry: TransactionEntry
    if (transaction.queueOrigin === 'sequencer') {
      const decodedTransaction = {
        sig: {
          v: BigNumber.from(transaction.v).toNumber() - 2 * chainId - 35,
          r: padHexString(transaction.r, 32),
          s: padHexString(transaction.s, 32),
        },
        gasLimit: BigNumber.from(transaction.gas).toNumber(),
        gasPrice: BigNumber.from(transaction.gasPrice).toNumber(), // ?
        nonce: BigNumber.from(transaction.nonce).toNumber(),
        target: transaction.to || ZERO_ADDRESS, // ?
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
        gasLimit: SEQUENCER_GAS_LIMIT, // ?
        target: SEQUENCER_ENTRYPOINT_ADDRESS,
        origin: null,
        queueOrigin: transaction.queueOrigin,
        queueIndex: transaction.queueIndex,
        type: transaction.txType,
        decoded: decodedTransaction,
        confirmed: false,
      }
    } else {
      transactionEntry = {
        index: BigNumber.from(transaction.index).toNumber(),
        batchIndex: null,
        blockNumber: BigNumber.from(transaction.l1BlockNumber).toNumber(),
        timestamp: BigNumber.from(transaction.l1Timestamp).toNumber(),
        gasLimit: BigNumber.from(transaction.gas).toNumber(),
        target: transaction.to,
        origin: transaction.l1TxOrigin,
        data: transaction.input,
        queueOrigin: transaction.queueOrigin,
        type: transaction.txType,
        queueIndex: BigNumber.from(transaction.queueIndex).toNumber(),
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
  type: 'EIP155' | 'EthSign' | null
): string => {
  if (type === 'EIP155') {
    return ctcCoder.eip155TxData.encode(transaction)
  } else if (type === 'EthSign') {
    return ctcCoder.ethSignTxData.encode(transaction)
  } else {
    // Throw?
    return
  }
}
