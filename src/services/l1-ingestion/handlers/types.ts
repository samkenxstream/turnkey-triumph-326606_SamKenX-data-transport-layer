import { TransportDB } from '../../../db/transport-db'
import { TypedEthersEvent } from '../../../types'

export interface FixEventsHandler<TEvent, TExtraData> {
  (events: TypedEthersEvent<any>[]): Promise<
    (TEvent & {
      extraData: TExtraData
    })[]
  >
}

export interface ParseEventsHandler<TEvent, TExtraData, TDatabaseStruct> {
  (
    events: (TEvent & {
      extraData: TExtraData
    })[]
  ): Promise<TDatabaseStruct[]>
}

export interface StoreEventsHandler<TDatabaseStruct> {
  (entries: TDatabaseStruct[], db: TransportDB): Promise<void>
}

export interface EventHandlerSet<TEvent, TExtraData, TDatabaseStruct> {
  fixEventsHandler: FixEventsHandler<TEvent, TExtraData>
  parseEventsHandler: ParseEventsHandler<TEvent, TExtraData, TDatabaseStruct>
  storeEventsHandler: StoreEventsHandler<TDatabaseStruct>
}
