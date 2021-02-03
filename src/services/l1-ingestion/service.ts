/* Imports: External */
import { BaseService } from '@eth-optimism/service-base'
import { ctcCoder, TxType } from '@eth-optimism/core-utils'
import { JsonRpcProvider } from '@ethersproject/providers'
import { BigNumber } from 'ethers'
import level from 'level'
import colors from 'colors/safe'

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
import {
  maybeDecodeSequencerBatchTransaction,
  parseNumContexts,
  parseSequencerBatchContext,
  parseSequencerBatchTransaction,
} from './codec'

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
      const highestSyncedL1Block =
        (await this.state.db.getHighestSyncedL1Block()) ||
        this.state.startingL1BlockNumber
      const currentL1Block = await this.state.l1RpcProvider.getBlockNumber()
      const targetL1Block = Math.min(
        highestSyncedL1Block + this.options.logsPerPollingInterval,
        currentL1Block - this.options.confirmations
      )

      this.logger.info(
        `Synchronizing events from Layer 1 (Ethereum) from block ${colors.yellow(
          `${highestSyncedL1Block}`
        )} to block ${colors.yellow(`${targetL1Block}`)}`
      )

      await this._syncEvents(
        'OVM_CanonicalTransactionChain',
        'TransactionEnqueued',
        this._handleEventsTransactionEnqueued.bind(this),
        highestSyncedL1Block,
        targetL1Block
      )

      await this._syncEvents(
        'OVM_CanonicalTransactionChain',
        'TransactionBatchAppended',
        this._handleEventsTransactionBatchAppended.bind(this),
        highestSyncedL1Block,
        targetL1Block
      )

      await this._syncEvents(
        'OVM_StateCommitmentChain',
        'StateBatchAppended',
        this._handleEventsStateBatchAppended.bind(this),
        highestSyncedL1Block,
        targetL1Block
      )

      await this.state.db.setHighestSyncedL1Block(targetL1Block)

      if (
        currentL1Block - highestSyncedL1Block <
        this.options.logsPerPollingInterval
      ) {
        await sleep(this.options.pollingInterval)
      }
    }
  }

  private async _syncEvents(
    contractName: string,
    eventName: string,
    handler: (event: TypedEthersEvent<any>[]) => Promise<void>,
    fromL1Block: number,
    toL1Block: number
  ): Promise<void> {
    if (!this.state.contracts[contractName]) {
      throw new Error(`Contract ${contractName} does not exist.`)
    }

    if (!this.state.contracts[contractName].filters[eventName]) {
      throw new Error(
        `Event ${eventName} does not exist on contract ${contractName}`
      )
    }

    // We need to figure out how to make this work without Infura. Mark and I think that infura is
    // doing some indexing of events beyond Geth's native capabilities, meaning some event logic
    // will only work on Infura and not on a local geth instance. Not great.
    const addressSetEvents = ((await this.state.contracts.Lib_AddressManager.queryFilter(
      this.state.contracts.Lib_AddressManager.filters.AddressSet(),
      fromL1Block,
      toL1Block
    )) as EventAddressSet[]).filter((event) => {
      return event.args._name === contractName
    })

    // We're going to parse things out in ranges because the address of a given contract may have
    // changed in the range provided by the user.
    const eventRanges: Array<{
      address: string
      fromBlock: number
      toBlock: number
    }> = []

    // Add a range for each address change.
    let l1BlockRangeStart = fromL1Block
    for (const addressSetEvent of addressSetEvents) {
      eventRanges.push({
        address: await this._getContractAddressAtBlock(
          contractName,
          addressSetEvent.blockNumber
        ),
        fromBlock: l1BlockRangeStart,
        toBlock: addressSetEvent.blockNumber,
      })

      l1BlockRangeStart = addressSetEvent.blockNumber
    }

    // Add one more range to get us to the end of the user-provided block range.
    eventRanges.push({
      address: await this._getContractAddressAtBlock(contractName, toL1Block),
      fromBlock: l1BlockRangeStart,
      toBlock: toL1Block,
    })

    for (const eventRange of eventRanges) {
      // Find all relevant events within the range.
      const events: TypedEthersEvent<any>[] = await this.state.contracts[
        contractName
      ]
        .attach(eventRange.address)
        .queryFilter(
          this.state.contracts[contractName].filters[eventName](),
          eventRange.fromBlock,
          eventRange.toBlock
        )

      // Handle events, if any.
      if (events.length > 0) {
        const tick = Date.now()
        await handler(events)
        const tock = Date.now()

        this.logger.success(
          `Processed ${colors.magenta(`${events.length}`)} ${colors.cyan(
            eventName
          )} events in ${colors.red(`${tock - tick}ms`)}.`
        )
      }
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
        event.args._name === contractName && event.blockNumber < blockNumber
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

  /**
   * Handles TransactionEnqueued events, converts them into prettier data structures and throws
   * them in the database.
   * @param events TransactionEnqueued events to handle.
   */
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

  /**
   * Handles TransactionBatchAppended events. Does a lot of parsing to pull out a nice batch data
   * structure and structures for every transaction in the batch.
   * @param events TransactionBatchAppended events to handle.
   */
  private async _handleEventsTransactionBatchAppended(
    events: EventTransactionBatchAppended[]
  ): Promise<void> {
    // TODO: Not reliable. Should be part of an event instead, must be stored.
    // We're going to use this value for every Sequencer transaction, so it's easier just to get
    // the value once to avoid the extra network request for every transaction.
    const gasLimit = await this.state.contracts.OVM_ExecutionManager.getMaxTransactionGasLimit()

    // Set up empty arrays for each of our entry types.
    const transactionBatchEntries: TransactionBatchEntry[] = []
    const transactionEntries: TransactionEntry[] = []

    // Each event is a new batch to parse.
    for (const event of events) {
      // Unfortunately there isn't an easy way of getting a timestamp for this event without
      // querying for the full block. So we just query for the full block and use it in various
      // places to be consistent.
      const eventBlock = await this.state.l1RpcProvider.getBlock(
        event.blockNumber
      )

      // Going to need to pull data out of the transaction later.
      const l1Transaction = await event.getTransaction()

      // Create a batch entry first, this one's just some straightforward parsing.
      transactionBatchEntries.push({
        index: event.args._batchIndex.toNumber(),
        root: event.args._batchRoot,
        size: event.args._batchSize.toNumber(),
        prevTotalElements: event.args._prevTotalElements.toNumber(),
        extraData: event.args._extraData,
        blockNumber: BigNumber.from(eventBlock.number).toNumber(),
        timestamp: BigNumber.from(eventBlock.timestamp).toNumber(),
        submitter: l1Transaction.from,
      })

      // TODO: We need to update our events so that we actually have enough information to parse this
      // batch without having to pull out this extra event. For the meantime, we need to find this
      // "SequencerBatchAppended" event to figure out whether this event came from the sequencer
      // or from the queue. First, we find
      const batchSubmissionEvent = (
        await this.state.contracts.OVM_CanonicalTransactionChain.attach(
          event.address
        ).queryFilter(
          this.state.contracts.OVM_CanonicalTransactionChain.filters.SequencerBatchAppended(),
          eventBlock.number,
          eventBlock.number
        )
      ).find((batchSubmissionEvent) => {
        // We might have more than one event in this block, so we specifically want to find a
        // "SequencerBatchAppended" event emitted immediately after the event in question.
        return (
          batchSubmissionEvent.transactionHash === event.transactionHash &&
          batchSubmissionEvent.logIndex === event.logIndex + 1
        )
      })

      if (batchSubmissionEvent) {
        // We're dealing with a Sequencer batch.

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
              index:
                event.args._prevTotalElements.toNumber() + transactionIndex,
              batchIndex: event.args._batchIndex.toNumber(),
              blockNumber: context.blockNumber,
              timestamp: context.timestamp,
              gasLimit: gasLimit,
              target: '0x4200000000000000000000000000000000000005',
              origin: '0x0000000000000000000000000000000000000000',
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
              batchSubmissionEvent.args._startingQueueIndex.toNumber() +
              enqueuedCount

            const enqueue = await this.state.db.getEnqueueByIndex(queueIndex)

            transactionEntries.push({
              index:
                event.args._prevTotalElements.toNumber() + transactionIndex,
              batchIndex: event.args._batchIndex.toNumber(),
              blockNumber: enqueue.blockNumber,
              timestamp: enqueue.timestamp,
              gasLimit: enqueue.gasLimit,
              target: enqueue.target,
              origin: enqueue.origin,
              data: enqueue.data,
              queueOrigin: 'l1',
              type: 'EIP155',
              queueIndex,
              decoded: null,
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

  /**
   * Handles StateBatchAppended events. Also just relatively simple parsing.
   * @param events StateBatchAppended events to handle.
   */
  private async _handleEventsStateBatchAppended(
    events: EventStateBatchAppended[]
  ): Promise<void> {
    // Set up empty arrays for our entries.
    const stateRootBatchEntries: StateRootBatchEntry[] = []
    const stateRootEntries: StateRootEntry[] = []

    for (const event of events) {
      const block = await this.state.l1RpcProvider.getBlock(event.blockNumber)
      const l1Transaction = await event.getTransaction()

      stateRootBatchEntries.push({
        index: event.args._batchIndex.toNumber(),
        blockNumber: block.number,
        timestamp: block.timestamp,
        submitter: l1Transaction.from,
        size: event.args._batchSize.toNumber(),
        root: event.args._batchRoot,
        prevTotalElements: event.args._prevTotalElements.toNumber(),
        extraData: event.args._extraData,
      })

      // TODO: Currently only works because we assume that `appendStateBatch` is only being
      // called by externally owned accounts. Also, will start failing if we ever change the
      // function signature of `appendStateBatch`.
      const [
        rawStateRoots,
      ] = this.state.contracts.OVM_StateCommitmentChain.interface.decodeFunctionData(
        'appendStateBatch',
        l1Transaction.data
      )

      for (let i = 0; i < rawStateRoots.length; i++) {
        stateRootEntries.push({
          index: event.args._prevTotalElements.toNumber() + i,
          batchIndex: event.args._batchIndex.toNumber(),
          value: rawStateRoots[i],
        })
      }
    }

    await this.state.db.putStateRootBatchEntries(stateRootBatchEntries)
    await this.state.db.putStateRootEntries(stateRootEntries)
  }
}
