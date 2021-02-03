import {
  ctcCoder,
  fromHexString,
  toHexString,
  TxType,
} from '@eth-optimism/core-utils'
import { getContractInterface } from '@eth-optimism/contracts'
import { BigNumber } from 'ethers'
import { Interface } from 'ethers/lib/utils'
import {
  EventSequencerBatchAppended,
  EventStateBatchAppended,
  EventTransactionBatchAppended,
  EventTransactionEnqueued,
  EnqueueEntry,
  StateRootBatchEntry,
  StateRootEntry,
  TransactionBatchEntry,
  TransactionEntry,
  DecodedSequencerBatchTransaction,
} from '../../types'

export interface SequencerBatchContext {
  numSequencedTransactions: number
  numSubsequentQueueTransactions: number
  timestamp: number
  blockNumber: number
}

export const parseNumContexts = (calldata: Buffer): number => {
  return BigNumber.from(calldata.slice(12, 15)).toNumber()
}

export const parseSequencerBatchContext = (
  calldata: Buffer,
  offset: number
): SequencerBatchContext => {
  return {
    numSequencedTransactions: BigNumber.from(
      calldata.slice(offset, offset + 3)
    ).toNumber(),
    numSubsequentQueueTransactions: BigNumber.from(
      calldata.slice(offset + 3, offset + 6)
    ).toNumber(),
    timestamp: BigNumber.from(
      calldata.slice(offset + 6, offset + 11)
    ).toNumber(),
    blockNumber: BigNumber.from(
      calldata.slice(offset + 11, offset + 16)
    ).toNumber(),
  }
}

export const parseSequencerBatchTransaction = (
  calldata: Buffer,
  offset: number
): Buffer => {
  const transactionLength = BigNumber.from(
    calldata.slice(offset, offset + 3)
  ).toNumber()

  return calldata.slice(offset + 3, offset + 3 + transactionLength)
}

export const maybeDecodeSequencerBatchTransaction = (
  transaction: Buffer
): {
  decoded: DecodedSequencerBatchTransaction | null
  type: 'EIP155' | 'ETH_SIGN' | null
} => {
  let decoded = null
  let type = null

  try {
    const txType = transaction.slice(0, 1).readUInt8()
    if (txType === TxType.EIP155) {
      type = 'EIP155'
      decoded = ctcCoder.eip155TxData.decode(transaction.toString('hex'))
    } else if (txType === TxType.EthSign) {
      type = 'ETH_SIGN'
      decoded = ctcCoder.ethSignTxData.decode(transaction.toString('hex'))
    } else {
      throw new Error(`Unknown sequencer transaction type.`)
    }
  } catch (err) {
    // TODO: What should we do if this fails?
  }

  return {
    decoded,
    type,
  }
}

const iOVM_StateCommitmentChain: Interface = getContractInterface(
  'iOVM_StateCommitmentChain'
)

export const parseStateRoots = (calldata: string): string[] => {
  // TODO: Currently only works because we assume that `appendStateBatch` is only being
  // called by externally owned accounts. Also, will start failing if we ever change the
  // function signature of `appendStateBatch`.
  return iOVM_StateCommitmentChain.decodeFunctionData(
    'appendStateBatch',
    calldata
  )[0]
}

export const parseEventTransactionEnqueued = (
  event: EventTransactionEnqueued
): EnqueueEntry => {
  return {
    index: event.args._queueIndex.toNumber(),
    target: event.args._target,
    data: event.args._data,
    gasLimit: event.args._gasLimit.toNumber(),
    origin: event.args._l1TxOrigin,
    blockNumber: event.blockNumber,
    timestamp: event.args._timestamp.toNumber(),
  }
}

export const parseEventStateBatchAppended = async (
  eventBlock: any, // Ethers block, no clue where that type is.
  event: EventStateBatchAppended
): Promise<{
  stateRootBatchEntry: StateRootBatchEntry
  stateRootEntries: StateRootEntry[]
}> => {
  const l1Transaction = await event.getTransaction()

  // TODO: Make sure we handle the case when this parsing fails.
  const rawStateRoots = parseStateRoots(l1Transaction.data)

  const stateRootEntries: StateRootEntry[] = []
  for (let i = 0; i < rawStateRoots.length; i++) {
    stateRootEntries.push({
      index: event.args._prevTotalElements.toNumber() + i,
      batchIndex: event.args._batchIndex.toNumber(),
      value: rawStateRoots[i],
    })
  }

  const stateRootBatchEntry = {
    index: event.args._batchIndex.toNumber(),
    blockNumber: eventBlock.number,
    timestamp: eventBlock.timestamp,
    submitter: l1Transaction.from,
    size: event.args._batchSize.toNumber(),
    root: event.args._batchRoot,
    prevTotalElements: event.args._prevTotalElements.toNumber(),
    extraData: event.args._extraData,
  }

  return {
    stateRootBatchEntry,
    stateRootEntries,
  }
}

