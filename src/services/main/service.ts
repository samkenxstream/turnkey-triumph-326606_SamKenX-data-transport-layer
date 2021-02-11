/* Imports: External */
import level from 'level'
import { BaseService } from '@eth-optimism/service-base'

/* Imports: Internal */
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
    db: any
    l1IngestionService: L1IngestionService
    l1TransportServer: L1TransportServer
  } = {} as any

  protected async _init(): Promise<void> {
    this.state.db = level(this.options.db)
    await this.state.db.open()

    this.state.l1IngestionService = new L1IngestionService({
      ...this.options,
      db: this.state.db,
    })

    this.state.l1TransportServer = new L1TransportServer({
      ...this.options,
      db: this.state.db,
    })

    await this.state.l1IngestionService.init()
    await this.state.l1TransportServer.init()
  }

  protected async _start(): Promise<void> {
    await Promise.all([
      this.state.l1IngestionService.start(),
      this.state.l1TransportServer.start(),
    ])
  }

  protected async _stop(): Promise<void> {
    await Promise.all([
      this.state.l1IngestionService.stop(),
      this.state.l1TransportServer.stop(),
    ])

    await this.state.db.close()
  }
}
