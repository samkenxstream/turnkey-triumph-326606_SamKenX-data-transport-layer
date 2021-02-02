/* Imports: External */
import { BaseService } from '@eth-optimism/service-base'
import express from 'express'
import level from 'level'
import { BigNumber } from 'ethers'
import { JsonRpcProvider } from '@ethersproject/providers'

/* Imports: Internal */
import { TransportDB } from '../../db/db'

export interface L1TransportServerOptions {
  db: string
  port: number
  confirmations: number
  l1RpcEndpoint: string
}

export class L1TransportServer extends BaseService<L1TransportServerOptions> {
  protected name = 'L1 Transport Server'
  protected defaultOptions = {
    port: 7878,
  }

  private state: {
    app: express.Express
    db: TransportDB
    l1RpcProvider: JsonRpcProvider
  } = {} as any

  protected async _init(): Promise<void> {
    this.state.db = new TransportDB(level(this.options.db))
    this.state.app = express()
    this.state.l1RpcProvider = new JsonRpcProvider(this.options.l1RpcEndpoint)

    this.state.app.get('/eth/context/latest', async (req, res) => {
      const blockNumber =
        (await this.state.l1RpcProvider.getBlockNumber()) -
        this.options.confirmations
      const timestamp = (await this.state.l1RpcProvider.getBlock(blockNumber))
        .timestamp
      res.json({
        blockNumber,
        timestamp,
      })
    })

    this.state.app.get('/enqueue/latest', async (req, res) => {
      res.json(await this.state.db.getLatestEnqueue())
    })

    this.state.app.get('/enqueue/index/:index', async (req, res) => {
      res.json(
        await this.state.db.getEnqueueByIndex(
          BigNumber.from(req.params.index).toNumber()
        )
      )
    })

    this.state.app.get('/transaction/latest', async (req, res) => {
      res.json(await this.state.db.getLatestTransaction())
    })

    this.state.app.get('/transaction/index/:index', async (req, res) => {
      const transaction = await this.state.db.getTransactionByIndex(
        BigNumber.from(req.params.index).toNumber()
      )

      const batch = await this.state.db.getTransactionBatchByIndex(
        transaction.batchIndex
      )

      res.json({
        transaction,
        batch,
      })
    })

    this.state.app.get('/batch/transaction/latest', async (req, res) => {
      res.json(await this.state.db.getLatestTransactionBatch())
    })

    this.state.app.get('/batch/transaction/index/:index', async (req, res) => {
      const batch = await this.state.db.getTransactionBatchByIndex(
        BigNumber.from(req.params.index).toNumber()
      )

      const transactions = await this.state.db.getTransactionsByIndexRange(
        BigNumber.from(batch.prevTotalElements).toNumber(),
        BigNumber.from(batch.prevTotalElements).toNumber() +
          BigNumber.from(batch.size).toNumber()
      )

      res.json({
        batch,
        transactions,
      })
    })

    this.state.app.get('/stateroot/latest', async (req, res) => {
      res.json(await this.state.db.getLatestStateRoot())
    })

    this.state.app.get('/stateroot/index/:index', async (req, res) => {
      const stateRoot = await this.state.db.getStateRootByIndex(
        BigNumber.from(req.params.index).toNumber()
      )

      const batch = await this.state.db.getStateRootBatchByIndex(
        stateRoot.batchIndex
      )

      res.json({
        stateRoot,
        batch,
      })
    })

    this.state.app.get('/batch/stateroot/latest', async (req, res) => {
      res.json(await this.state.db.getLatestStateRootBatch())
    })

    this.state.app.get('/batch/stateroot/index/:index', async (req, res) => {
      const batch = await this.state.db.getStateRootBatchByIndex(
        BigNumber.from(req.params.index).toNumber()
      )

      const stateRoots = await this.state.db.getStateRootsByIndexRange(
        BigNumber.from(batch.prevTotalElements).toNumber(),
        BigNumber.from(batch.prevTotalElements).toNumber() +
          BigNumber.from(batch.size).toNumber()
      )

      res.json({
        batch,
        stateRoots,
      })
    })
  }

  protected async _start(): Promise<void> {
    this.state.app.listen(this.options.port)
  }
}
