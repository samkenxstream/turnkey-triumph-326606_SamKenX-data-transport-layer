/* Imports: External */
import { ethers } from 'ethers'

export type TypedEthersEvent<T> = ethers.Event & {
  args: T
}

export type EventAddressSet = TypedEthersEvent<{
  _name: string
  _newAddress: string
}>

export type EventTransactionEnqueued = TypedEthersEvent<{
  _l1TxOrigin: string
  _target: string
  _gasLimit: ethers.BigNumber
  _data: string
  _queueIndex: ethers.BigNumber
  _timestamp: ethers.BigNumber
}>

export type EventTransactionBatchAppended = TypedEthersEvent<{
  _batchIndex: ethers.BigNumber
  _batchRoot: string
  _batchSize: ethers.BigNumber
  _prevTotalElements: ethers.BigNumber
  _extraData: string
}>

export type EventStateBatchAppended = TypedEthersEvent<{
  _batchIndex: ethers.BigNumber
  _batchRoot: string
  _batchSize: ethers.BigNumber
  _prevTotalElements: ethers.BigNumber
  _extraData: string
}>
