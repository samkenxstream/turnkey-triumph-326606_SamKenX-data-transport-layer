/* Imports: External */
import { BaseService } from '@eth-optimism/service-base'
import { JsonRpcProvider } from '@ethersproject/providers'
import level from 'level'
import colors from 'colors/safe'

/* Imports: Internal */
import { TransportDB } from '../../db/db'
import {
  OptimismContracts,
  sleep,
  loadOptimismContracts,
  ZERO_ADDRESS,
} from '../../utils'
import {
  EventAddressSet,
  EventSequencerBatchAppended,
  EventStateBatchAppended,
  EventTransactionBatchAppended,
  EventTransactionEnqueued,
  TypedEthersEvent,
} from './event-types'
import {
  parseEventSequencerBatchAppended,
  parseEventStateBatchAppended,
  parseEventTransactionEnqueued,
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
    // This is our main function. It's basically just an infinite loop that attempts to stay in
    // sync with events coming from Ethereum. Loops as quickly as it can until it approaches the
    // tip of the chain, after which it starts waiting for a few seconds between each loop to avoid
    // unnecessary spam.

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

      // I prefer to do this in serial to avoid non-determinism. We could have a discussion about
      // using Promise.all if necessary, but I don't see a good reason to do so unless parsing is
      // really, really slow for all event types.

      await this._syncEvents(
        'OVM_CanonicalTransactionChain',
        'TransactionEnqueued',
        this._handleEventsTransactionEnqueued.bind(this),
        highestSyncedL1Block,
        targetL1Block
      )

      await this._syncEvents(
        'OVM_CanonicalTransactionChain',
        'SequencerBatchAppended',
        this._handleEventsSequencerBatchAppended.bind(this),
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
    // Basic sanity checks.
    if (!this.state.contracts[contractName]) {
      throw new Error(`Contract ${contractName} does not exist.`)
    }

    // Basic sanity checks.
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
    const eventRanges: {
      address: string
      fromBlock: number
      toBlock: number
    }[] = []

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

  /**
   * Gets the address of a contract at a particular block in the past.
   * @param contractName Name of the contract to get an address for.
   * @param blockNumber Block at which to get an address.
   * @return Contract address.
   */
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
    const enqueueEntries = events.map((event) => {
      return parseEventTransactionEnqueued(event)
    })

    await this.state.db.putEnqueueEntries(enqueueEntries)
  }

  /**
   * Handles SequencerBatchAppended events. A lot more parsing than the other functions as a result
   * of calldata compression and some issues with the information included in our events (TODO).
   * @param events StateBatchAppended events to handle.
   */
  private async _handleEventsSequencerBatchAppended(
    events: EventSequencerBatchAppended[]
  ): Promise<void> {
    // TODO: Not reliable. Should be part of an event instead, must be stored.
    // We're going to use this value for every Sequencer transaction, so it's easier just to get
    // the value once to avoid the extra network request for every transaction.
    const gasLimit = await this.state.contracts.OVM_ExecutionManager.getMaxTransactionGasLimit()

    for (const event of events) {
      // Unfortunately there isn't an easy way of getting a timestamp for this event without
      // querying for the full block. So we just query for the full block and use it in various
      // places to be consistent.
      const eventBlock = await this.state.l1RpcProvider.getBlock(
        event.blockNumber
      )

      // TODO: We need to update our events so that we actually have enough information to parse this
      // batch without having to pull out this extra event. For the meantime, we need to find this
      // "TransactonBatchAppended" event to get the rest of the data.
      const batchSubmissionEvent = (
        await this.state.contracts.OVM_CanonicalTransactionChain.attach(
          event.address
        ).queryFilter(
          this.state.contracts.OVM_CanonicalTransactionChain.filters.TransactionBatchAppended(),
          eventBlock.number,
          eventBlock.number
        )
      ).find((foundEvent) => {
        // We might have more than one event in this block, so we specifically want to find a
        // "TransactonBatchAppended" event emitted immediately before the event in question.
        return (
          foundEvent.transactionHash === event.transactionHash &&
          foundEvent.logIndex === event.logIndex - 1
        )
      }) as EventTransactionBatchAppended

      if (!batchSubmissionEvent) {
        throw new Error(
          `Well, this really shouldn't happen. A SequencerBatchAppended event doesn't have a corresponding TransactionBatchAppended event.`
        )
      }

      const {
        transactionBatchEntry,
        transactionEntries,
      } = await parseEventSequencerBatchAppended(
        gasLimit,
        eventBlock,
        batchSubmissionEvent,
        event
      )

      // TODO: We could maybe move this outside of this loop and save on db ops.
      await this.state.db.putTransactionBatchEntries([transactionBatchEntry])
      await this.state.db.putTransactionEntries(transactionEntries)
    }
  }

  /**
   * Handles StateBatchAppended events. Also just relatively simple parsing.
   * @param events StateBatchAppended events to handle.
   */
  private async _handleEventsStateBatchAppended(
    events: EventStateBatchAppended[]
  ): Promise<void> {
    for (const event of events) {
      const eventBlock = await this.state.l1RpcProvider.getBlock(
        event.blockNumber
      )

      const {
        stateRootBatchEntry,
        stateRootEntries,
      } = await parseEventStateBatchAppended(eventBlock, event)

      // TODO: We could maybe move this outside of this loop and save on db ops.
      await this.state.db.putStateRootBatchEntries([stateRootBatchEntry])
      await this.state.db.putStateRootEntries(stateRootEntries)
    }
  }
}
