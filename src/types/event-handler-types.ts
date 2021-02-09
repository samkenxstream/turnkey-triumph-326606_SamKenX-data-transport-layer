import { JsonRpcProvider } from '@ethersproject/providers'
import { TransportDB } from '../db/transport-db'
import { TypedEthersEvent } from './event-types'

export type FixEventsHandler<TEvent, TExtraData> = (
  event: TypedEthersEvent<any>,
  l1RpcProvider: JsonRpcProvider
) => Promise<{
  event: TEvent
  extraData: TExtraData
}>

export type ParseEventsHandler<
  TEvent,
  TExtraData,
  TDatabaseStruct
> = (fixedEvent: {
  event: TEvent
  extraData: TExtraData
}) => Promise<TDatabaseStruct>

export type StoreEventsHandler<TDatabaseStruct> = (
  entry: TDatabaseStruct,
  db: TransportDB
) => Promise<void>

export interface EventHandlerSet<TEvent, TExtraData, TDatabaseStruct> {
  fixEventsHandler: FixEventsHandler<TEvent, TExtraData>
  parseEventsHandler: ParseEventsHandler<TEvent, TExtraData, TDatabaseStruct>
  storeEventsHandler: StoreEventsHandler<TDatabaseStruct>
}
