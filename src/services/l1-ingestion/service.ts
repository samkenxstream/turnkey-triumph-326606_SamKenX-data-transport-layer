/* Imports: External */
import { BaseService } from '@eth-optimism/service-base'
import { JsonRpcProvider } from '@ethersproject/providers'
import { BigNumber, Contract, ethers, Event } from 'ethers'
import level from 'level'

/* Imports: Internal */
import { loadOptimismContracts, OptimismContracts } from '../../utils/contracts'
import {
  EnqueueEntry,
  StateRootBatchEntry,
  StateRootEntry,
  TransactionBatchEntry,
  TransactionEntry,
  TransportDB,
} from '../../db/db'
import { fromHexString, sleep, toHexString } from '../../utils'

export interface L1IngestionServiceOptions {
  db: any
  addressManager: string
  confirmations: number
  l1RpcEndpoint: string
  l1StartingBlock: number
  pollingInterval: number
  contractParameters: {
    [name: string]: Array<{
      address: string
      fromBlock?: number
      toBlock?: number
    }>
  }
}

export class L1IngestionService extends BaseService<L1IngestionServiceOptions> {
  protected name = 'L1 Ingestion Service'
  protected defaultOptions = {}

  private state: {
    db: TransportDB
    contracts: OptimismContracts
    l1RpcProvider: JsonRpcProvider
  } = {} as any

  protected async _init(): Promise<void> {
    this.state.db = new TransportDB(level(this.options.db))
    this.state.l1RpcProvider = new JsonRpcProvider(this.options.l1RpcEndpoint)
    this.state.contracts = await loadOptimismContracts(
      this.state.l1RpcProvider,
      this.options.addressManager
    )
  }

  protected async _start(): Promise<void> {
    while (this.running) {
      try {
        await sleep(this.options.pollingInterval)

        this.logger.info('Synchronizing TransactionEnqueued events...')
        await this._syncEventsTransactionEnqueued()

        this.logger.info('Synchronizing TransactionBatchAppended events...')
        await this._syncEventsTransactionBatchAppended()

        this.logger.info('Synchronizing StateBatchAppended events...')
        await this._syncEventsStateBatchAppended()
      } catch (err) {
        this.logger.error(`Caught an unhandled error: ${err}`)
      }
    }
  }

  private _getEventFilter(
    contract: ethers.Contract,
    event: string
  ): ethers.EventFilter {
    return contract.filters[event]()
  }

  private _getFilterId(filter: ethers.EventFilter): string {
    return filter.topics.join(',')
  }

  private async _findAllEvents(
    contract: ethers.Contract,
    filter: string | ethers.EventFilter,
    fromBlock?: number,
    toBlock?: number
  ): Promise<ethers.Event[]> {
    if (typeof filter === 'string') {
      filter = this._getEventFilter(contract, filter)
    }

    let startingBlockNumber =
      fromBlock ||
      (await this.state.db.getLastScannedEventBlock(
        this._getFilterId(filter)
      )) ||
      this.options.l1StartingBlock

    let events: ethers.Event[] = []
    let latestL1BlockNumber =
      toBlock || (await this.state.l1RpcProvider.getBlockNumber())
    while (startingBlockNumber < latestL1BlockNumber) {
      events = events.concat(
        await contract.queryFilter(
          filter,
          startingBlockNumber,
          Math.min(
            startingBlockNumber + 2000,
            latestL1BlockNumber - this.options.confirmations
          )
        )
      )

      if (startingBlockNumber + 2000 > latestL1BlockNumber) {
        startingBlockNumber = latestL1BlockNumber
        break
      }

      startingBlockNumber += 2000
      latestL1BlockNumber = await this.state.l1RpcProvider.getBlockNumber()
    }

    await this.state.db.putLastScannedEventBlock(
      this._getFilterId(filter),
      startingBlockNumber
    )

    return events
  }

  private async _findAllEventsOverMultipleAddresses(
    contract: Contract,
    filter: string | ethers.EventFilter,
    parameters: Array<{
      address: string
      fromBlock?: number
      toBlock?: number
    }>
  ): Promise<ethers.Event[]> {
    let events: ethers.Event[] = []
    for (const parameter of parameters) {
      events = events.concat(
        await this._findAllEvents(
          contract.attach(parameter.address),
          filter,
          parameter.fromBlock,
          parameter.toBlock
        )
      )
    }

    return events
  }

