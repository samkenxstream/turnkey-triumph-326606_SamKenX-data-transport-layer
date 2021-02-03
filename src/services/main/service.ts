import level from 'level'
import { BaseService } from '@eth-optimism/service-base'

import {
  L1IngestionService,
  L1IngestionServiceOptions,
} from '../l1-ingestion/service'
import { L1TransportServer, L1TransportServerOptions } from '../server/service'

type L1DataTransportServiceOptions = L1IngestionServiceOptions &
  L1TransportServerOptions

export class L1DataTransportService extends BaseService<L1DataTransportServiceOptions> {
  protected name = 'L1 Data Transport Service'

  private state: {
    l1IngestionService: L1IngestionService
    l1TransportServer: L1TransportServer
  } = {} as any

  protected async _init(): Promise<void> {
    const db = level(this.options.db)
    this.state.l1IngestionService = new L1IngestionService({
      ...this.options,
      db,
    })

    this.state.l1TransportServer = new L1TransportServer({
      ...this.options,
      db,
    })
  }

  protected async _start(): Promise<void> {
    await Promise.all([
      this.state.l1IngestionService.start(),
      this.state.l1TransportServer.start(),
    ])
  }
}
