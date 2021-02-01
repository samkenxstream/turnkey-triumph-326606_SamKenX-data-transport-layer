/* Imports: External */
import { BigNumber } from 'ethers'

export interface EnqueueEntry {
  index: number
  target: string
  data: string
  gasLimit: number
  origin: string
  blockNumber: number
  timestamp: number
}

export interface TransactionEntry {
  index: number
  batchIndex: number
  data: string
  blockNumber: number
  timestamp: number
  gasLimit: number
  target: string
  origin: string
  decoded:
    | {
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
    | {}

  chainElement: {
    isSequenced: boolean
    queueIndex: number
    timestamp: number
    blockNumber: number
    txData: string
  }
}

export interface TransactionBatchEntry {
  index: number
  blockNumber: number
  timestamp: number
  submitter: string
  size: number
  root: string
  prevTotalElements: number
  extraData: string
}

export interface StateRootEntry {
  index: number
  batchIndex: number
  value: string
}

export interface StateRootBatchEntry {
  index: number
  blockNumber: number
  timestamp: number
  submitter: string
  size: number
  root: string
  prevTotalElements: number
  extraData: string
}

export type EnqueueResponse = EnqueueEntry

export interface TransactionResponse {
  batch: TransactionBatchEntry
  transaction: TransactionEntry
}

export interface TransactionBatchResponse {
  batch: TransactionBatchEntry
  transactions: TransactionEntry[]
}

export interface StateRootResponse {
  batch: StateRootBatchEntry
  stateRoot: StateRootEntry
}

export interface StateRootBatchResponse {
  batch: StateRootBatchEntry
  stateRoots: StateRootEntry[]
}

export class TransportDB {
  constructor(public db: any) {}

  public async putEnqueueEntries(entries: EnqueueEntry[]): Promise<void> {
    return this._putBatch(`enqueue:index`, entries)
  }

  public async putTransactionEntries(
    entries: TransactionEntry[]
  ): Promise<void> {
    return this._putBatch(`transaction:index`, entries)
  }

  public async putTransactionBatchEntries(
    entries: TransactionBatchEntry[]
  ): Promise<void> {
    return this._putBatch(`batch:transaction:index`, entries)
  }

  public async putStateRootEntries(entries: StateRootEntry[]): Promise<void> {
    return this._putBatch(`stateroot:index`, entries)
  }

  public async putStateRootBatchEntries(
    entries: StateRootBatchEntry[]
  ): Promise<void> {
    return this._putBatch(`batch:stateroot:index`, entries)
  }

  public async getEnqueueByIndex(index: number): Promise<EnqueueEntry> {
    return this._get(`enqueue:index`, index)
  }

  public async getTransactionByIndex(index: number): Promise<TransactionEntry> {
    return this._get(`transaction:index`, index)
  }

  public async getTransactionsByIndexRange(
    start: number,
    end: number
  ): Promise<TransactionEntry[]> {
    return this._values(`transaction:index`, start, end)
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

  public async getLastScannedEventBlock(event: string): Promise<number> {
    try {
      return BigNumber.from(
        await this.db.get(`event:latest:${event}`)
      ).toNumber()
    } catch (err) {
      return null
    }
  }

  public async putLastScannedEventBlock(
    event: string,
    block: number
  ): Promise<void> {
    return this.db.put(`event:latest:${event}`, block)
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
          reject(err)
        })
        .on('close', () => {
          resolve(entries)
        })
        .on('end', () => {
          resolve(entries)
        })
    })
  }

  private async _get(key: string, index: number): Promise<any> {
    return JSON.parse(await this.db.get(this._makeKey(key, index)))
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
