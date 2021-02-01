/* Imports: External */
import { BaseService } from '@eth-optimism/service-base'
import { JsonRpcProvider } from '@ethersproject/providers'
import { BigNumber } from 'ethers'
import level from 'level'

/* Imports: Internal */
import {
  EnqueueEntry,
  StateRootBatchEntry,
  StateRootEntry,
  TransactionBatchEntry,
  TransactionEntry,
  TransportDB,
} from '../../db/db'
import {
  OptimismContracts,
  fromHexString,
  sleep,
  toHexString,
  loadOptimismContracts,
  ZERO_ADDRESS,
} from '../../utils'
import {
  EventAddressSet,
  EventStateBatchAppended,
  EventTransactionBatchAppended,
  EventTransactionEnqueued,
  TypedEthersEvent,
} from './event-types'

export interface L1IngestionServiceOptions {
  db: any
  addressManager: string
  confirmations: number
  l1RpcEndpoint: string
  pollingInterval: number
  logsPerPollingInterval: number
}

export class L1IngestionService extends BaseService<L1IngestionServiceOptions> {
  protected name = 'L1 Ingestion Service'
  protected defaultOptions = {
    confirmations: 12,
    pollingInterval: 5000,
    logsPerPollingInterval: 2000,
  }

  private state: {
    db: TransportDB
    contracts: OptimismContracts
    l1RpcProvider: JsonRpcProvider
    startingL1BlockNumber: number
  } = {} as any

  protected async _init(): Promise<void> {
    this.state.db = new TransportDB(level(this.options.db))
    this.state.l1RpcProvider = new JsonRpcProvider(this.options.l1RpcEndpoint)

    this.state.contracts = await loadOptimismContracts(
      this.state.l1RpcProvider,
      this.options.addressManager
    )

    // Assume we won't have too many of these events. Doubtful we'll ever have the 2000+ that would
    // break this statement when interacting with alchemy or infura.
    this.state.startingL1BlockNumber = (
      await this.state.contracts.Lib_AddressManager.queryFilter(
        this.state.contracts.Lib_AddressManager.filters.AddressSet()
      )
    )[0].blockNumber
  }

  protected async _start(): Promise<void> {
    while (this.running) {
      try {
        await sleep(this.options.pollingInterval)

        this.logger.info('Synchronizing TransactionEnqueued events...')
        await this._syncEvents(
          'OVM_CanonicalTransactionChain',
          'TransactionEnqueued',
          this._handleEventsTransactionEnqueued.bind(this)
        )

        this.logger.info('Synchronizing TransactionBatchAppended events...')
        await this._syncEvents(
          'OVM_CanonicalTransactionChain',
          'TransactionBatchAppended',
          this._handleEventsTransactionBatchAppended.bind(this)
        )

        this.logger.info('Synchronizing StateBatchAppended events...')
        await this._syncEvents(
          'OVM_StateCommitmentChain',
          'StateBatchAppended',
          this._handleEventsStateBatchAppended.bind(this)
        )
      } catch (err) {
        this.logger.error(`Caught an unhandled error: ${err}`)
      }
    }
  }

  private async _syncEvents(
    contractName: string,
    eventName: string,
    handler: (event: TypedEthersEvent<any>[]) => Promise<void>
  ): Promise<void> {
    if (!this.state.contracts[contractName]) {
      throw new Error(`Contract ${contractName} does not exist.`)
    }

    if (!this.state.contracts[contractName].filters[eventName]) {
      throw new Error(
        `Event ${eventName} does not exist on contract ${contractName}`
      )
    }

    const targetScannedEventBlock =
      (await this.state.l1RpcProvider.getBlockNumber()) -
      this.options.confirmations
    let lastScannedEventBlock =
      (await this.state.db.getLastScannedEventBlock(eventName)) ||
      this.state.startingL1BlockNumber
    let nextScannedEventBlock = Math.min(
      lastScannedEventBlock + this.options.logsPerPollingInterval,
      targetScannedEventBlock
    )

    while (lastScannedEventBlock < targetScannedEventBlock) {
      const addressSetEvents = ((await this.state.contracts.Lib_AddressManager.queryFilter(
        this.state.contracts.Lib_AddressManager.filters.AddressSet(),
        lastScannedEventBlock,
        nextScannedEventBlock
      )) as EventAddressSet[]).filter((event) => {
        return event.args._name === contractName
      })

      if (addressSetEvents.length > 0) {
        this.logger.interesting(
          `Found ${addressSetEvents.length} address change(s) for this contract!`
        )
      }

      for (const addressSetEvent of addressSetEvents) {
        const oldAddress = await this._getContractAddressAtBlock(
          contractName,
          addressSetEvent.blockNumber - 1
        )

        this.logger.interesting(
          `Address of ${contractName} was changed in block ${addressSetEvent.blockNumber}.`
        )
        this.logger.interesting(`Old address: ${oldAddress}`)
        this.logger.interesting(
          `New address: ${addressSetEvent.args._newAddress}`
        )

        const events: TypedEthersEvent<any>[] = await this.state.contracts[
          contractName
        ]
          .attach(oldAddress)
          .queryFilter(
            this.state.contracts[contractName].filters[eventName](),
            lastScannedEventBlock,
            addressSetEvent.blockNumber
          )

        this.logger.info(
          `Found ${events.length} ${eventName} events between blocks ${lastScannedEventBlock} and ${addressSetEvent.blockNumber}.`
        )
        if (events.length > 0) {
          await handler(events)
        }

        await this.state.db.putLastScannedEventBlock(
          eventName,
          addressSetEvent.blockNumber
        )
        lastScannedEventBlock = addressSetEvent.blockNumber
      }

      const events: TypedEthersEvent<any>[] = await this.state.contracts[
        contractName
      ].queryFilter(
        this.state.contracts[contractName].filters[eventName](),
        lastScannedEventBlock,
        nextScannedEventBlock
      )

      this.logger.info(
        `Found ${events.length} ${eventName} events between blocks ${lastScannedEventBlock} and ${nextScannedEventBlock}`
      )
      if (events.length > 0) {
        await handler(events)
      }

      await this.state.db.putLastScannedEventBlock(
        eventName,
        nextScannedEventBlock
      )

      lastScannedEventBlock = nextScannedEventBlock
      nextScannedEventBlock = Math.min(
        lastScannedEventBlock + this.options.logsPerPollingInterval,
        targetScannedEventBlock
      )
    }
  }

