import { ctcCoder, TxType } from '@eth-optimism/core-utils'
import { getContractInterface } from '@eth-optimism/contracts'
import { BigNumber } from 'ethers'
import { Interface } from 'ethers/lib/utils'
import { EventTransactionEnqueued } from './event-types'
import { EnqueueEntry } from '../../db/db'

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

interface DecodedSequencerBatchTransaction {
  sig: {
    r: string
    s: string
    v: string
  }
  gasLimit: number
  gasPrice: number
  nonce: number
  target: string
  data: string
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

const iOVM_StateCommitmentChain: Interface = getContractInterface('iOVM_StateCommitmentChain')

export const parseStateRoots = (calldata: string): string[] => {
  // TODO: Currently only works because we assume that `appendStateBatch` is only being
  // called by externally owned accounts. Also, will start failing if we ever change the
  // function signature of `appendStateBatch`. 
  return iOVM_StateCommitmentChain.decodeFunctionData(
    'appendStateBatch',
    calldata
  )[0]
}

export const parseEventTransactionEnqueued = (event: EventTransactionEnqueued): EnqueueEntry => {
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
