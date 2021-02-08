/* Imports: External */
import { BigNumber } from 'ethers'
import {
  EnqueueEntry,
  StateRootBatchEntry,
  StateRootEntry,
  TransactionBatchEntry,
  TransactionEntry,
} from '../types/database-types'

export class TransportDB {
  constructor(public db: any) {}

  public async putEnqueueEntries(entries: EnqueueEntry[]): Promise<void> {
    if (entries.length === 0) {
      return
    }

    await this._putBatch(`enqueue:index`, entries)
    await this.db.put(`enqueue:latest`, entries[entries.length - 1].index)
  }

  public async putTransactionEntries(
    entries: TransactionEntry[]
  ): Promise<void> {
    if (entries.length === 0) {
      return
    }

    await this._putBatch(`transaction:index`, entries)
    await this.db.put(`transaction:latest`, entries[entries.length - 1].index)
  }

  public async putTransactionBatchEntries(
    entries: TransactionBatchEntry[]
  ): Promise<void> {
    if (entries.length === 0) {
      return
    }

    await this._putBatch(`batch:transaction:index`, entries)
    await this.db.put(
      `batch:transaction:latest`,
      entries[entries.length - 1].index
    )
  }

  public async putStateRootEntries(entries: StateRootEntry[]): Promise<void> {
    if (entries.length === 0) {
      return
    }

    await this._putBatch(`stateroot:index`, entries)
    await this.db.put(`stateroot:latest`, entries[entries.length - 1].index)
  }

  public async putStateRootBatchEntries(
    entries: StateRootBatchEntry[]
  ): Promise<void> {
    if (entries.length === 0) {
      return
    }

    await this._putBatch(`batch:stateroot:index`, entries)
    await this.db.put(
      `batch:stateroot:latest`,
      entries[entries.length - 1].index
    )
  }

  public async putTransactionIndexByQueueIndex(
    index: number, queueIndex: number
  ): Promise<void> {
    await this.db.put(`ctc:enqueue:index:${index}`, queueIndex)
  }

  public async getTransactionIndexByQueueIndex(index: number): Promise<number> {
    try {
      return JSON.parse(await this.db.get(`ctc:enqueue:index:${index}`))
    } catch (e) {
      return null
    }
  }

  public async getEnqueueByIndex(index: number): Promise<EnqueueEntry> {
    return this._get(`enqueue:index`, index)
  }

  public async getTransactionByIndex(index: number): Promise<TransactionEntry> {
    return this._get(`transaction:index`, index)
  }

  public async getFullTransactionByIndex(
    index: number
  ): Promise<TransactionEntry> {
    const transaction = await this.getTransactionByIndex(index)
    if (transaction === null) {
      return null
    }

    if (transaction.queueOrigin === 'l1') {
      const enqueue = await this.getEnqueueByIndex(transaction.queueIndex)
      if (enqueue === null) {
        return null
      }

      return {
        ...transaction,
        ...{
          blockNumber: enqueue.blockNumber,
          timestamp: enqueue.timestamp,
          gasLimit: enqueue.gasLimit,
          target: enqueue.target,
          origin: enqueue.origin,
          data: enqueue.data,
        },
      }
    } else {
      return transaction
    }
  }

  public async getTransactionsByIndexRange(
    start: number,
    end: number
  ): Promise<TransactionEntry[]> {
    return this._values(`transaction:index`, start, end)
  }

  public async getFullTransactionsByIndexRange(
    start: number,
    end: number
  ): Promise<TransactionEntry[]> {
    const transactions = await this.getTransactionsByIndexRange(start, end)
    if (transactions === null) {
      return null
    }

    const fullTransactions = []
    for (const transaction of transactions) {
      if (transaction.queueOrigin === 'l1') {
        const enqueue = await this.getEnqueueByIndex(transaction.queueIndex)
        if (enqueue === null) {
          return null
        }

        fullTransactions.push({
          ...transaction,
          ...{
            blockNumber: enqueue.blockNumber,
            timestamp: enqueue.timestamp,
            gasLimit: enqueue.gasLimit,
            target: enqueue.target,
            origin: enqueue.origin,
            data: enqueue.data,
          },
        })
      } else {
        fullTransactions.push(transaction)
      }
    }

    return fullTransactions
  }

  public async getTransactionBatchByIndex(
    index: number
  ): Promise<TransactionBatchEntry> {
    return this._get(`batch:transaction:index`, index)
  }

  public async getStateRootByIndex(index: number): Promise<StateRootEntry> {
    return this._get(`stateroot:index`, index)
  }

  public async getStateRootsByIndexRange(
    start: number,
    end: number
  ): Promise<StateRootEntry[]> {
    return this._values(`stateroot:index`, start, end)
  }

  public async getStateRootBatchByIndex(
    index: number
  ): Promise<StateRootBatchEntry> {
    return this._get(`batch:stateroot:index`, index)
  }

  public async getLatestEnqueue(): Promise<EnqueueEntry> {
    return this.getEnqueueByIndex(await this.db.get(`enqueue:latest`))
  }

  public async getLatestTransaction(): Promise<TransactionEntry> {
    return this.getTransactionByIndex(await this.db.get(`transaction:latest`))
  }

  public async getLatestFullTransaction(): Promise<TransactionEntry> {
    return this.getFullTransactionByIndex(
      await this.db.get(`transaction:latest`)
    )
  }

  public async getLatestTransactionBatch(): Promise<TransactionBatchEntry> {
    return this.getTransactionBatchByIndex(
      await this.db.get(`batch:transaction:latest`)
    )
  }

  public async getLatestStateRoot(): Promise<StateRootEntry> {
    return this.getStateRootByIndex(await this.db.get(`stateroot:latest`))
  }

  public async getLatestStateRootBatch(): Promise<StateRootBatchEntry> {
    return this.getStateRootBatchByIndex(
      await this.db.get(`batch:stateroot:latest`)
    )
  }

  public async getHighestSyncedL1Block(): Promise<number> {
    try {
      return BigNumber.from(await this.db.get(`synced:highest`)).toNumber()
    } catch (err) {
      return null
    }
  }

  public async setHighestSyncedL1Block(block: number): Promise<void> {
    return this.db.put(`synced:highest`, block)
  }

  private async _values(
    key: string,
    start: number,
    end: number
  ): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) => {
      const entries: any[] = []
      this.db
        .createValueStream({
          gte: this._makeKey(key, start),
          lt: this._makeKey(key, end),
        })
        .on('data', (transaction: string) => {
          entries.push(JSON.parse(transaction))
        })
        .on('error', (err: any) => {
          resolve(null)
        })
        .on('close', () => {
          // TODO: Close vs end? Need to double check later.
          resolve(entries)
        })
        .on('end', () => {
          resolve(entries)
        })
    })
  }

  private async _get(key: string, index: number): Promise<any> {
    try {
      return JSON.parse(await this.db.get(this._makeKey(key, index)))
    } catch (err) {
      return null
    }
  }

  private async _putBatch(key: string, elements: any[]): Promise<void> {
    return this.db.batch(
      elements.map((element) => {
        return {
          type: 'put',
          key: this._makeKey(key, element.index),
          value: JSON.stringify(element),
        }
      })
    )
  }

  private _makeKey(key: string, index: number): string {
    return `${key}:${BigNumber.from(index).toString().padStart(32, '0')}`
  }
}
