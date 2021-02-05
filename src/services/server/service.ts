/* Imports: External */
import { BaseService } from '@eth-optimism/service-base'
import express from 'express'
import cors from 'cors'
import { BigNumber } from 'ethers'
import { JsonRpcProvider } from '@ethersproject/providers'

/* Imports: Internal */
import { TransportDB } from '../../db/transport-db'
import {
  ContextResponse,
  EnqueueResponse,
  StateRootBatchResponse,
  StateRootResponse,
  TransactionBatchResponse,
  TransactionResponse,
} from '../../types'

export interface L1TransportServerOptions {
  db: any
  port: number
  confirmations: number
  l1RpcEndpoint: string
}

export class L1TransportServer extends BaseService<L1TransportServerOptions> {
  protected name = 'L1 Transport Server'
  protected defaultOptions = {
    // TODO: Check if this port is used by any common software.
    port: 7878,
  }

  private state: {
    app: express.Express
    server: any
    db: TransportDB
    l1RpcProvider: JsonRpcProvider
  } = {} as any

  protected async _init(): Promise<void> {
    // TODO: I don't know if this is strictly necessary, but it's probably a good thing to do.
    if (!this.options.db.isOpen()) {
      await this.options.db.open()
    }

    this.state.db = new TransportDB(this.options.db)
    this.state.l1RpcProvider = new JsonRpcProvider(this.options.l1RpcEndpoint)

    this._initializeApp()
  }

  protected async _start(): Promise<void> {
    this.state.server = this.state.app.listen(this.options.port)
    this.logger.info(`Server listening on port: ${this.options.port}`)
  }

  protected async _stop(): Promise<void> {
    this.state.server.close()
  }

  /**
   * Initializes the server application.
   * Do any sort of initialization here that you want. Mostly just important that
   * `_registerAllRoutes` is called at the end.
   */
  private _initializeApp() {
    // TODO: Maybe pass this in as a parameter instead of creating it here?
    this.state.app = express()
    this.state.app.use(cors())
    this._registerAllRoutes()
  }

  /**
   * Registers a route on the server.
   * @param route Route to register.
   * @param handler Handler called and is expected to return a JSON response.
   */
  private _registerRoute(
    route: string,
    handler: (params: any) => Promise<any>
  ): void {
    // TODO: Better typing on the return value of the handler function.
    // TODO: Check for route collisions.
    // TODO: Add a different function to allow for removing routes.

    this.state.app.get(route, async (req, res) => {
      try {
        return res.json(await handler(req.params))
      } catch (e) {
        return res.status(400).json({
          error: e.toString(),
        })
      }
    })
  }

