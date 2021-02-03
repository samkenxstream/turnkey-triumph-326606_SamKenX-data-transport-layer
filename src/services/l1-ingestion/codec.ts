import { ctcCoder, TxType } from '@eth-optimism/core-utils'
import { BigNumber } from 'ethers'

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