  private async _getContractAddressAtBlock(
    contractName: string,
    blockNumber: number
  ): Promise<string> {
    const relevantAddressSetEvents = (
      await this.state.contracts.Lib_AddressManager.queryFilter(
        this.state.contracts.Lib_AddressManager.filters.AddressSet()
      )
    ).filter((event) => {
      return (
        event.args._name === contractName && event.blockNumber <= blockNumber
      )
    })

    if (relevantAddressSetEvents.length > 0) {
      return relevantAddressSetEvents[relevantAddressSetEvents.length - 1].args
        ._newAddress
    } else {
      // Address wasn't set before this.
      return ZERO_ADDRESS
    }
  }

  private async _handleEventsTransactionEnqueued(
    events: EventTransactionEnqueued[]
  ): Promise<void> {
    const enqueueEntries: EnqueueEntry[] = []
    for (const event of events) {
      enqueueEntries.push({
        index: event.args._queueIndex.toNumber(),
        target: event.args._target,
        data: event.args._data,
        gasLimit: event.args._gasLimit.toNumber(),
        origin: event.args._l1TxOrigin,
        blockNumber: event.blockNumber,
        timestamp: event.args._timestamp.toNumber(),
      })
    }

    await this.state.db.putEnqueueEntries(enqueueEntries)
  }