  /**
   * Registers all of the server routes we want to expose.
   * TODO: Link to our API spec.
   */
  private _registerAllRoutes(): void {
    // TODO: Maybe add doc-like comments to each of these routes?

    this._registerRoute(
      '/eth/context/latest',
      async (): Promise<ContextResponse> => {
        const blockNumber =
          (await this.state.l1RpcProvider.getBlockNumber()) -
          this.options.confirmations
        const block = await this.state.l1RpcProvider.getBlock(blockNumber)

        return {
          blockNumber: block.number,
          timestamp: block.timestamp,
        }
      }
    )

    this._registerRoute(
      '/enqueue/latest',
      async (): Promise<EnqueueResponse> => {
        return this.state.db.getLatestEnqueue()
      }
    )

    this._registerRoute(
      '/enqueue/index/:index',
      async (params: { index: string | number }): Promise<EnqueueResponse> => {
        return this.state.db.getEnqueueByIndex(
          BigNumber.from(params.index).toNumber()
        )
      }
    )

    this._registerRoute(
      '/transaction/latest',
      async (): Promise<TransactionResponse> => {
        const transaction = await this.state.db.getLatestFullTransaction()

        if (transaction === null) {
          return {
            transaction: null,
            batch: null,
          }
        }

        const batch = await this.state.db.getTransactionBatchByIndex(
          transaction.batchIndex
        )

        if (batch === null) {
          return {
            transaction: null,
            batch: null,
          }
        }

        return {
          transaction,
          batch,
        }
      }
    )

    this._registerRoute(
      '/transaction/index/:index',
      async (params: {
        index: string | number
      }): Promise<TransactionResponse> => {
        const transaction = await this.state.db.getFullTransactionByIndex(
          BigNumber.from(params.index).toNumber()
        )

        if (transaction === null) {
          return {
            transaction: null,
            batch: null,
          }
        }

        const batch = await this.state.db.getTransactionBatchByIndex(
          transaction.batchIndex
        )

        if (batch === null) {
          return {
            transaction: null,
            batch: null,
          }
        }

        return {
          transaction,
          batch,
        }
      }
    )

    this._registerRoute(
      '/batch/transactio/latest',
      async (): Promise<TransactionBatchResponse> => {
        const batch = await this.state.db.getLatestTransactionBatch()

        if (batch === null) {
          return {
            batch: null,
            transactions: [],
          }
        }

        const transactions = await this.state.db.getFullTransactionsByIndexRange(
          BigNumber.from(batch.prevTotalElements).toNumber(),
          BigNumber.from(batch.prevTotalElements).toNumber() +
            BigNumber.from(batch.size).toNumber()
        )

        if (transactions === null) {
          return {
            batch: null,
            transactions: [],
          }
        }

        return {
          batch,
          transactions,
        }
      }
    )

    this._registerRoute(
      '/batch/transaction/index/:index',
      async (params: {
        index: number | string
      }): Promise<TransactionBatchResponse> => {
        const batch = await this.state.db.getTransactionBatchByIndex(
          BigNumber.from(params.index).toNumber()
        )

        if (batch === null) {
          return {
            batch: null,
            transactions: [],
          }
        }

        const transactions = await this.state.db.getFullTransactionsByIndexRange(
          BigNumber.from(batch.prevTotalElements).toNumber(),
          BigNumber.from(batch.prevTotalElements).toNumber() +
            BigNumber.from(batch.size).toNumber()
        )

        if (transactions === null) {
          return {
            batch: null,
            transactions: [],
          }
        }

        return {
          batch,
          transactions,
        }
      }
    )

    this._registerRoute(
      '/stateroot/latest',
      async (): Promise<StateRootResponse> => {
        const stateRoot = await this.state.db.getLatestStateRoot()
        if (stateRoot === null) {
          return {
            stateRoot: null,
            batch: null,
          }
        }

        const batch = await this.state.db.getStateRootBatchByIndex(
          stateRoot.batchIndex
        )

        if (batch === null) {
          return {
            stateRoot: null,
            batch: null,
          }
        }

        return {
          stateRoot,
          batch,
        }
      }
    )

    this._registerRoute(
      '/stateroot/index/:index',
      async (params: {
        index: number | string
      }): Promise<StateRootResponse> => {
        const stateRoot = await this.state.db.getStateRootByIndex(
          BigNumber.from(params.index).toNumber()
        )

        if (stateRoot === null) {
          return {
            stateRoot: null,
            batch: null,
          }
        }

        const batch = await this.state.db.getStateRootBatchByIndex(
          stateRoot.batchIndex
        )

        if (batch === null) {
          return {
            stateRoot: null,
            batch: null,
          }
        }

        return {
          stateRoot,
          batch,
        }
      }
    )

    this._registerRoute(
      '/batch/stateroot/latest',
      async (): Promise<StateRootBatchResponse> => {
        const batch = await this.state.db.getLatestStateRootBatch()
        if (batch === null) {
          return {
            batch: null,
            stateRoots: [],
          }
        }

        const stateRoots = await this.state.db.getStateRootsByIndexRange(
          BigNumber.from(batch.prevTotalElements).toNumber(),
          BigNumber.from(batch.prevTotalElements).toNumber() +
            BigNumber.from(batch.size).toNumber()
        )

        if (stateRoots === null) {
          return {
            batch: null,
            stateRoots: [],
          }
        }

        return {
          batch,
          stateRoots,
        }
      }
    )

    this._registerRoute(
      '/batch/stateroot/index/:index',
      async (params: {
        index: number | string
      }): Promise<StateRootBatchResponse> => {
        const batch = await this.state.db.getStateRootBatchByIndex(
          BigNumber.from(params.index).toNumber()
        )

        if (batch === null) {
          return {
            batch: null,
            stateRoots: [],
          }
        }

        const stateRoots = await this.state.db.getStateRootsByIndexRange(
          BigNumber.from(batch.prevTotalElements).toNumber(),
          BigNumber.from(batch.prevTotalElements).toNumber() +
            BigNumber.from(batch.size).toNumber()
        )

        if (stateRoots === null) {
          return {
            batch: null,
            stateRoots: [],
          }
        }

        return {
          batch,
          stateRoots,
        }
      }
    })
  }
}
