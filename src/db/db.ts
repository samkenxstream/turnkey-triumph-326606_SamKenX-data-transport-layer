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
    return this._get(`enqueue:index:${index}`)
  }

  public async getTransactionByIndex(index: number): Promise<TransactionEntry> {
    return await this._get(`transaction:index:${index}`)
  }

  public async getTransactionBatchByIndex(
    index: number
  ): Promise<TransactionBatchEntry> {
    return this._get(`batch:transaction:index:${index}`)
  }

  public async getStateRootByIndex(index: number): Promise<StateRootEntry> {
    return this._get(`stateroot:index:${index}`)
  }

  public async getStateRootBatchByIndex(
    index: number
  ): Promise<StateRootBatchEntry> {
    return this._get(`batch:stateroot:index:${index}`)
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

  private async _get(key: string): Promise<any> {
    return JSON.parse(await this.db.get(key))
  }

  private async _putBatch(key: string, elements: any[]): Promise<void> {
    return this.db.batch(
      elements.map((element) => {
        return {
          type: 'put',
          key: `${key}:${element.index}`,
          value: JSON.stringify(element),
        }
      })
    )
  }
}