// TODO: Ugh. We need to update SequencerBatchAppended to have all of the information of
// TransactionBatchAppended. Doing this for now. Just assume all of this information ends up
// in a single event.
export const parseEventSequencerBatchAppended = async (
  gasLimit: number,
  eventBlock: any, // Ethers block, no clue where that type is.
  eventA: EventTransactionBatchAppended,
  eventB: EventSequencerBatchAppended
): Promise<{
  transactionBatchEntry: TransactionBatchEntry
  transactionEntries: TransactionEntry[]
}> => {
  const transactionEntries: TransactionEntry[] = []

  // TODO: I don't think this is the right place to be doing this. Makes the
  // whole thing async which is kinda lame.
  const l1Transaction = await eventA.getTransaction()

  // It's easier to deal with this data if it's a Buffer.
  const calldata = fromHexString(l1Transaction.data)

  const numContexts = parseNumContexts(calldata)
  let transactionIndex = 0
  let enqueuedCount = 0
  let nextTxPointer = 15 + 16 * numContexts
  for (let i = 0; i < numContexts; i++) {
    const contextPointer = 15 + 16 * i
    const context = parseSequencerBatchContext(calldata, contextPointer)

    for (let j = 0; j < context.numSequencedTransactions; j++) {
      const sequencerTransaction = parseSequencerBatchTransaction(
        calldata,
        nextTxPointer
      )

      const { decoded, type } = maybeDecodeSequencerBatchTransaction(
        sequencerTransaction
      )

      transactionEntries.push({
        index: eventA.args._prevTotalElements.toNumber() + transactionIndex,
        batchIndex: eventA.args._batchIndex.toNumber(),
        blockNumber: context.blockNumber,
        timestamp: context.timestamp,
        gasLimit,
        target: '0x4200000000000000000000000000000000000005', // TODO: Maybe this needs to be configurable?
        origin: '0x0000000000000000000000000000000000000000', // TODO: Also this.
        data: toHexString(sequencerTransaction),
        queueOrigin: 'sequencer',
        type,
        queueIndex: null,
        decoded,
      })

      nextTxPointer += 3 + sequencerTransaction.length
      transactionIndex++
    }

    for (let j = 0; j < context.numSubsequentQueueTransactions; j++) {
      const queueIndex =
        eventB.args._startingQueueIndex.toNumber() + enqueuedCount

      // Okay, so. Since events are processed in parallel, we don't know if the Enqueue
      // event associated with this queue element has already been processed. So we'll ask
      // the api to fetch that data for itself later on and we use fake values for some
      // fields. The real TODO here is to make sure we fix this data structure to avoid ugly
      // "dummy" fields.
      transactionEntries.push({
        index: eventA.args._prevTotalElements.toNumber() + transactionIndex,
        batchIndex: eventA.args._batchIndex.toNumber(),
        blockNumber: 0,
        timestamp: 0,
        gasLimit: 0,
        target: '0x0000000000000000000000000000000000000000',
        origin: '0x0000000000000000000000000000000000000000',
        data: '0x',
        queueOrigin: 'l1',
        type: 'EIP155',
        queueIndex,
        decoded: null,
      })

      enqueuedCount++
      transactionIndex++
    }
  }

  const transactionBatchEntry = {
    index: eventA.args._batchIndex.toNumber(),
    root: eventA.args._batchRoot,
    size: eventA.args._batchSize.toNumber(),
    prevTotalElements: eventA.args._prevTotalElements.toNumber(),
    extraData: eventA.args._extraData,
    blockNumber: BigNumber.from(eventBlock.number).toNumber(),
    timestamp: BigNumber.from(eventBlock.timestamp).toNumber(),
    submitter: l1Transaction.from,
  }

  return {
    transactionBatchEntry,
    transactionEntries,
  }
}