  private async _handleEventsTransactionBatchAppended(
    events: EventTransactionBatchAppended[]
  ): Promise<void> {
    // TODO: Not reliable. Should be part of an event instead, must be stored.
    const gasLimit = await this.state.contracts.OVM_ExecutionManager.getMaxTransactionGasLimit()

    const transactionBatchEntries: TransactionBatchEntry[] = []
    const transactionEntries: TransactionEntry[] = []
    for (const event of events) {
      this.logger.info(
        `Populating data for batch index: ${event.args._batchIndex.toString()}`
      )
      const timestamp = (
        await this.state.l1RpcProvider.getBlock(event.blockNumber)
      ).timestamp
      const l1Transaction = await this.state.l1RpcProvider.getTransaction(
        event.transactionHash
      )

      transactionBatchEntries.push({
        index: event.args._batchIndex.toNumber(),
        root: event.args._batchRoot,
        size: event.args._batchSize.toNumber(),
        prevTotalElements: event.args._prevTotalElements.toNumber(),
        extraData: event.args._extraData,
        blockNumber: BigNumber.from(event.blockNumber).toNumber(),
        timestamp: BigNumber.from(timestamp).toNumber(),
        submitter: l1Transaction.from,
      })

      const batchSubmissionEvents = await this.state.contracts.OVM_CanonicalTransactionChain.attach(
        await this._getContractAddressAtBlock(
          'OVM_CanonicalTransactionChain',
          event.blockNumber
        )
      ).queryFilter(
        this.state.contracts.OVM_CanonicalTransactionChain.filters.SequencerBatchAppended(),
        event.blockNumber,
        event.blockNumber
      )

      const batchSubmissionEvent = batchSubmissionEvents.find(
        (batchSubmissionEvent) => {
          return (
            batchSubmissionEvent.transactionHash === event.transactionHash &&
            batchSubmissionEvent.logIndex === event.logIndex + 1
          )
        }
      )

      let transactionIndex = 0
      let enqueuedCount = 0
      if (batchSubmissionEvent) {
        const txdata = fromHexString(l1Transaction.data)
        const numContexts = BigNumber.from(txdata.slice(12, 15))

        let nextTxPointer = 15 + 16 * numContexts.toNumber()
        for (let i = 0; i < numContexts.toNumber(); i++) {
          const contextPointer = 15 + 16 * i
          const context = {
            numSequencedTransactions: BigNumber.from(
              txdata.slice(contextPointer, contextPointer + 3)
            ),
            numSubsequentQueueTransactions: BigNumber.from(
              txdata.slice(contextPointer + 3, contextPointer + 6)
            ),
            ctxTimestamp: BigNumber.from(
              txdata.slice(contextPointer + 6, contextPointer + 11)
            ),
            ctxBlockNumber: BigNumber.from(
              txdata.slice(contextPointer + 11, contextPointer + 16)
            ),
          }

          for (
            let j = 0;
            j < context.numSequencedTransactions.toNumber();
            j++
          ) {
            const txDataLength = BigNumber.from(
              txdata.slice(nextTxPointer, nextTxPointer + 3)
            )
            const txData = txdata.slice(
              nextTxPointer + 3,
              nextTxPointer + 3 + txDataLength.toNumber()
            )

            transactionEntries.push({
              index: event.args._prevTotalElements
                .add(BigNumber.from(transactionIndex))
                .toNumber(),
              batchIndex: event.args._batchIndex.toNumber(),
              blockNumber: context.ctxBlockNumber.toNumber(),
              timestamp: context.ctxTimestamp.toNumber(),
              gasLimit: BigNumber.from(gasLimit).toNumber(),
              target: '0x4200000000000000000000000000000000000005',
              origin: '0x0000000000000000000000000000000000000000',
              data: toHexString(txData),
              chainElement: {
                isSequenced: true,
                queueIndex: 0,
                timestamp: context.ctxTimestamp.toNumber(),
                blockNumber: context.ctxBlockNumber.toNumber(),
                txData: toHexString(txData),
              },
            })

            nextTxPointer += 3 + txDataLength.toNumber()
            transactionIndex++
          }

          for (
            let j = 0;
            j < context.numSubsequentQueueTransactions.toNumber();
            j++
          ) {
            const queueIndex =
              batchSubmissionEvent.args._startingQueueIndex.toNumber() +
              enqueuedCount

            const enqueue = await this.state.db.getEnqueueByIndex(queueIndex)

            transactionEntries.push({
              index: event.args._prevTotalElements
                .add(BigNumber.from(transactionIndex))
                .toNumber(),
              batchIndex: event.args._batchIndex.toNumber(),
              blockNumber: enqueue.blockNumber,
              timestamp: enqueue.timestamp,
              gasLimit: enqueue.gasLimit,
              target: enqueue.target,
              origin: enqueue.origin,
              data: enqueue.data,
              chainElement: {
                isSequenced: false,
                queueIndex: queueIndex,
                timestamp: 0,
                blockNumber: 0,
                txData: '0x',
              },
            })

            enqueuedCount++
            transactionIndex++
          }
        }
      }
    }

    await this.state.db.putTransactionBatchEntries(transactionBatchEntries)
    await this.state.db.putTransactionEntries(transactionEntries)
  }

  private async _handleEventsStateBatchAppended(
    events: EventStateBatchAppended[]
  ): Promise<void> {
    const stateRootBatchEntries: StateRootBatchEntry[] = []
    const stateRootEntries: StateRootEntry[] = []
    for (const event of events) {
      const block = await this.state.l1RpcProvider.getBlock(event.blockNumber)
      const l1Transaction = await this.state.l1RpcProvider.getTransaction(
        event.transactionHash
      )

      stateRootBatchEntries.push({
        index: event.args._batchIndex.toNumber(),
        blockNumber: BigNumber.from(event.blockNumber).toNumber(),
        timestamp: BigNumber.from(block.timestamp).toNumber(),
        submitter: l1Transaction.from,
        size: event.args._batchSize.toNumber(),
        root: event.args._batchRoot,
        prevTotalElements: event.args._prevTotalElements.toNumber(),
        extraData: event.args._extraData,
      })

      const [
        rawStateRoots,
      ] = this.state.contracts.OVM_StateCommitmentChain.interface.decodeFunctionData(
        'appendStateBatch',
        l1Transaction.data
      )

      for (let i = 0; i < rawStateRoots.length; i++) {
        stateRootEntries.push({
          index: event.args._prevTotalElements
            .add(BigNumber.from(i))
            .toNumber(),
          batchIndex: event.args._batchIndex.toNumber(),
          value: rawStateRoots[i],
        })
      }
    }

    await this.state.db.putStateRootBatchEntries(stateRootBatchEntries)
    await this.state.db.putStateRootEntries(stateRootEntries)
  }
}
