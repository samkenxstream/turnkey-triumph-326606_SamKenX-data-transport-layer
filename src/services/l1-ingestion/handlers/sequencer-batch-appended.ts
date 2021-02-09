/* Imports: External */
import { BigNumber, ethers } from 'ethers'
import { getContractFactory } from '@eth-optimism/contracts'
import {
  ctcCoder,
  fromHexString,
  toHexString,
  TxType,
} from '@eth-optimism/core-utils'

/* Imports: Internal */
import {
  DecodedSequencerBatchTransaction,
  EventSequencerBatchAppended,
  TransactionBatchEntry,
  TransactionEntry,
  EventHandlerSet,
} from '../../../types'

export const handleEventsSequencerBatchAppended: EventHandlerSet<
  EventSequencerBatchAppended,
  {
    timestamp: number
    blockNumber: number
    submitter: string
    l1TransactionData: string
    l1TransactionHash: string
    gasLimit: number

    // Stuff from TransactionBatchAppended.
    prevTotalElements: BigNumber
    batchIndex: BigNumber
    batchSize: BigNumber
    batchRoot: string
    batchExtraData: string
  },
  {
    transactionBatchEntry: TransactionBatchEntry
    transactionEntries: TransactionEntry[]
  }
> = {
  fixEventsHandler: async (event, l1RpcProvider) => {
    const l1Transaction = await event.getTransaction()
    const eventBlock = await event.getBlock()

    // TODO: We need to update our events so that we actually have enough information to parse this
    // batch without having to pull out this extra event. For the meantime, we need to find this
    // "TransactonBatchAppended" event to get the rest of the data.
    const OVM_CanonicalTransactionChain = getContractFactory(
      'OVM_CanonicalTransactionChain'
    )
      .attach(event.address)
      .connect(l1RpcProvider)

    const batchSubmissionEvent = (
      await OVM_CanonicalTransactionChain.queryFilter(
        OVM_CanonicalTransactionChain.filters.TransactionBatchAppended(),
        eventBlock.number,
        eventBlock.number
      )
    ).find((foundEvent: ethers.Event) => {
      // We might have more than one event in this block, so we specifically want to find a
      // "TransactonBatchAppended" event emitted immediately before the event in question.
      return (
        foundEvent.transactionHash === event.transactionHash &&
        foundEvent.logIndex === event.logIndex - 1
      )
    })

    if (!batchSubmissionEvent) {
      throw new Error(
        `Well, this really shouldn't happen. A SequencerBatchAppended event doesn't have a corresponding TransactionBatchAppended event.`
      )
    }

    return {
      event,
      extraData: {
        timestamp: eventBlock.timestamp,
        blockNumber: eventBlock.number,
        submitter: l1Transaction.from,
        l1TransactionHash: l1Transaction.hash,
        l1TransactionData: l1Transaction.data,
        gasLimit: 8_000_000, // Fixed to this currently.

        prevTotalElements: batchSubmissionEvent.args._prevTotalElements,
        batchIndex: batchSubmissionEvent.args._batchIndex,
        batchSize: batchSubmissionEvent.args._batchSize,
        batchRoot: batchSubmissionEvent.args._batchRoot,
        batchExtraData: batchSubmissionEvent.args._extraData,
      },
    }
  },
  parseEventsHandler: async (fixedEvent) => {
    const transactionEntries: TransactionEntry[] = []

    // It's easier to deal with this data if it's a Buffer.
    const calldata = fromHexString(fixedEvent.extraData.l1TransactionData)

    const numContexts = BigNumber.from(calldata.slice(12, 15)).toNumber()
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
          index:
            fixedEvent.extraData.prevTotalElements.toNumber() +
            transactionIndex,
          batchIndex: fixedEvent.extraData.batchIndex.toNumber(),
          blockNumber: context.blockNumber,
          timestamp: context.timestamp,
          gasLimit: fixedEvent.extraData.gasLimit,
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
          fixedEvent.event.args._startingQueueIndex.toNumber() + enqueuedCount

        // Okay, so. Since events are processed in parallel, we don't know if the Enqueue
        // event associated with this queue element has already been processed. So we'll ask
        // the api to fetch that data for itself later on and we use fake values for some
        // fields. The real TODO here is to make sure we fix this data structure to avoid ugly
        // "dummy" fields.
        transactionEntries.push({
          index:
            fixedEvent.extraData.prevTotalElements.toNumber() +
            transactionIndex,
          batchIndex: fixedEvent.extraData.batchIndex.toNumber(),
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
      index: fixedEvent.extraData.batchIndex.toNumber(),
      root: fixedEvent.extraData.batchRoot,
      size: fixedEvent.extraData.batchSize.toNumber(),
      prevTotalElements: fixedEvent.extraData.prevTotalElements.toNumber(),
      extraData: fixedEvent.extraData.batchExtraData,
      blockNumber: fixedEvent.extraData.blockNumber,
      timestamp: fixedEvent.extraData.timestamp,
      submitter: fixedEvent.extraData.submitter,
      l1TransactionHash: fixedEvent.extraData.l1TransactionHash,
    }

    return {
      transactionBatchEntry,
      transactionEntries,
    }
  },
  storeEventsHandler: async (entry, db) => {
    await db.putTransactionBatchEntries([entry.transactionBatchEntry])
    await db.putTransactionEntries(entry.transactionEntries)

    // Add an additional field to the enqueued transactions in the database
    // if they have already been confirmed
    for (const transactionEntry of entry.transactionEntries) {
      if (transactionEntry.queueOrigin === 'l1') {
        await db.putTransactionIndexByQueueIndex(
          transactionEntry.index,
          transactionEntry.queueIndex
        )
      }
    }
  },
}

interface SequencerBatchContext {
  numSequencedTransactions: number
  numSubsequentQueueTransactions: number
  timestamp: number
  blockNumber: number
}

const parseSequencerBatchContext = (
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

const parseSequencerBatchTransaction = (
  calldata: Buffer,
  offset: number
): Buffer => {
  const transactionLength = BigNumber.from(
    calldata.slice(offset, offset + 3)
  ).toNumber()

  return calldata.slice(offset + 3, offset + 3 + transactionLength)
}

const maybeDecodeSequencerBatchTransaction = (
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