  private async _syncEventsTransactionEnqueued(): Promise<void> {
    const filter = this._getEventFilter(
      this.state.contracts.OVM_CanonicalTransactionChain,
      'TransactionEnqueued'
    )

    const prevScannedEventBlock = await this.state.db.getLastScannedEventBlock(
      this._getFilterId(filter)
    )

    try {
      this.logger.info(`Searching for new events...`)
      const events = await this._findAllEvents(
        this.state.contracts.OVM_CanonicalTransactionChain,
        filter
      )

      if (events.length === 0) {
        this.logger.info(`Didn't find any new events, skipping.`)
        return
      } else {
        this.logger.info(
          `Found ${events.length} new events, writing to database...`
        )
      }

      const enqueues: EnqueueEntry[] = events.map((event) => {
        return {
          index: event.args._queueIndex.toNumber(),
          target: event.args._target,
          data: event.args._data,
          gasLimit: event.args._gasLimit.toNumber(),
          origin: event.args._l1TxOrigin,
          blockNumber: event.blockNumber,
          timestamp: event.args._timestamp.toNumber(),
        }
      })

      await this.state.db.putEnqueueEntries(enqueues)
    } catch (err) {
      await this.state.db.putLastScannedEventBlock(
        this._getFilterId(filter),
        prevScannedEventBlock
      )
    }
  }

  private async _syncEventsTransactionBatchAppended(): Promise<void> {
    const filter = this._getEventFilter(
      this.state.contracts.OVM_CanonicalTransactionChain,
      'TransactionBatchAppended'
    )

    const prevScannedEventBlock = await this.state.db.getLastScannedEventBlock(
      this._getFilterId(filter)
    )

    try {
      this.logger.info(`Searching for new events...`)
      const events = await this._findAllEvents(
        this.state.contracts.OVM_CanonicalTransactionChain,
        filter
      )

      if (events.length === 0) {
        this.logger.info(`Didn't find any new events, skipping.`)
        return
      } else {
        this.logger.info(
          `Found ${events.length} new events, populating relevant data...`
        )
      }

      const gasLimit = await this.state.contracts.OVM_ExecutionManager.getMaxTransactionGasLimit()
      const batches: TransactionBatchEntry[] = []
      const transactions: TransactionEntry[] = []

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

        batches.push({
          index: event.args._batchIndex.toString(),
          root: event.args._batchRoot,
          size: event.args._batchSize.toString(),
          prevTotalElements: event.args._prevTotalElements.toString(),
          extraData: event.args._extraData,
          blockNumber: BigNumber.from(event.blockNumber).toNumber(),
          timestamp: BigNumber.from(timestamp).toNumber(),
          submitter: l1Transaction.from,
        })

        const batchSubmissionEvents = await this.state.contracts.OVM_CanonicalTransactionChain.queryFilter(
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

              transactions.push({
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

              transactions.push({
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

      await this.state.db.putTransactionBatchEntries(batches)
      await this.state.db.putTransactionEntries(transactions)
    } catch (err) {
      await this.state.db.putLastScannedEventBlock(
        this._getFilterId(filter),
        prevScannedEventBlock
      )
    }
  }

  public async _syncEventsStateBatchAppended(): Promise<void> {
    const filter = this._getEventFilter(
      this.state.contracts.OVM_StateCommitmentChain,
      'StateBatchAppended'
    )

    const prevScannedEventBlock = await this.state.db.getLastScannedEventBlock(
      this._getFilterId(filter)
    )

    try {
      const events = await this._findAllEventsOverMultipleAddresses(
        this.state.contracts.OVM_StateCommitmentChain,
        'StateBatchAppended',
        this.options.contractParameters['OVM_StateCommitmentChain']
      )

      if (events.length === 0) {
        this.logger.info(`Didn't find any new events, skipping.`)
        return
      } else {
        this.logger.info(
          `Found ${events.length} new events, populating relevant data...`
        )
      }

      const batches: StateRootBatchEntry[] = []
      const stateRoots: StateRootEntry[] = []
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

        batches.push({
          index: event.args._batchIndex.toNumber(),
          blockNumber: BigNumber.from(event.blockNumber).toNumber(),
          timestamp: BigNumber.from(timestamp).toNumber(),
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
          stateRoots.push({
            index: event.args._prevTotalElements
              .add(BigNumber.from(i))
              .toString(),
            value: rawStateRoots[i],
          })
        }
      }

      await this.state.db.putStateRootBatchEntries(batches)
      await this.state.db.putStateRootEntries(stateRoots)
    } catch (err) {
      await this.state.db.putLastScannedEventBlock(
        this._getFilterId(filter),
        prevScannedEventBlock
      )
    }
  }
}
